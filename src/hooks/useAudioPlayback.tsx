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
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { setOutputAmplitude, status } = useVoiceModeStore();
  
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
    }
    return audioContextRef.current;
  }, [sampleRate]);

  const playAudioChunk = useCallback(async (audioData: Int16Array) => {
    // Don't play if interrupted
    if (isInterruptedRef.current) {
      return;
    }
    
    const audioContext = initAudioContext();
    
    // Convert Int16 to Float32
    const float32Data = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      float32Data[i] = audioData[i] / (audioData[i] < 0 ? 0x8000 : 0x7FFF);
    }
    
    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);
    
    // Create and play source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    currentSourceRef.current = source;
    
    if (analyserRef.current) {
      source.connect(analyserRef.current);
    } else {
      source.connect(audioContext.destination);
    }
    
    source.start();
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    source.onended = () => {
      currentSourceRef.current = null;
      
      // Don't continue if interrupted
      if (isInterruptedRef.current) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }
      
      // Check if there's more audio in queue
      if (audioQueueRef.current.length > 0) {
        const nextChunk = audioQueueRef.current.shift()!;
        playAudioChunk(nextChunk);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    };
  }, [initAudioContext, sampleRate]);

  const queueAudio = useCallback((audioData: Int16Array) => {
    // Don't queue if interrupted
    if (isInterruptedRef.current) {
      return;
    }
    
    if (isPlayingRef.current) {
      audioQueueRef.current.push(audioData);
    } else {
      playAudioChunk(audioData);
    }
  }, [playAudioChunk]);

  const clearQueue = useCallback(() => {
    // Set interrupted flag to prevent new audio from playing
    isInterruptedRef.current = true;
    audioQueueRef.current = [];
    
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
    setOutputAmplitude(0);
    
    // Reset interrupted flag after a short delay to allow new responses
    setTimeout(() => {
      isInterruptedRef.current = false;
    }, 100);
  }, [setOutputAmplitude]);

  const stopPlayback = useCallback(() => {
    isInterruptedRef.current = true;
    audioQueueRef.current = [];
    
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
