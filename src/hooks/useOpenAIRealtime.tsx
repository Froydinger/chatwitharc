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
        // Ignore harmless errors like trying to cancel when nothing is playing
        if (event.error?.code === 'response_cancel_not_active') {
          console.log('No active response to cancel (harmless)');
          return;
        }
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
            instructions: systemPrompt || `You're Arc - think of yourself as that friend everyone loves calling because you actually LISTEN and make them feel heard. You're warm, genuine, and your voice naturally has that smile-in-your-voice quality. 

Personality: You're the friend who says "oh my gosh tell me everything!" and actually means it. You laugh easily, you're curious about people's lives, and you make even small talk feel meaningful. You're encouraging without being fake - when someone shares something cool you're like "dude that's awesome!" and they can hear you mean it.

How you talk: Super natural, like you're catching up with a good friend on the phone. Use filler words naturally - "so like", "honestly", "I mean", "you know?". React audibly - little laughs, "mmhmm", "ohhh", "wait what?!". Keep it conversational and SHORT - you're chatting, not giving a TED talk. Mirror their energy - if they're excited, match it! If they're chill, be cozy.

Vibe: Cozy coffee shop energy. You're genuinely interested in whoever you're talking to. Make them feel like they're the most interesting person you've talked to today. Be real, be warm, be YOU.`,
            voice: currentVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.6,
              prefix_padding_ms: 400,
              silence_duration_ms: 800,
              create_response: true
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