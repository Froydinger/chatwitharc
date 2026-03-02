import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName, REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  onInterrupt?: () => void;
  onImageGenerate?: (prompt: string, aspectRatio?: string) => Promise<string>;
  onImageDismiss?: () => void;
  onWebSearch?: (query: string) => Promise<string>;
  onSearchPastChats?: (query: string) => Promise<string>;
}

// Singleton WebSocket instance to prevent duplicates
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalSessionId: string | null = null;

// Track whether user has genuinely spoken since the last AI response
let userSpokeAfterLastResponse = false;

// Track whether we received a real (non-garbled, non-empty) transcription
let hasRealTranscription = false;

// Track when we explicitly request a response via sendFunctionResult
let awaitingToolResponse = false;

// Auto-reconnect state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let lastSystemPrompt: string | null = null;

// Delayed phantom guard timer — gives Whisper time to confirm real speech
let phantomCheckTimer: ReturnType<typeof setTimeout> | null = null;

// Tool calls in flight to prevent duplicate executions
const toolCallsInFlight = new Map<string, number>();
const TOOL_CALL_TIMEOUT_MS = 60000;

// Cleanup stale tool calls periodically
const cleanupStaleToolCalls = () => {
  const now = Date.now();
  for (const [callId, timestamp] of toolCallsInFlight.entries()) {
    if (now - timestamp > TOOL_CALL_TIMEOUT_MS) {
      console.warn('Cleaning up stale tool call:', callId);
      toolCallsInFlight.delete(callId);
    }
  }
};

