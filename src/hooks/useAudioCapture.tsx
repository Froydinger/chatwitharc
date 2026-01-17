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
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const { setInputAmplitude } = useVoiceModeStore();
  
  // Resume AudioContext when app returns from background (iOS/Android)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible' && audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        console.log('Resuming AudioContext after background');
        audioContextRef.current.resume().catch(console.error);
      }
    }
  }, []);

  const startCapture = useCallback(async () => {
    try {
      // Detect iOS for specific audio constraints
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      // Request microphone permission with platform-optimized settings
      // iOS Safari requires different constraint format
      const audioConstraints: MediaTrackConstraints = isIOS
        ? {
            // iOS Safari format - use ideal objects
            channelCount: { ideal: 1 },
            sampleRate: { ideal: sampleRate },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
          }
        : {
            // Standard format for other browsers
            channelCount: 1,
            sampleRate: sampleRate,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      
      console.log(`Audio capture started (iOS: ${isIOS})`);

      mediaStreamRef.current = stream;
      setHasPermission(true);

      // Create audio context
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;
      
      // Add visibility change listener to resume context when app returns from background
      visibilityHandlerRef.current = handleVisibilityChange;
      document.addEventListener('visibilitychange', handleVisibilityChange);

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
        // COMPREHENSIVE mic gating - only capture when explicitly LISTENING
        // and not during any operation that could cause unwanted behavior
        const { isMuted, status, isGeneratingImage, isSearching, isAudioPlaying } = useVoiceModeStore.getState();
        
        // Only capture audio when ALL of these are true:
        // - Not muted
        // - Status is 'listening' (not speaking, thinking, connecting, or idle)
        // - No image generation in progress
        // - No web search in progress
        // - No audio currently playing
        const shouldCapture = 
          !isMuted && 
          status === 'listening' && 
          !isGeneratingImage && 
          !isSearching && 
          !isAudioPlaying;
        
        if (!shouldCapture) return;
        
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

    // Remove visibility change listener
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
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
