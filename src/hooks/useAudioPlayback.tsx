import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

interface UseAudioPlaybackOptions {
  sampleRate?: number;
}

// Click/pop suppression. Raw PCM chunks that start or stop mid-waveform snap
// the speaker cone, which iOS renders as an audible pop. These are short enough
// to be inaudible as a fade but long enough to land on a zero crossing.
const FADE_IN_SECONDS = 0.008;   // ramp up when audio starts after silence/a gap
const FADE_OUT_SECONDS = 0.014;  // ramp down before an interrupt or teardown
const BARGE_IN_DUCK_SECONDS = 0.025;
const BARGE_IN_RESTORE_SECONDS = 0.04;
const SILENCE_GAIN = 0.0001;     // exponential ramps cannot target exactly 0
// Small scheduling lead so normal network jitter does not starve the graph
// mid-sentence (an underrun is a gap, and a gap is a pop).
const START_LEAD_SECONDS = 0.06;

const holdGainAtCurrentValue = (gain: AudioParam, time: number) => {
  if (typeof gain.cancelAndHoldAtTime === 'function') {
    gain.cancelAndHoldAtTime(time);
    return;
  }
  gain.cancelScheduledValues(time);
  gain.setValueAtTime(Math.max(gain.value, SILENCE_GAIN), time);
};