// Helper to detect garbled/stuttered transcription
const isGarbledTranscription = (text: string): boolean => {
  if (!text || text.length < 2) return true;
  if (/(.)\1{4,}/.test(text)) return true;
  if (/(\b\w+\b)\s+\1\s+\1/i.test(text)) return true;
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  if (alphaRatio < 0.3 && text.length > 5) return true;
  return false;
};

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Send function call result back to the session
  const sendFunctionResult = useCallback((callId: string, result: string) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log('Sending function result:', { callId, result });
    
    globalWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result
      }
    }));
    
    awaitingToolResponse = true;
    
    globalWs.send(JSON.stringify({
      type: 'response.create'
    }));
  }, []);

  // Clear audio buffer to prevent leftover audio from previous turns
  const clearAudioBuffer = useCallback(() => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      console.log('Clearing input audio buffer');
      globalWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    }
  }, []);

  const handleServerEvent = useCallback((event: any) => {
    const { setStatus, setCurrentTranscript, addConversationTurn } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
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
        console.log('VAD: User speech detected');
        userSpokeAfterLastResponse = true;
        useVoiceModeStore.getState().setHasPendingSpeech(true);
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('VAD: User speech stopped');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        const userTranscript = event.transcript || '';
        
        if (isGarbledTranscription(userTranscript)) {
          console.warn('Ignoring garbled transcription:', userTranscript);
          return;
        }
        
        console.log('User said:', userTranscript);
        setCurrentTranscript(userTranscript);
        
        if (userTranscript.trim()) {
          hasRealTranscription = true;
          // Clear phantom timer — Whisper confirmed real speech
          if (phantomCheckTimer) {
            clearTimeout(phantomCheckTimer);
            phantomCheckTimer = null;
            console.log('Phantom timer cleared — real transcription confirmed');
          }
          addConversationTurn({
            role: 'user',
            transcript: userTranscript,
            timestamp: new Date()
          });
        }
        optionsRef.current.onTranscriptUpdate?.(userTranscript, true);
        break;

      case 'response.audio_transcript.delta':
        setStatus('speaking');
        const partialTranscript = event.delta || '';
        const { currentTranscript } = useVoiceModeStore.getState();
        setCurrentTranscript(currentTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
        const aiTranscript = event.transcript || '';
        if (!aiTranscript.trim()) return;
        console.log('AI said:', aiTranscript);
        
        const { lastGeneratedImageUrl } = useVoiceModeStore.getState();
        
        addConversationTurn({
          role: 'assistant',
          transcript: aiTranscript,
          timestamp: new Date(),
          imageUrl: lastGeneratedImageUrl || undefined
        });
        
        if (lastGeneratedImageUrl) {
          useVoiceModeStore.getState().setLastGeneratedImageUrl(null);
        }
        break;

      case 'response.audio.delta':
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

      case 'response.output_item.done':
        // Check for function calls with deduplication guard
        if (event.item?.type === 'function_call') {
          const { name, call_id, arguments: argsStr } = event.item;
          
          cleanupStaleToolCalls();

          if (toolCallsInFlight.has(call_id)) {
            console.log('Tool call already in flight, ignoring:', call_id);
            return;
          }
          toolCallsInFlight.set(call_id, Date.now());
          console.log('Function call received:', { name, call_id, argsStr });

          const cleanupToolCall = () => {
            toolCallsInFlight.delete(call_id);
          };
          
          if (name === 'generate_image') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const prompt = args.prompt || '';
              const aspectRatio = args.aspect_ratio || '1:1';
              console.log('Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
              
              if (optionsRef.current.onImageGenerate) {
                optionsRef.current.onImageGenerate(prompt, aspectRatio)
                  .then(() => {
                    console.log('Image generated successfully');
                    sendFunctionResult(call_id, JSON.stringify({ 
                      success: true, 
                      message: `Image generated and displayed to user. Describe what you created based on: "${prompt}"`
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Image generation failed:', error);
                    sendFunctionResult(call_id, JSON.stringify({ 
                      success: false, 
                      error: error.message || 'Failed to generate image'
                    }));
                    cleanupToolCall();
                  });
              } else {
                sendFunctionResult(call_id, JSON.stringify({ 
                  success: false, 
                  error: 'Image generation not available'
                }));
                cleanupToolCall();
              }
            } catch (e) {
              console.error('Failed to parse function args:', e);
              sendFunctionResult(call_id, JSON.stringify({ 
                success: false, 
                error: 'Invalid function arguments'
              }));
              cleanupToolCall();
            }
          } else if (name === 'close_image') {
            console.log('Closing image');
            optionsRef.current.onImageDismiss?.();
            sendFunctionResult(call_id, JSON.stringify({ 
              success: true, 
              message: 'Image closed successfully'
            }));
            cleanupToolCall();
          } else if (name === 'web_search') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const query = args.query || '';
              console.log('Performing web search for:', query);

              if (optionsRef.current.onWebSearch) {
                optionsRef.current.onWebSearch(query)
                  .then((results) => {
                    console.log('Web search completed');
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      results: results
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Web search failed:', error);
                    sendFunctionResult(call_id, JSON.stringify({
                      success: false,
                      error: error.message || 'Failed to search'
                    }));
                    cleanupToolCall();
                  });
              } else {
                sendFunctionResult(call_id, JSON.stringify({
                  success: false,
                  error: 'Web search not available'
                }));
                cleanupToolCall();
              }
            } catch (e) {
              console.error('Failed to parse web search args:', e);
              sendFunctionResult(call_id, JSON.stringify({
                success: false,
                error: 'Invalid search query'
              }));
              cleanupToolCall();
            }
          } else if (name === 'search_past_chats') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const query = args.query || '';
              console.log('Searching past chats for:', query);

              if (optionsRef.current.onSearchPastChats) {
                optionsRef.current.onSearchPastChats(query)
                  .then((results) => {
                    console.log('Past chat search completed');
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      context: results
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Past chat search failed:', error);
                    sendFunctionResult(call_id, JSON.stringify({
                      success: false,
                      error: error.message || 'Failed to search past chats'
                    }));
                    cleanupToolCall();
                  });
              } else {
                sendFunctionResult(call_id, JSON.stringify({
                  success: false,
                  error: 'Past chat search not available'
                }));
                cleanupToolCall();
              }
            } catch (e) {
              console.error('Failed to parse past chat search args:', e);
              sendFunctionResult(call_id, JSON.stringify({
                success: false,
                error: 'Invalid search query'
              }));
              cleanupToolCall();
            }
          } else {
            cleanupToolCall();
          }
        }
        break;

      case 'response.created':
        // Allow tool-triggered responses through the phantom guard
        if (awaitingToolResponse) {
          console.log('Allowing tool-triggered response through phantom guard');
          awaitingToolResponse = false;
          break;
        }
        
        // If we already have confirmed transcription, allow immediately
        if (hasRealTranscription) {
          console.log('Allowing response — real transcription confirmed');
          break;
        }
        
        // No speech detected at all — cancel immediately
        if (!userSpokeAfterLastResponse) {
          console.log('Cancelling phantom response — no speech detected and no transcription');
          if (globalWs?.readyState === WebSocket.OPEN) {
            globalWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
          break;
        }
        
        // VAD fired but no transcription yet — start delayed verification
        // Give Whisper 2 seconds to confirm real speech before cancelling
        console.log('VAD detected speech but no transcription yet — starting 2s phantom timer');
        if (phantomCheckTimer) clearTimeout(phantomCheckTimer);
        phantomCheckTimer = setTimeout(() => {
          phantomCheckTimer = null;
          if (!hasRealTranscription) {
            console.log('Phantom timer expired — no transcription arrived, cancelling response');
            if (globalWs?.readyState === WebSocket.OPEN) {
              globalWs.send(JSON.stringify({ type: 'response.cancel' }));
            }
          }
        }, 2000);
        break;

      case 'response.done':
        setCurrentTranscript('');
        
        // Clear phantom timer
        if (phantomCheckTimer) {
          clearTimeout(phantomCheckTimer);
          phantomCheckTimer = null;
        }
        
        // Only reset speech flags on COMPLETED responses, not cancelled ones.
        const responseStatus = event.response?.status;
        if (responseStatus !== 'cancelled') {
          userSpokeAfterLastResponse = false;
          hasRealTranscription = false;
          useVoiceModeStore.getState().setHasPendingSpeech(false);
          clearAudioBuffer();
        } else {
          console.log('Response was cancelled — keeping speech flags intact');
        }
        
        // Only transition to listening if audio has finished playing.
        const { isActive: stillActive, isAudioPlaying: audioStillPlaying } = useVoiceModeStore.getState();
        if (stillActive && !audioStillPlaying) {
          setStatus('listening');
        }
        break;

      case 'error':
        if (event.error?.code === 'response_cancel_not_active') {
          console.log('No active response to cancel (harmless)');
          return;
        }
        
        const isTransientError = 
          event.error?.message?.includes('Connection to AI service failed') ||
          event.error?.message?.includes('timeout') ||
          event.error?.message?.includes('rate limit') ||
          event.error?.code === 'function_call_error' ||
          event.error?.code === 'session_update_error' ||
          event.error?.code === 'invalid_value' ||
          event.error?.code === 'cannot_update_voice' ||
          event.error?.message?.includes('session.update') ||
          event.error?.message?.includes('Cannot update a conversation');
        
        if (isTransientError) {
          console.warn('Transient server error (voice mode continues):', event.error);
          return;
        }
        
        console.error('Server error:', event.error);
        optionsRef.current.onError?.(event.error?.message || 'Server error');
        break;
    }
  }, [sendFunctionResult, clearAudioBuffer]);

  const connect = useCallback(async (systemPrompt?: string) => {
    const { setStatus, selectedVoice } = useVoiceModeStore.getState();
    
    if (systemPrompt) lastSystemPrompt = systemPrompt;
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
      let didOpen = false;
      
      // Get auth token for WebSocket authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Not authenticated - cannot connect to voice mode');
        setStatus('idle');
        globalConnecting = false;
        optionsRef.current.onError?.('Please sign in to use Voice Mode.');
        return;
      }
      
      const ws = new WebSocket(
        `${wsUrl}/functions/v1/openai-realtime-proxy`,
        ['bearer.' + encodeURIComponent(session.access_token)]
      );
      globalWs = ws;

      const connectTimeout = setTimeout(() => {
        if (!didOpen && ws.readyState !== WebSocket.OPEN) {
          console.error('Voice WebSocket connection timeout');
          ws.close();
          globalConnecting = false;
          const { isActive } = useVoiceModeStore.getState();
          if (isActive) {
            optionsRef.current.onError?.('Voice connection timed out. Please try again.');
          }
        }
      }, 12000);

      ws.onopen = () => {
        didOpen = true;
        clearTimeout(connectTimeout);
        console.log('Connected to OpenAI Realtime proxy');
        globalConnecting = false;
        reconnectAttempts = 0;
        setIsConnected(true);
        setStatus('listening');
        
        // Periodic cleanup of stale tool calls during long sessions
        const cleanupInterval = setInterval(() => cleanupStaleToolCalls(), 30000);
        ws.addEventListener('close', () => clearInterval(cleanupInterval));
        
        // Get fresh voice selection, fallback to cedar if not realtime-compatible
        const { selectedVoice: currentVoice } = useVoiceModeStore.getState();
        const safeVoice = REALTIME_SUPPORTED_VOICES.includes(currentVoice) ? currentVoice : 'cedar';
        
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: systemPrompt || `You're Arc - a calm, friendly voice assistant. Be warm, conversational, and genuine. Keep responses concise. CRITICAL RULE: NEVER speak unless the user has spoken first. Do NOT say things like "no rush", "take your time", "I'm here whenever you're ready", or any filler when there is silence. Simply wait quietly until the user speaks. When generating an image, say something casual and friendly first like "Hold on one sec while I whip that up for you" or "Let me create that for you real quick" before calling the generate_image function.`,
            voice: safeVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.85,
              prefix_padding_ms: 600,
              silence_duration_ms: 1500,
              create_response: true
            },
            tools: [
                {
                type: 'function',
                name: 'generate_image',
                description: 'Generate an image based on user description. Use when user asks to create, generate, show, draw, or make an image or picture of something. ALWAYS pay attention to size/shape requests - "wide", "widescreen", "landscape", "banner" = 16:9. "Tall", "portrait", "vertical", "phone wallpaper" = 9:16. "Square" or no preference = 1:1.',
                parameters: {
                  type: 'object',
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'Detailed description of the image to generate'
                    },
                    aspect_ratio: {
                      type: 'string',
                      enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
                      description: 'REQUIRED aspect ratio. MUST be specified based on user request: "wide"/"widescreen"/"landscape"/"banner"/"cinematic" = "16:9". "tall"/"portrait"/"vertical"/"phone wallpaper" = "9:16". "square" or unspecified = "1:1". Listen carefully for size/shape words!'
                    }
                  },
                  required: ['prompt', 'aspect_ratio']
                }
              },
              {
                type: 'function',
                name: 'close_image',
                description: 'Close/dismiss the currently displayed image. Use when user says "close image", "no more", "done with the image", "we\'re done", etc.',
                parameters: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                type: 'function',
                name: 'web_search',
                description: 'Search the web for real-time information. Use when user asks about current events, news, recent movies, sports scores, weather, latest updates, breaking news, or anything that requires up-to-date information from the internet. IMPORTANT: Listen carefully to exact names - "Win the Night" is different from "Wind of Change". Repeat back the exact search term you heard before searching.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The EXACT search query the user spoke. Be very careful with names, titles, and proper nouns - transcribe them exactly as spoken.'
                    }
                  },
                  required: ['query']
                }
              },
              {
                type: 'function',
                name: 'search_past_chats',
                description: 'Search through all of the user\'s past conversation history to find relevant context, patterns, preferences, or information discussed before. Use when the user asks about something they mentioned previously, their preferences, interests, past topics, what they told you before, patterns in their behavior, or anything that requires looking back at conversation history. This searches ALL past chats, not just recent ones.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The topic, question, or information to search for in past conversations. Be specific about what you\'re looking for.'
                    }
                  },
                  required: ['query']
                }
              }
            ]
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
      };

      ws.onclose = (event) => {
        clearTimeout(connectTimeout);
        console.log('Disconnected from OpenAI Realtime:', event.code, event.reason || '(no reason)');
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        toolCallsInFlight.clear();
        setIsConnected(false);
        
        // If voice mode is still active, attempt auto-reconnect
        const { isActive, setStatus } = useVoiceModeStore.getState();
        if (isActive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`Auto-reconnecting voice mode (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          setStatus('connecting');
          setTimeout(() => {
            const { isActive: stillActive } = useVoiceModeStore.getState();
            if (stillActive) {
              connect(lastSystemPrompt || undefined);
            }
          }, 1000);
        } else if (isActive && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('Max reconnect attempts reached, deactivating voice mode');
          reconnectAttempts = 0;
          const detail = event.reason ? ` (${event.code}: ${event.reason})` : ` (${event.code})`;
          optionsRef.current.onError?.(`Voice connection lost${detail}. Please try again.`);
          setStatus('idle');
        } else {
          setStatus('idle');
        }
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      globalConnecting = false;
      globalWs = null;
      globalSessionId = null;
      toolCallsInFlight.clear();
      optionsRef.current.onError?.('Failed to connect to voice service');
      setStatus('idle');
    }
  }, [handleServerEvent]);

  const disconnect = useCallback(() => {
    const { setStatus } = useVoiceModeStore.getState();

    // Reset reconnect state — this is an intentional disconnect
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    
    // Clear phantom timer
    if (phantomCheckTimer) {
      clearTimeout(phantomCheckTimer);
      phantomCheckTimer = null;
    }
    
    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }
    globalConnecting = false;
    globalSessionId = null;
    toolCallsInFlight.clear();
    setIsConnected(false);
    setStatus('idle');
    
    // Reset after close event has fired
    setTimeout(() => { reconnectAttempts = 0; }, 100);
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    // Efficient base64 encoding — avoid per-byte string concatenation
    const bytes = new Uint8Array(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
    }
    const base64Audio = btoa(binary);
    
    globalWs.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
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

  // Commit the current audio buffer and trigger AI response
  const commitAudioAndRespond = useCallback(() => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    const { hasPendingSpeech, setHasPendingSpeech, setStatus } = useVoiceModeStore.getState();
    
    if (!hasPendingSpeech) {
      console.log('No pending speech to commit');
      return false;
    }
    
    console.log('Committing audio buffer and triggering response (mute handoff)');
    
    globalWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    globalWs.send(JSON.stringify({ type: 'response.create' }));
    
    setStatus('thinking');
    setHasPendingSpeech(false);
    
    return true;
  }, []);

  // Send an image to the conversation for vision analysis
  const sendImage = useCallback((base64Image: string, isLiveCamera: boolean = false) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log(`Sending ${isLiveCamera ? 'camera frame' : 'attached image'} to conversation`);
    
    globalWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_image',
          image_url: `data:image/jpeg;base64,${base64Image}`
        }]
      }
    }));
    
    if (!isLiveCamera) {
      globalWs.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    sendAudio,
    sendImage,
    cancelResponse,
    commitAudioAndRespond
  };
}
