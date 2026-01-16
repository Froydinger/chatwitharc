import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Use refs for callbacks to avoid recreating handlers
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  const { 
    setStatus, 
    setCurrentTranscript, 
    addConversationTurn,
    selectedVoice 
  } = useVoiceModeStore();

  const connect = useCallback(async (systemPrompt?: string) => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || connectingRef.current) {
      console.log('Already connected or connecting to OpenAI Realtime');
      return;
    }

    connectingRef.current = true;
    setStatus('connecting');

    try {
      // Connect to our WebSocket proxy edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co";
      const wsUrl = supabaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      
      const ws = new WebSocket(`${wsUrl}/functions/v1/openai-realtime-proxy`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to OpenAI Realtime proxy');
        connectingRef.current = false;
        setIsConnected(true);
        setStatus('listening');
        
        // Send session configuration
        ws.send(JSON.stringify({
          type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt || `You're Arc, a chill AI buddy who talks like an actual human - not some corporate robot. Keep it real, use casual language, contractions, and yeah, throw in some slang when it fits. Be warm, funny, a little playful. Short responses are better - nobody wants a lecture. React naturally like "oh nice!" or "wait really?" or "hmm let me think..." You can say "I dunno" instead of "I don't know" and "gonna" instead of "going to". Match the vibe of whoever you're talking to. Be genuine, be curious, be you.`,
            voice: selectedVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerEvent(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectingRef.current = false;
        optionsRef.current.onError?.('Connection error');
        setStatus('idle');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime');
        connectingRef.current = false;
        setIsConnected(false);
        setStatus('idle');
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      connectingRef.current = false;
      optionsRef.current.onError?.('Failed to connect to voice service');
      setStatus('idle');
    }
  }, [selectedVoice, setStatus]);

  const handleServerEvent = useCallback((event: any) => {
    const { setStatus, setCurrentTranscript, addConversationTurn, currentTranscript } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
        console.log('Session created:', event.session?.id);
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        setStatus('listening');
        break;

      case 'input_audio_buffer.speech_stopped':
        setStatus('thinking');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const userTranscript = event.transcript || '';
        console.log('User said:', userTranscript);
        setCurrentTranscript(userTranscript);
        addConversationTurn({
          role: 'user',
          transcript: userTranscript,
          timestamp: new Date()
        });
        optionsRef.current.onTranscriptUpdate?.(userTranscript, true);
        break;

      case 'response.audio_transcript.delta':
        // AI is speaking - partial transcript
        setStatus('speaking');
        const partialTranscript = event.delta || '';
        setCurrentTranscript(currentTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
        // AI finished speaking transcript
        const aiTranscript = event.transcript || '';
        console.log('AI said:', aiTranscript);
        addConversationTurn({
          role: 'assistant',
          transcript: aiTranscript,
          timestamp: new Date()
        });
        break;

      case 'response.audio.delta':
        // Audio data from AI
        if (event.delta) {
          const binaryString = atob(event.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const audioData = new Int16Array(bytes.buffer);
          optionsRef.current.onAudioData?.(audioData);
        }
        break;

      case 'response.done':
        // Response complete - back to listening
        setStatus('listening');
        setCurrentTranscript('');
        break;

      case 'error':
        console.error('Server error:', event.error);
        optionsRef.current.onError?.(event.error?.message || 'Server error');
        break;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setStatus('idle');
  }, [setStatus]);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    
    // Convert Int16Array to base64
    const bytes = new Uint8Array(audioData.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);
    
    wsRef.current.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
  }, []);

  const updateVoice = useCallback((voice: VoiceName) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'session.update',
      session: {
        voice: voice
      }
    }));
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    sendAudio,
    updateVoice
  };
}
