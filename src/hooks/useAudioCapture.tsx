import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

interface UseAudioCaptureOptions {
  onAudioData?: (audioData: Int16Array) => void;
  onSpeechEnd?: (blob: Blob) => void;
  sampleRate?: number;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const { sampleRate = 24000 } = options;
  const optionsRef = useRef(options);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const getRecordedAudioBlob = useCallback((): Blob | null => {
    if (recordedChunksRef.current.length === 0) return null;
    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
    recordedChunksRef.current = [];
    return blob;
  }, []);

  const clearRecordedAudio = useCallback(() => {
    recordedChunksRef.current = [];
  }, []);
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const { setInputAmplitude } = useVoiceModeStore();

  const lastKeyPressRef = useRef<number>(0);
  const hasSpokenInTurnRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      lastKeyPressRef.current = Date.now();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
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

      // Start MediaRecorder for Whisper STT blob capture
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      } catch (e) {
        console.warn('MediaRecorder not supported or failed to start:', e);
      }

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
        // Mic gating - only capture when ready to listen
        // IMPORTANT: Removed app visibility check to allow iOS PWA background conversations
        const { isMuted, status, isGeneratingImage, isSearching, isAudioPlaying } = useVoiceModeStore.getState();
        
        // Only capture audio when ALL of these are true:
        // - Not muted by user
        // - Status is listening, or output audio is playing so the user can
        //   naturally interrupt Arc mid-sentence (barge-in)
        // - No image generation in progress
        // - No web search in progress
        // Browser echo cancellation plus server VAD filters Arc's own output.
        // Note: We intentionally do NOT check document.visibilityState here
        // so that iOS PWA can continue voice conversations in background
        // Only capture audio when status is listening or speaking (barge-in enabled for Realtime)
        const canListenForSpeech = status === 'listening' || status === 'speaking' || isAudioPlaying;
        const shouldCapture =
          !isMuted &&
          canListenForSpeech &&
          !isGeneratingImage &&
          !isSearching;
        
        if (!shouldCapture) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Calculate RMS energy for noise gating & silence detection
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);

        // Turn-by-Turn VAD Silence Detection
        if (rms > 0.025) {
          hasSpokenInTurnRef.current = true;
          lastSpeechTimeRef.current = Date.now();
        } else if (hasSpokenInTurnRef.current && status === 'listening') {
          const silenceDuration = Date.now() - lastSpeechTimeRef.current;
          if (silenceDuration > 1200) {
            console.log('🎙️ VAD: Speech ended (1.2s silence) — finishing turn...');
            hasSpokenInTurnRef.current = false;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              try { mediaRecorderRef.current.requestData(); } catch (_) {}
            }
            setTimeout(() => {
              const blob = getRecordedAudioBlob();
              if (blob && blob.size > 0 && optionsRef.current.onSpeechEnd) {
                optionsRef.current.onSpeechEnd(blob);
              }
            }, 120);
          }
        }

        // Low-energy noise gate: drop ambient room hum, breathing, quiet coughs
        if (rms < 0.018) {
          return;
        }

        const timeSinceKeyPress = Date.now() - lastKeyPressRef.current;
        // Keyboard noise filter: ignore key-click audio frames when typing
        if (timeSinceKeyPress < 350 && rms < 0.055) {
          return;
        }

        // Convert Float32 to Int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        optionsRef.current.onAudioData?.(int16Data);
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

    } catch (error: any) {
      console.error('Failed to start audio capture:', error);
      setHasPermission(false);

      // Re-throw with a human-readable message so callers can surface it clearly
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        const enriched = new Error(
          'Microphone access was denied. Please allow microphone access in your browser settings. ' +
          'On Mac, also check System Settings > Privacy & Security > Microphone.'
        );
        enriched.name = 'NotAllowedError';
        throw enriched;
      } else if (error.name === 'NotFoundError') {
        const enriched = new Error('No microphone found. Please connect a microphone and try again.');
        enriched.name = 'NotFoundError';
        throw enriched;
      }

      throw error;
    }
  }, [sampleRate, setInputAmplitude, handleVisibilityChange]);

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
    stopCapture,
    getRecordedAudioBlob,
    clearRecordedAudio,
  };
}
