import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  onInterrupt?: () => void;
  // Image generation callbacks
  onImageGenerate?: (prompt: string) => Promise<string>;
  onImageDismiss?: () => void;
  // Web search callback
  onWebSearch?: (query: string) => Promise<string>;
  // Past chat search callback
  onSearchPastChats?: (query: string) => Promise<string>;
}

// Singleton WebSocket instance to prevent duplicates
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalSessionId: string | null = null;

// Tool calls in flight to prevent duplicate executions
// Now uses Map with timestamps for automatic cleanup
const toolCallsInFlight = new Map<string, number>();
const TOOL_CALL_TIMEOUT_MS = 60000; // 60 seconds max for any tool call

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
  
  // Check for repeated characters (e.g., "aaaaaaa")
  if (/(.)\1{4,}/.test(text)) return true;
  
  // Check for repeated words 3+ times (e.g., "said said said")
  if (/(\b\w+\b)\s+\1\s+\1/i.test(text)) return true;
  
  // Check for mostly non-alphabetic content
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  if (alphaRatio < 0.3 && text.length > 5) return true;
  
  return false;
};

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  
  // Use refs for callbacks to avoid recreating handlers
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Send function call result back to the session
  const sendFunctionResult = useCallback((callId: string, result: string) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log('Sending function result:', { callId, result });
    
    // Send the function call output
    globalWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result
      }
    }));
    
    // Trigger a response so the AI reacts to the result
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
        // Just log - NO status changes, NO voice-based interruption
        // Mic is controlled separately - this is just VAD for turn detection
        console.log('VAD: User speech detected (no auto-interrupt)');
        break;

      case 'input_audio_buffer.speech_stopped':
        // Just log - status will change when response starts/ends
        console.log('VAD: User speech stopped');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const userTranscript = event.transcript || '';
        
        // Filter out garbled/stuttered transcriptions
        if (isGarbledTranscription(userTranscript)) {
          console.warn('Ignoring garbled transcription:', userTranscript);
          return;
        }
        
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
        
        // Check if there's a pending image to attach to this turn
        const { lastGeneratedImageUrl, attachImageToLastAssistantTurn } = useVoiceModeStore.getState();
        
        addConversationTurn({
          role: 'assistant',
          transcript: aiTranscript,
          timestamp: new Date(),
          imageUrl: lastGeneratedImageUrl || undefined // Attach image if one was just generated
        });
        
        // Clear the pending image after attaching
        if (lastGeneratedImageUrl) {
          useVoiceModeStore.getState().setLastGeneratedImageUrl(null);
        }
        break;

      case 'response.audio.delta':
        // Audio data from AI - ALWAYS play it (no voice-based interruption)
        // Only manual interrupt button can stop playback
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
          
          // Clean up any stale tool calls before checking
          cleanupStaleToolCalls();

          // Guard against duplicate tool calls
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
              console.log('Generating image with prompt:', prompt);
              
              // Call the image generation callback
              if (optionsRef.current.onImageGenerate) {
                optionsRef.current.onImageGenerate(prompt)
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
            // Unknown tool - clean up
            cleanupToolCall();
          }
        }
        break;

      case 'response.done':
        // Response complete - back to listening
        setStatus('listening');
        setCurrentTranscript('');
        // Clear audio buffer to prevent leftover audio bleeding into next turn
        clearAudioBuffer();
        break;

      case 'error':
        // Ignore harmless errors like trying to cancel when nothing is playing
        if (event.error?.code === 'response_cancel_not_active') {
          console.log('No active response to cancel (harmless)');
          return;
        }
        
        // Check if this is a transient/recoverable error (don't crash voice mode)
        const isTransientError = 
          event.error?.message?.includes('Connection to AI service failed') ||
          event.error?.message?.includes('timeout') ||
          event.error?.message?.includes('rate limit') ||
          event.error?.code === 'function_call_error';
        
        if (isTransientError) {
          console.warn('Transient server error (voice mode continues):', event.error);
          // Don't call onError for transient errors - voice mode stays active
          return;
        }
        
        console.error('Server error:', event.error);
        optionsRef.current.onError?.(event.error?.message || 'Server error');
        break;
    }
  }, [sendFunctionResult, clearAudioBuffer]);

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
            instructions: systemPrompt || `You're Arc - a calm, friendly voice assistant. Be warm, conversational, and genuine. Keep responses concise. When generating an image, say something casual and friendly first like "Hold on one sec while I whip that up for you" or "Let me create that for you real quick" before calling the generate_image function.`,
            voice: currentVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.75,           // Raised from 0.6 - requires louder/clearer speech (iOS fix)
              prefix_padding_ms: 500,    // Raised from 400 - more buffer before detecting speech
              silence_duration_ms: 1200, // Raised from 800 - wait longer before ending turn
              create_response: true
            },
            // Register image generation tools
            tools: [
              {
                type: 'function',
                name: 'generate_image',
                description: 'Generate an image based on user description. Use when user asks to create, generate, show, draw, or make an image or picture of something.',
                parameters: {
                  type: 'object',
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'Detailed description of the image to generate'
                    }
                  },
                  required: ['prompt']
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
        globalWs = null;
        globalSessionId = null;
        toolCallsInFlight.clear(); // Clear stale tool calls on error
        optionsRef.current.onError?.('Connection error');
        setStatus('idle');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime');
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        toolCallsInFlight.clear(); // Clear all tool calls on close
        setIsConnected(false);
        setStatus('idle');
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      globalConnecting = false;
      globalWs = null;
      globalSessionId = null;
      toolCallsInFlight.clear(); // Clear stale tool calls on connection failure
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
    toolCallsInFlight.clear(); // Clear all tool calls on disconnect
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
