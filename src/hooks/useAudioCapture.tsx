import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

interface UseAudioCaptureOptions {
  onAudioData?: (audioData: Int16Array) => void;
  sampleRate?: number;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const { sampleRate = 24000 } = options;
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const { setInputAmplitude } = useVoiceModeStore();

  const startCapture = useCallback(async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;
      setHasPermission(true);

      // Create audio context
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Create source from microphone
      const source = audioContext.createMediaStreamSource(stream);

      // Create analyser for amplitude visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Create script processor for raw audio data (fallback for browsers without AudioWorklet)
      const bufferSize = 4096;
      const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        // Check mute state from store
        const { isMuted } = useVoiceModeStore.getState();
        if (isMuted) return; // Don't send audio when muted
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        options.onAudioData?.(int16Data);
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      // Start amplitude monitoring
      const updateAmplitude = () => {
        if (!analyserRef.current) return;
        
        // Check mute state - show 0 amplitude when muted
        const { isMuted } = useVoiceModeStore.getState();
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average amplitude (0-1)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = isMuted ? 0 : average / 255;
        
        setInputAmplitude(normalized);
        animationFrameRef.current = requestAnimationFrame(updateAmplitude);
      };
      
      updateAmplitude();
      setIsCapturing(true);

    } catch (error) {
      console.error('Failed to start audio capture:', error);
      setHasPermission(false);
      throw error;
    }
  }, [sampleRate, options, setInputAmplitude]);

  const stopCapture = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    analyserRef.current = null;
    workletNodeRef.current = null;
    
    setIsCapturing(false);
    setInputAmplitude(0);
  }, [setInputAmplitude]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return {
    isCapturing,
    hasPermission,
    startCapture,
    stopCapture
  };
}