export function useAudioPlayback(options: UseAudioPlaybackOptions = {}) {
  const { sampleRate = 24000 } = options;
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isInterruptedRef = useRef(false);
  const interruptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const masterGainRef = useRef<GainNode | null>(null);
  // Where the current burst of speech started on the audio clock, and how much
  // audio has been scheduled for it. The Realtime API needs the milliseconds
  // actually played when the user interrupts, so it can drop the rest from the
  // conversation instead of believing it was all heard.
  const utteranceStartRef = useRef<number>(0);
  const scheduledMsRef = useRef<number>(0);
  const lastSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Track active sources for cleanup.
  // IMPORTANT: Do NOT aggressively evict scheduled sources while they're still pending,
  // or long responses can get audibly truncated mid-sentence.
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { setOutputAmplitude, setIsAudioPlaying, status } = useVoiceModeStore();
  
  // Resume AudioContext when app returns from background (iOS/Android)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          console.log('Resuming playback AudioContext after background');
          audioContextRef.current.resume().catch(console.error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityHandlerRef.current = handleVisibilityChange;
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate });
      
      // Create analyser for output amplitude
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);

      // Everything plays through one gain node so interrupts can fade the whole
      // graph out instead of hard-stopping sources mid-waveform.
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime);
      masterGainRef.current.connect(analyserRef.current);
      
      // Set up MediaSession for background audio support on iOS/Android
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Voice Mode',
          artist: 'Arc',
          album: 'Voice Conversation',
        });
        
        // Handle pause action (when user pauses from lock screen/control center)
        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('MediaSession: pause requested');
          // This will trigger through the interrupt mechanism
        });
        
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('MediaSession: play requested');
          // Resume if paused
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
          }
        });
      }
    }
    return audioContextRef.current;
  }, [sampleRate]);

  const scheduleChunk = useCallback((audioData: Int16Array) => {
    if (isInterruptedRef.current) return;
    
    const audioContext = initAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => {
        console.warn('Unable to resume playback AudioContext:', error);
      });
    }
    
    // Convert Int16 to Float32
    const float32Data = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      float32Data[i] = audioData[i] / (audioData[i] < 0 ? 0x8000 : 0x7FFF);
    }
    
    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);
    
    // Create source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    currentSourceRef.current = source;
    
    // Per-chunk gain, used only to soften the first chunk of a burst. Contiguous
    // chunks stay at unity so the stream itself is untouched — fading every chunk
    // would add an audible flutter at the chunk rate.
    const chunkGain = audioContext.createGain();
    source.connect(chunkGain);
    if (masterGainRef.current) {
      chunkGain.connect(masterGainRef.current);
    } else if (analyserRef.current) {
      chunkGain.connect(analyserRef.current);
    } else {
      chunkGain.connect(audioContext.destination);
    }
    
    // Schedule gapless playback. Browser audio can throw if the context is
    // closed/suspended during a reconnect or page lifecycle transition; contain
    // that so one bad chunk never crashes the whole app.
    try {
      const now = audioContext.currentTime;
      // A chunk we cannot start on time follows silence (stream start) or a
      // buffer underrun. Either way the waveform jumps from zero, so ease it in
      // and re-anchor with a little lead to avoid starving again immediately.
      const isDiscontinuous = nextStartTimeRef.current < now;
      const startTime = isDiscontinuous
        ? now + START_LEAD_SECONDS
        : nextStartTimeRef.current;

      if (isDiscontinuous && audioBuffer.duration > 0) {
        const fadeEnd = Math.min(startTime + FADE_IN_SECONDS, startTime + audioBuffer.duration);
        chunkGain.gain.setValueAtTime(SILENCE_GAIN, startTime);
        chunkGain.gain.exponentialRampToValueAtTime(1, fadeEnd);
      }

      if (!isPlayingRef.current && utteranceStartRef.current === 0) {
        utteranceStartRef.current = startTime;
        scheduledMsRef.current = 0;
      }

      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      scheduledMsRef.current += audioBuffer.duration * 1000;
    } catch (error) {
      console.warn('Failed to schedule voice audio chunk; dropping chunk:', error);
      try { source.disconnect(); } catch (_) {}
      try { chunkGain.disconnect(); } catch (_) {}
      return;
    }
    
    // Track active source for cleanup
    activeSourcesRef.current.add(source);
    
    
    if (!isPlayingRef.current) {
      setIsPlaying(true);
      setIsAudioPlaying(true);
      isPlayingRef.current = true;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    }
    
    // Track the last source to detect when all audio finishes
    lastSourceRef.current = source;
    source.onended = () => {
      // Remove from active tracking
      const wasActive = activeSourcesRef.current.delete(source);
      try { source.disconnect(); } catch (_) {}
      try { chunkGain.disconnect(); } catch (_) {}
      
      if (!wasActive) return;

      if (isInterruptedRef.current) {
        setIsPlaying(false);
        setIsAudioPlaying(false);
        isPlayingRef.current = false;
        return;
      }
      
      // Only mark playback done if this was the last scheduled source
      if (lastSourceRef.current === source && audioQueueRef.current.length === 0) {
        currentSourceRef.current = null;
        utteranceStartRef.current = 0;
        scheduledMsRef.current = 0;
        setIsPlaying(false);
        setIsAudioPlaying(false);
        isPlayingRef.current = false;
        
        const { status: currentStatus, isActive } = useVoiceModeStore.getState();
        if (isActive && currentStatus === 'speaking') {
          useVoiceModeStore.getState().setStatus('listening');
        }
        
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      }
    };
  }, [initAudioContext, sampleRate, setIsAudioPlaying]);

  // Milliseconds of the current response the user has actually heard. Never
  // more than what was scheduled — the server rejects a truncation point past
  // the real audio length.
  const getPlayedMs = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === 'closed' || utteranceStartRef.current === 0) return 0;
    const elapsed = (audioContext.currentTime - utteranceStartRef.current) * 1000;
    return Math.max(0, Math.min(Math.floor(elapsed), Math.floor(scheduledMsRef.current)));
  }, []);

  const queueAudio = useCallback((audioData: Int16Array) => {
    // Don't queue if interrupted
    if (isInterruptedRef.current) {
      return;
    }

    // With scheduled playback, we can directly schedule every chunk
    // The queue is only used as overflow protection
    const MAX_QUEUE_SIZE = 100;
    if (audioQueueRef.current.length >= MAX_QUEUE_SIZE) {
      console.warn('Audio queue full, dropping oldest chunk');
      audioQueueRef.current.shift();
    }

    // Schedule immediately - gapless scheduling handles timing
    scheduleChunk(audioData);
  }, [scheduleChunk]);

  const clearQueue = useCallback((): number => {
    const playedMs = getPlayedMs();

    // Clear any existing interrupt timeout to prevent race conditions
    if (interruptTimeoutRef.current) {
      clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = null;
    }

    // Set interrupted flag to prevent new audio from playing
    isInterruptedRef.current = true;
    audioQueueRef.current = [];
    nextStartTimeRef.current = 0;
    lastSourceRef.current = null;

    // Fade the graph out over a few milliseconds, then stop the sources at that
    // same moment. Stopping outright cuts the waveform at whatever amplitude it
    // happened to be at, which pops hard on iOS during barge-in.
    const ctx = audioContextRef.current;
    const masterGain = masterGainRef.current;
    const stopAt = ctx && ctx.state !== 'closed'
      ? ctx.currentTime + FADE_OUT_SECONDS
      : 0;

    if (ctx && masterGain && stopAt) {
      try {
        holdGainAtCurrentValue(masterGain.gain, ctx.currentTime);
        masterGain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, stopAt);
      } catch (_) {}
    }

    for (const src of activeSourcesRef.current) {
      try { src.stop(stopAt); } catch (_) {
        try { src.stop(); src.disconnect(); } catch (__) {}
      }
    }
    activeSourcesRef.current.clear();
    currentSourceRef.current = null;

    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsAudioPlaying(false); // Ensure store state is also reset
    setOutputAmplitude(0);

    // Reset interrupted flag after a short delay to allow new responses
    // Store timeout ref so it can be cancelled if needed
    utteranceStartRef.current = 0;
    scheduledMsRef.current = 0;

    interruptTimeoutRef.current = setTimeout(() => {
      isInterruptedRef.current = false;
      interruptTimeoutRef.current = null;
      // Restore the master level only once the fade-out has fully finished, so
      // the next response starts from a clean, silent graph.
      const activeCtx = audioContextRef.current;
      if (activeCtx && activeCtx.state !== 'closed' && masterGainRef.current) {
        try {
          masterGainRef.current.gain.cancelScheduledValues(activeCtx.currentTime);
          masterGainRef.current.gain.setValueAtTime(1, activeCtx.currentTime);
        } catch (_) {}
      }
    }, 100);

    return playedMs;
  }, [getPlayedMs, setOutputAmplitude, setIsAudioPlaying]);

  // Briefly silence Arc without destroying scheduled sources. Voice capture
  // uses this to distinguish a person continuing to speak from Arc's own
  // speaker echo before committing to a full interruption.
  const duckPlayback = useCallback(() => {
    const ctx = audioContextRef.current;
    const masterGain = masterGainRef.current;
    if (!ctx || ctx.state === 'closed' || !masterGain) return;
    try {
      holdGainAtCurrentValue(masterGain.gain, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, ctx.currentTime + BARGE_IN_DUCK_SECONDS);
    } catch (_) {}
  }, []);

  const restorePlayback = useCallback(() => {
    const ctx = audioContextRef.current;
    const masterGain = masterGainRef.current;
    if (!ctx || ctx.state === 'closed' || !masterGain || isInterruptedRef.current) return;
    try {
      holdGainAtCurrentValue(masterGain.gain, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + BARGE_IN_RESTORE_SECONDS);
    } catch (_) {}
  }, []);

  const stopPlayback = useCallback(() => {
    // Clear any pending interrupt timeout
    if (interruptTimeoutRef.current) {
      clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = null;
    }

    isInterruptedRef.current = true;
    audioQueueRef.current = [];
    nextStartTimeRef.current = 0;
    lastSourceRef.current = null;
    utteranceStartRef.current = 0;
    scheduledMsRef.current = 0;

    // Same fade-then-stop as an interrupt, then tear the context down once the
    // ramp has played out — closing a context mid-waveform pops too.
    const ctx = audioContextRef.current;
    const masterGain = masterGainRef.current;
    const stopAt = ctx && ctx.state !== 'closed'
      ? ctx.currentTime + FADE_OUT_SECONDS
      : 0;

    if (ctx && masterGain && stopAt) {
      try {
        holdGainAtCurrentValue(masterGain.gain, ctx.currentTime);
        masterGain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, stopAt);
      } catch (_) {}
    }

    for (const src of activeSourcesRef.current) {
      try { src.stop(stopAt); } catch (_) {
        try { src.stop(); src.disconnect(); } catch (__) {}
      }
    }
    activeSourcesRef.current.clear();
    currentSourceRef.current = null;

    if (ctx) {
      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, Math.ceil(FADE_OUT_SECONDS * 1000) + 40);
    }
    audioContextRef.current = null;
    masterGainRef.current = null;
    analyserRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setOutputAmplitude(0);

    // Reset interrupted flag so next session can play audio
    isInterruptedRef.current = false;
  }, [setOutputAmplitude]);

  // Update output amplitude when speaking
  useEffect(() => {
    if (status !== 'speaking') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setOutputAmplitude(0);
      return;
    }

    const updateAmplitude = () => {
      if (!analyserRef.current || status !== 'speaking') {
        setOutputAmplitude(0);
        return;
      }
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average amplitude (0-1)
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalized = average / 255;
      
      setOutputAmplitude(normalized);
      animationFrameRef.current = requestAnimationFrame(updateAmplitude);
    };
    
    updateAmplitude();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [status, setOutputAmplitude]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending interrupt timeout
      if (interruptTimeoutRef.current) {
        clearTimeout(interruptTimeoutRef.current);
        interruptTimeoutRef.current = null;
      }
      stopPlayback();
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    queueAudio,
    clearQueue,
    duckPlayback,
    restorePlayback,
    getPlayedMs,
    stopPlayback
  };
}
