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
  
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { setOutputAmplitude, status } = useVoiceModeStore();

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });
      
      // Create analyser for output amplitude
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, [sampleRate]);

  const playAudioChunk = useCallback(async (audioData: Int16Array) => {
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
    
    if (analyserRef.current) {
      source.connect(analyserRef.current);
    } else {
      source.connect(audioContext.destination);
    }
    
    source.start();
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    source.onended = () => {
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
    if (isPlayingRef.current) {
      audioQueueRef.current.push(audioData);
    } else {
      playAudioChunk(audioData);
    }
  }, [playAudioChunk]);

  const clearQueue = useCallback(() => {
    audioQueueRef.current = [];
  }, []);

  const stopPlayback = useCallback(() => {
    clearQueue();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setOutputAmplitude(0);
  }, [clearQueue, setOutputAmplitude]);

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
