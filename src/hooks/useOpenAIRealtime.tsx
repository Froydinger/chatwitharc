import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  onInterrupt?: () => void;
}

// Singleton WebSocket instance to prevent duplicates
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalSessionId: string | null = null;

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  
  // Use refs for callbacks to avoid recreating handlers
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const handleServerEvent = useCallback((event: any) => {
    const { setStatus, setCurrentTranscript, addConversationTurn } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
        // Prevent duplicate session handling
        if (globalSessionId === event.session?.id) {
          console.log('Duplicate session.created event, ignoring');
          return;
        }
        globalSessionId = event.session?.id;
        console.log('Session created:', globalSessionId);
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking - check if AI was speaking (interrupt)
        const { status: currentStatus } = useVoiceModeStore.getState();
        if (currentStatus === 'speaking') {
          console.log('User interrupted AI - cancelling response');
          // Cancel the current AI response
          if (globalWs?.readyState === WebSocket.OPEN) {
            globalWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
          // Notify listeners to clear audio
          optionsRef.current.onInterrupt?.();
        }
        setStatus('listening');
        break;

      case 'input_audio_buffer.speech_stopped':
        setStatus('thinking');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const userTranscript = event.transcript || '';
        if (!userTranscript.trim()) return;
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
        const { currentTranscript } = useVoiceModeStore.getState();
        setCurrentTranscript(currentTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
        // AI finished speaking transcript
        const aiTranscript = event.transcript || '';
        if (!aiTranscript.trim()) return;
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

  const connect = useCallback(async (systemPrompt?: string) => {
    const { setStatus, selectedVoice } = useVoiceModeStore.getState();
    
    // Strict duplicate prevention using global state
    if (globalWs?.readyState === WebSocket.OPEN) {
      console.log('Already connected to OpenAI Realtime (global check)');
      setIsConnected(true);
      setStatus('listening');
      return;
    }
    
    if (globalWs?.readyState === WebSocket.CONNECTING || globalConnecting) {
      console.log('Already connecting to OpenAI Realtime (global check)');
      return;
    }

    // Close any existing connection first
    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }

    globalConnecting = true;
    globalSessionId = null;
    setStatus('connecting');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co";
      const wsUrl = supabaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      
      const ws = new WebSocket(`${wsUrl}/functions/v1/openai-realtime-proxy`);
      globalWs = ws;

      ws.onopen = () => {
        console.log('Connected to OpenAI Realtime proxy');
        globalConnecting = false;
        setIsConnected(true);
        setStatus('listening');
        
        // Get fresh voice selection
        const { selectedVoice: currentVoice } = useVoiceModeStore.getState();
        
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: systemPrompt || `You're Arc, a chill AI buddy who talks like an actual human - not some corporate robot. Keep it real, use casual language, contractions, and yeah, throw in some slang when it fits. Be warm, funny, a little playful. Short responses are better - nobody wants a lecture. React naturally like "oh nice!" or "wait really?" or "hmm let me think..." You can say "I dunno" instead of "I don't know" and "gonna" instead of "going to". Match the vibe of whoever you're talking to. Be genuine, be curious, be you.`,
            voice: currentVoice,
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
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        optionsRef.current.onError?.('Connection error');
        setStatus('idle');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime');
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        setIsConnected(false);
        setStatus('idle');
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      globalConnecting = false;
      globalWs = null;
      globalSessionId = null;
      optionsRef.current.onError?.('Failed to connect to voice service');
      setStatus('idle');
    }
  }, [handleServerEvent]);

  const disconnect = useCallback(() => {
    const { setStatus } = useVoiceModeStore.getState();
    
    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }
    globalConnecting = false;
    globalSessionId = null;
    setIsConnected(false);
    setStatus('idle');
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    const bytes = new Uint8Array(audioData.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);
    
    globalWs.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
  }, []);

  const updateVoice = useCallback((voice: VoiceName) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log('Updating voice to:', voice);
    globalWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        voice: voice
      }
    }));
  }, []);

  // Sync connection state
  useEffect(() => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      setIsConnected(true);
    }
  }, []);

  const cancelResponse = useCallback(() => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log('Manually cancelling AI response');
    globalWs.send(JSON.stringify({ type: 'response.cancel' }));
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    sendAudio,
    updateVoice,
    cancelResponse
  };
}