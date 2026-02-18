import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

interface UseAudioPlaybackOptions {
  sampleRate?: number;
}

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
  const lastSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
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
    
    if (analyserRef.current) {
      source.connect(analyserRef.current);
    } else {
      source.connect(audioContext.destination);
    }
    
    // Schedule gapless playback
    const now = audioContext.currentTime;
    const startTime = Math.max(now, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
    
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
      if (isInterruptedRef.current) {
        setIsPlaying(false);
        setIsAudioPlaying(false);
        isPlayingRef.current = false;
        return;
      }
      
      // Only mark playback done if this was the last scheduled source
      if (lastSourceRef.current === source && audioQueueRef.current.length === 0) {
        currentSourceRef.current = null;
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

  const clearQueue = useCallback(() => {
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

    // Stop currently playing audio source immediately
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Source might already be stopped
      }
      currentSourceRef.current = null;
    }

    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsAudioPlaying(false); // Ensure store state is also reset
    setOutputAmplitude(0);

    // Reset interrupted flag after a short delay to allow new responses
    // Store timeout ref so it can be cancelled if needed
    interruptTimeoutRef.current = setTimeout(() => {
      isInterruptedRef.current = false;
      interruptTimeoutRef.current = null;
    }, 100);
  }, [setOutputAmplitude, setIsAudioPlaying]);

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

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Source might already be stopped
      }
      currentSourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
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
    stopPlayback
  };
}
