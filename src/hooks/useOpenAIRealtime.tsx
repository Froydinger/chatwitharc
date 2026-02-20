import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName, REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  onInterrupt?: () => void;
  // Image generation callbacks - now with aspect ratio support
  onImageGenerate?: (prompt: string, aspectRatio?: string) => Promise<string>;
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

// Track whether user has genuinely spoken since the last AI response
// Used to cancel phantom responses triggered by ambient noise
let userSpokeAfterLastResponse = false;

// Track whether we received a real (non-garbled, non-empty) transcription
// This is the authoritative check for the phantom guard — VAD alone is unreliable
let hasRealTranscription = false;

// Track when we explicitly request a response via sendFunctionResult
// so the phantom guard allows tool-triggered responses through
let awaitingToolResponse = false;

// Auto-reconnect state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let lastSystemPrompt: string | null = null;

// Voice swap state - debounce rapid voice changes
let voiceSwapInProgress = false;
let voiceSwapTimer: ReturnType<typeof setTimeout> | null = null;
let pendingVoiceSwap: VoiceName | null = null;
let isVoiceSwapReconnect = false; // Flag to trigger "new voice is ready" after reconnect
let waitingForVoiceIntro = false; // Track when we're waiting for the intro response to finish

// Safety timeout for voice swap — prevents picker from being permanently locked
let voiceSwapSafetyTimer: ReturnType<typeof setTimeout> | null = null;

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
    
    // Mark that we're awaiting a tool response so the phantom guard lets it through
    awaitingToolResponse = true;
    
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
        // User started speaking - mark that we have pending speech for mute-handoff
        console.log('VAD: User speech detected');
        userSpokeAfterLastResponse = true;
        useVoiceModeStore.getState().setHasPendingSpeech(true);
        break;

      case 'input_audio_buffer.speech_stopped':
        // Just log - status will change when response starts/ends
        console.log('VAD: User speech stopped');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const userTranscript = event.transcript || '';
        
        // Filter out garbled/stuttered transcriptions, but be more lenient
        if (isGarbledTranscription(userTranscript)) {
          console.warn('Ignoring garbled transcription:', userTranscript);
          return;
        }
        
        console.log('User said:', userTranscript);
        setCurrentTranscript(userTranscript);
        
        // Always add user turns to conversation (these get saved to chat history)
        if (userTranscript.trim()) {
          hasRealTranscription = true;
          addConversationTurn({
            role: 'user',
            transcript: userTranscript,
            timestamp: new Date()
          });
        }
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
              const aspectRatio = args.aspect_ratio || '1:1';
              console.log('Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
              
              // Call the image generation callback with aspect ratio
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
            // Unknown tool - clean up
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
        // Allow voice swap intro responses through the phantom guard
        if (waitingForVoiceIntro) {
          console.log('Allowing voice intro response through phantom guard');
          break;
        }
        // Guard against phantom responses triggered by ambient noise
        // Use BOTH flags: userSpokeAfterLastResponse (VAD detected speech) OR
        // hasRealTranscription (Whisper confirmed real words). We need the VAD flag
        // because transcription often arrives AFTER response.created.
        if (!userSpokeAfterLastResponse && !hasRealTranscription) {
          console.log('Cancelling phantom response - no speech detected and no transcription');
          if (globalWs?.readyState === WebSocket.OPEN) {
            globalWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
        }
        break;

      case 'response.done':
        setCurrentTranscript('');
        
        // Only reset speech flags on COMPLETED responses, not cancelled ones.
        // Cancelled responses (from phantom guard) shouldn't clear the flags
        // because the user may still be speaking / about to speak.
        const responseStatus = event.response?.status;
        if (responseStatus !== 'cancelled') {
          userSpokeAfterLastResponse = false;
          hasRealTranscription = false;
          useVoiceModeStore.getState().setHasPendingSpeech(false);
          clearAudioBuffer();
        } else {
          console.log('Response was cancelled — keeping speech flags intact');
        }
        
        // If we were waiting for voice intro to finish, defer unlock until audio drains
        if (waitingForVoiceIntro) {
          waitingForVoiceIntro = false;
          const { isAudioPlaying: introAudioPlaying } = useVoiceModeStore.getState();
          if (!introAudioPlaying) {
            // Audio already finished, unlock immediately
            useVoiceModeStore.getState().setIsVoiceSwapping(false);
            if (voiceSwapSafetyTimer) { clearTimeout(voiceSwapSafetyTimer); voiceSwapSafetyTimer = null; }
            console.log('Voice intro finished (audio done), swap complete — picker unlocked');
          } else {
            // Audio still playing — wait for it to drain before unlocking
            console.log('Voice intro response done, waiting for audio playback to finish...');
            const unsub = useVoiceModeStore.subscribe((state) => {
              if (!state.isAudioPlaying) {
                useVoiceModeStore.getState().setIsVoiceSwapping(false);
                if (voiceSwapSafetyTimer) { clearTimeout(voiceSwapSafetyTimer); voiceSwapSafetyTimer = null; }
                console.log('Voice intro audio drained, swap complete — picker unlocked');
                unsub();
              }
            });
          }
        }
        
        // Only transition to listening if audio has finished playing.
        // If audio is still playing, useAudioPlayback will handle the transition
        // when the queue drains -- this prevents the waveform from flatlining.
        const { isActive: stillActive, isAudioPlaying: audioStillPlaying } = useVoiceModeStore.getState();
        if (stillActive && !audioStillPlaying) {
          setStatus('listening');
        }
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
          event.error?.code === 'function_call_error' ||
          event.error?.code === 'session_update_error' ||
          event.error?.code === 'invalid_value' ||
          event.error?.code === 'cannot_update_voice' ||
          event.error?.message?.includes('session.update') ||
          event.error?.message?.includes('Cannot update a conversation');
        
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
    
    // Store system prompt for reconnection
    if (systemPrompt) lastSystemPrompt = systemPrompt;
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
        reconnectAttempts = 0; // Reset on successful connection
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
              threshold: 0.85,            // High threshold to avoid ambient noise triggers
              prefix_padding_ms: 600,     // More buffer before detecting speech
              silence_duration_ms: 1500,  // Wait longer before ending turn
              create_response: true
            },
            // Register image generation tools
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
        
        // If this is a voice swap reconnect, trigger "new voice is ready" confirmation
        if (isVoiceSwapReconnect) {
          isVoiceSwapReconnect = false;
          voiceSwapInProgress = false;
          waitingForVoiceIntro = true; // Mark that we're waiting for the intro to finish
          // Small delay to let session init complete before triggering response
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text: '[System: Voice changed. Say exactly "Okay, my new voice is ready!" in a natural, friendly way. Keep it short.]' }]
                }
              }));
              ws.send(JSON.stringify({ type: 'response.create' }));
            }
          }, 500);
        }
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
        // Don't immediately deactivate voice mode on WebSocket errors
        // Let onclose handle reconnection logic instead
        globalConnecting = false;
      };

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime');
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        toolCallsInFlight.clear();
        setIsConnected(false);
        
        // If this close was triggered by a voice swap, do nothing --
        // the voice swap setTimeout will handle reconnecting
        if (voiceSwapInProgress || isVoiceSwapReconnect) {
          console.log('WebSocket closed for voice swap, reconnect handled externally');
          return;
        }
        
        // If voice mode is still active, attempt auto-reconnect
        const { isActive } = useVoiceModeStore.getState();
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
          optionsRef.current.onError?.('Voice connection lost. Please try again.');
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
      toolCallsInFlight.clear(); // Clear stale tool calls on connection failure
      optionsRef.current.onError?.('Failed to connect to voice service');
      setStatus('idle');
    }
  }, [handleServerEvent]);

  const disconnect = useCallback(() => {
    const { setStatus } = useVoiceModeStore.getState();

    // Reset reconnect state — this is an intentional disconnect
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect on close
    
    // Cancel any pending voice swap
    voiceSwapInProgress = false;
    isVoiceSwapReconnect = false;
    waitingForVoiceIntro = false;
    pendingVoiceSwap = null;
    useVoiceModeStore.getState().setIsVoiceSwapping(false);
    if (voiceSwapSafetyTimer) { clearTimeout(voiceSwapSafetyTimer); voiceSwapSafetyTimer = null; }
    if (voiceSwapTimer) {
      clearTimeout(voiceSwapTimer);
      voiceSwapTimer = null;
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
    
    // Suppress mic input during voice swap so user can't interrupt the intro
    const { isVoiceSwapping } = useVoiceModeStore.getState();
    if (isVoiceSwapping) return;
    
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

  const updateVoice = useCallback((voice: VoiceName, announce: boolean = true) => {
    const safeVoice = REALTIME_SUPPORTED_VOICES.includes(voice) ? voice : 'cedar';
    console.log('Voice swap requested:', safeVoice, 'announce:', announce);
    
    // Debounce rapid voice changes - only execute the last one
    pendingVoiceSwap = safeVoice;
    
    if (voiceSwapTimer) {
      clearTimeout(voiceSwapTimer);
    }
    
    voiceSwapTimer = setTimeout(() => {
      const voiceToSwap = pendingVoiceSwap;
      pendingVoiceSwap = null;
      voiceSwapTimer = null;
      
      if (!voiceToSwap || voiceSwapInProgress) {
        console.log('Voice swap skipped (already in progress or no pending swap)');
        return;
      }
      
      // Set the voice in the store so connect() picks it up
      useVoiceModeStore.getState().setSelectedVoice(voiceToSwap);
      
      // If not connected, nothing to reconnect
      if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        console.log('Not connected, voice will apply on next connect');
        return;
      }
      
      voiceSwapInProgress = true;
      // Only announce ("my new voice is ready") when explicitly requested (mid-convo swap)
      isVoiceSwapReconnect = announce;
      if (announce) {
        useVoiceModeStore.getState().setIsVoiceSwapping(true);
        // Safety timeout: force-unlock picker if swap doesn't complete in 8s
        if (voiceSwapSafetyTimer) clearTimeout(voiceSwapSafetyTimer);
        voiceSwapSafetyTimer = setTimeout(() => {
          console.warn('Voice swap safety timeout — force-unlocking picker');
          useVoiceModeStore.getState().setIsVoiceSwapping(false);
          waitingForVoiceIntro = false;
          voiceSwapInProgress = false;
          voiceSwapSafetyTimer = null;
        }, 8000);
      }
      console.log('Performing voice swap disconnect→reconnect for:', voiceToSwap, announce ? '(with announcement)' : '(silent)');
      
      // Close existing connection (onclose will see voiceSwapInProgress and skip error logic)
      if (globalWs) {
        globalWs.close();
        globalWs = null;
      }
      globalConnecting = false;
      globalSessionId = null;
      toolCallsInFlight.clear();
      
      // Reset reconnect state and reconnect with voice swap flag
      setTimeout(() => {
        reconnectAttempts = 0;
        const { isActive } = useVoiceModeStore.getState();
        if (isActive) {
          connect(lastSystemPrompt || undefined);
        } else {
          voiceSwapInProgress = false;
          isVoiceSwapReconnect = false;
        }
      }, 300);
    }, 400); // 400ms debounce for rapid clicks
  }, [connect]);

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
  // Used for "mute to handoff" - user mutes mic to signal end of turn
  const commitAudioAndRespond = useCallback(() => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    const { hasPendingSpeech, setHasPendingSpeech, setStatus } = useVoiceModeStore.getState();
    
    if (!hasPendingSpeech) {
      console.log('No pending speech to commit');
      return false;
    }
    
    console.log('Committing audio buffer and triggering response (mute handoff)');
    
    // Commit the audio buffer (tells OpenAI the user is done speaking)
    globalWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    
    // Trigger a response
    globalWs.send(JSON.stringify({ type: 'response.create' }));
    
    // Update status to thinking while we wait
    setStatus('thinking');
    setHasPendingSpeech(false);
    
    return true;
  }, []);

  // Send an image to the conversation for vision analysis
  const sendImage = useCallback((base64Image: string, isLiveCamera: boolean = false) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log(`Sending ${isLiveCamera ? 'camera frame' : 'attached image'} to conversation`);
    
    // Create a user message with the image
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
    
    // If it's a single attachment (not live camera), trigger a response
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
    updateVoice,
    cancelResponse,
    commitAudioAndRespond
  };
}
