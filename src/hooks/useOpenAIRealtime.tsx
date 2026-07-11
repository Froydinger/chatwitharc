import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName, REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  onInterrupt?: () => void;
  onImageGenerate?: (prompt: string, aspectRatio?: string) => Promise<string>;
  onImageRevise?: (prompt: string, aspectRatio?: string) => Promise<string>;
  onImageDismiss?: () => void;
  onWebSearch?: (query: string) => Promise<string>;
  onSearchPastChats?: (query: string) => Promise<string>;
  onGetWeather?: (location: string) => Promise<string>;
  onSaveMemory?: (memory: string, replaces?: string[]) => Promise<string>;
  onRecallMemory?: (query?: string) => Promise<string>;
  onDeleteMemory?: (keywords: string[]) => Promise<string>;
  // Called when a session expires so the controller can inject conversation
  // context into the fresh session's system prompt.
  onSessionExpired?: () => Promise<string | undefined>;
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
// Allow many reconnects — OpenAI Realtime sessions are capped at ~15–30 minutes,
// so a long voice chat WILL hit at least one forced disconnect. We must keep
// the overlay alive through it instead of tearing the user back to chat.
const MAX_RECONNECT_ATTEMPTS = 20;
let lastSystemPrompt: string | null = null;
let sessionReady = false; // Gate: true after session.created received

// Keepalive: OpenAI may idle-disconnect long sessions during silence or
// long-running tool calls. Send a lightweight ping every 20s.
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
// Watchdog: detect zombie WebSockets where the connection appears open
// but no server events have arrived in a long time. Forces a clean reconnect.
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let lastServerEventAt: number = 0;
const ZOMBIE_TIMEOUT_MS = 35000; // No server activity for 35s = zombie
// Cleanup interval reference (single source of truth — prevents duplicates on reconnect)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Proactive session refresh: OpenAI Realtime sessions expire after ~15 minutes.
// We schedule a reconnect at 13 minutes so the user never hits the hard limit.
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const PROACTIVE_REFRESH_MS = 13 * 60 * 1000; // 13 minutes

// Deterministic errors that should NOT trigger reconnect
const FATAL_ERROR_CODES = ['auth_failed', 'upstream_init_failed', 'invalid_api_key'];
const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';

// Delayed phantom guard timer — gives Whisper time to confirm real speech
let phantomCheckTimer: ReturnType<typeof setTimeout> | null = null;

// Transcript ordering buffer: smooth late events so turns stay strictly user→assistant
type QueuedTurn = {
  transcript: string;
  queuedAt: number;
  imageUrl?: string;
};

const TURN_ORDER_GRACE_MS = 220;
const TURN_FORCE_FLUSH_MS = 900;
let pendingUserTurns: QueuedTurn[] = [];
let pendingAssistantTurns: QueuedTurn[] = [];
let turnFlushTimer: ReturnType<typeof setTimeout> | null = null;

const resetTurnOrderingBuffer = () => {
  pendingUserTurns = [];
  pendingAssistantTurns = [];
  if (turnFlushTimer) {
    clearTimeout(turnFlushTimer);
    turnFlushTimer = null;
  }
};

const flushTurnOrderingBuffer = () => {
  if (turnFlushTimer) {
    clearTimeout(turnFlushTimer);
    turnFlushTimer = null;
  }

  const { addConversationTurn } = useVoiceModeStore.getState();
  const now = Date.now();

  // Preferred path: pair turns in sequence
  while (pendingUserTurns.length > 0 && pendingAssistantTurns.length > 0) {
    const userTurn = pendingUserTurns.shift();
    const assistantTurn = pendingAssistantTurns.shift();

    if (userTurn) {
      addConversationTurn({ role: 'user', transcript: userTurn.transcript, timestamp: new Date() });
    }

    if (assistantTurn) {
      addConversationTurn({
        role: 'assistant',
        transcript: assistantTurn.transcript,
        timestamp: new Date(),
        imageUrl: assistantTurn.imageUrl,
      });
    }
  }

  // Fallback path: flush stale unmatched turns
  while (pendingUserTurns.length > 0 && now - pendingUserTurns[0].queuedAt >= TURN_FORCE_FLUSH_MS) {
    const staleUserTurn = pendingUserTurns.shift();
    if (staleUserTurn) {
      addConversationTurn({ role: 'user', transcript: staleUserTurn.transcript, timestamp: new Date() });
    }
  }

  while (pendingAssistantTurns.length > 0 && now - pendingAssistantTurns[0].queuedAt >= TURN_FORCE_FLUSH_MS) {
    const staleAssistantTurn = pendingAssistantTurns.shift();
    if (staleAssistantTurn) {
      addConversationTurn({
        role: 'assistant',
        transcript: staleAssistantTurn.transcript,
        timestamp: new Date(),
        imageUrl: staleAssistantTurn.imageUrl,
      });
    }
  }

  // Keep draining if anything remains buffered
  if (pendingUserTurns.length > 0 || pendingAssistantTurns.length > 0) {
    turnFlushTimer = setTimeout(flushTurnOrderingBuffer, TURN_ORDER_GRACE_MS);
  }
};

const scheduleTurnFlush = () => {
  if (turnFlushTimer) {
    clearTimeout(turnFlushTimer);
  }
  turnFlushTimer = setTimeout(flushTurnOrderingBuffer, TURN_ORDER_GRACE_MS);
};

const forceFlushTurnOrderingBuffer = () => {
  if (turnFlushTimer) {
    clearTimeout(turnFlushTimer);
    turnFlushTimer = null;
  }

  const { addConversationTurn } = useVoiceModeStore.getState();
  while (pendingUserTurns.length > 0) {
    const turn = pendingUserTurns.shift();
    if (turn) addConversationTurn({ role: 'user', transcript: turn.transcript, timestamp: new Date() });
  }
  while (pendingAssistantTurns.length > 0) {
    const turn = pendingAssistantTurns.shift();
    if (turn) {
      addConversationTurn({
        role: 'assistant',
        transcript: turn.transcript,
        timestamp: new Date(),
        imageUrl: turn.imageUrl,
      });
    }
  }
};


type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

type VoiceDiagnosticPayload = {
  event_type: string;
  message?: string;
  session_id?: string | null;
  tool_name?: string;
  tool_call_id?: string;
  connection_state?: string;
  details?: Record<string, unknown>;
};

let cachedDiagnosticUserId: string | null = null;
let diagnosticWriteQueue: Promise<unknown> = Promise.resolve();

const getConnectionStateLabel = () => {
  const state = globalWs?.readyState;
  if (state === WebSocket.CONNECTING) return 'connecting';
  if (state === WebSocket.OPEN) return 'open';
  if (state === WebSocket.CLOSING) return 'closing';
  if (state === WebSocket.CLOSED) return 'closed';
  return 'none';
};

const sanitizeDiagnosticDetails = (value: unknown, depth = 0): unknown => {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDiagnosticDetails(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, sanitizeDiagnosticDetails(item, depth + 1)])
    );
  }
  return String(value);
};

const logVoiceDiagnostic = (payload: VoiceDiagnosticPayload) => {
  diagnosticWriteQueue = diagnosticWriteQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        if (!cachedDiagnosticUserId) {
          const { data: { user } } = await supabase.auth.getUser();
          cachedDiagnosticUserId = user?.id ?? null;
        }
        if (!cachedDiagnosticUserId) return;

        const details = sanitizeDiagnosticDetails({
          ...(payload.details || {}),
          url: window.location.pathname,
          visibility: document.visibilityState,
          online: navigator.onLine,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }) as Record<string, unknown>;

        await (supabase as any).from('voice_diagnostics').insert({
          user_id: cachedDiagnosticUserId,
          session_id: payload.session_id ?? globalSessionId,
          event_type: payload.event_type,
          message: payload.message,
          tool_name: payload.tool_name,
          tool_call_id: payload.tool_call_id,
          connection_state: payload.connection_state ?? getConnectionStateLabel(),
          details,
        });
      } catch (error) {
        console.warn('Voice diagnostic write failed:', error);
      }
    });
};

class VoiceToolTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceToolTimeoutError';
  }
}

const withToolTimeout = async <T,>(
  toolName: string,
  callId: string,
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new VoiceToolTimeoutError(`${toolName} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof VoiceToolTimeoutError) {
      logVoiceDiagnostic({
        event_type: 'tool_timeout',
        message: error.message,
        tool_name: toolName,
        tool_call_id: callId,
        details: { timeoutMs },
      });
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type PendingFunctionResult = {
  callId: string;
  result: string;
  reasoningEffort: ReasoningEffort;
  queuedAt: number;
};

// Tool calls in flight to prevent duplicate executions
const toolCallsInFlight = new Map<string, number>();
const TOOL_CALL_TIMEOUT_MS = 60000;
let activeToolCallId: string | null = null;
let queuedToolCalls: Array<{ name: string; call_id: string; arguments?: string }> = [];
const queuedToolCallIds = new Set<string>();

let responseInProgress = false;
let pendingFunctionResults: PendingFunctionResult[] = [];
let pendingFunctionResultCallIds = new Set<string>();
let pendingFunctionFlushTimer: ReturnType<typeof setTimeout> | null = null;

const deliverFunctionResult = (
  callId: string,
  result: string,
  reasoningEffort: ReasoningEffort = 'low'
): boolean => {
  const voiceState = useVoiceModeStore.getState();
  if (
    responseInProgress ||
    voiceState.hasPendingSpeech ||
    voiceState.status === 'thinking' ||
    voiceState.status === 'speaking'
  ) {
    queueFunctionResult(callId, result, reasoningEffort);
    return false;
  }

  if (!toolCallsInFlight.has(callId) && !pendingFunctionResultCallIds.has(callId)) {
    logVoiceDiagnostic({
      event_type: 'stale_tool_result_dropped',
      message: 'Tool result belonged to an old or closed realtime session',
      tool_call_id: callId,
      details: { resultLength: result.length, reasoningEffort },
    });
    return false;
  }

  if (globalWs?.readyState !== WebSocket.OPEN) {
    logVoiceDiagnostic({
      event_type: 'tool_result_dropped',
      message: 'WebSocket was not open when a tool result was ready',
      tool_call_id: callId,
      details: { resultLength: result.length, reasoningEffort },
    });
    return false;
  }

  console.log('Sending function result:', { callId, reasoningEffort });
  logVoiceDiagnostic({
    event_type: 'tool_result_sending',
    tool_call_id: callId,
    details: { resultLength: result.length, reasoningEffort, responseInProgress },
  });

  const outputSent = sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: callId,
      output: result,
    },
  });

  if (!outputSent) {
    logVoiceDiagnostic({
      event_type: 'tool_result_send_failed',
      message: 'Failed to send function_call_output to realtime session',
      tool_call_id: callId,
    });
    return false;
  }

  awaitingToolResponse = true;

  const responseCreateSent = sendRealtimeEvent({
    type: 'response.create',
    response: {
      reasoning: { effort: reasoningEffort },
    },
  });

  if (!responseCreateSent) {
    logVoiceDiagnostic({
      event_type: 'tool_response_create_failed',
      message: 'Failed to request realtime response after tool output',
      tool_call_id: callId,
    });
  } else {
    responseInProgress = true;
  }

  return responseCreateSent;
};

const flushPendingFunctionResults = (force = false) => {
  const voiceState = useVoiceModeStore.getState();
  const isUserTurnActive =
    voiceState.hasPendingSpeech ||
    voiceState.status === 'thinking' ||
    voiceState.status === 'speaking';

  if ((responseInProgress || isUserTurnActive) && !force) return;

  if (pendingFunctionFlushTimer) {
    clearTimeout(pendingFunctionFlushTimer);
    pendingFunctionFlushTimer = null;
  }

  while (pendingFunctionResults.length > 0 && (!responseInProgress || force)) {
    const item = pendingFunctionResults.shift();
    if (!item) break;
    pendingFunctionResultCallIds.delete(item.callId);
    logVoiceDiagnostic({
      event_type: force ? 'tool_result_force_flushed' : 'tool_result_flushed',
      tool_call_id: item.callId,
      details: { queuedMs: Date.now() - item.queuedAt, reasoningEffort: item.reasoningEffort },
    });
    const sent = deliverFunctionResult(item.callId, item.result, item.reasoningEffort);
    if (sent) break;
  }
};

const queueFunctionResult = (
  callId: string,
  result: string,
  reasoningEffort: ReasoningEffort = 'low'
) => {
  pendingFunctionResults = pendingFunctionResults.filter((item) => item.callId !== callId);
  pendingFunctionResults.push({ callId, result, reasoningEffort, queuedAt: Date.now() });
  pendingFunctionResultCallIds.add(callId);
  logVoiceDiagnostic({
    event_type: 'tool_result_queued',
    message: 'Tool result queued until current realtime response finishes',
    tool_call_id: callId,
    details: { resultLength: result.length, reasoningEffort },
  });

  if (pendingFunctionFlushTimer) clearTimeout(pendingFunctionFlushTimer);
  pendingFunctionFlushTimer = setTimeout(() => {
    logVoiceDiagnostic({
      event_type: 'tool_result_queue_retry',
      message: 'Retrying queued tool result after waiting for realtime turn to settle',
      details: { pendingCount: pendingFunctionResults.length, responseInProgress },
    });
    flushPendingFunctionResults(false);
    if (pendingFunctionResults.length > 0 && !pendingFunctionFlushTimer) {
      pendingFunctionFlushTimer = setTimeout(() => flushPendingFunctionResults(false), 5000);
    }
  }, 5000);
};

const resetPendingFunctionResults = () => {
  if (pendingFunctionFlushTimer) {
    clearTimeout(pendingFunctionFlushTimer);
    pendingFunctionFlushTimer = null;
  }
  pendingFunctionResults = [];
  pendingFunctionResultCallIds.clear();
  responseInProgress = false;
};

const resetToolCallQueue = () => {
  activeToolCallId = null;
  queuedToolCalls = [];
  queuedToolCallIds.clear();
};

const buildReconnectPrompt = async () => {
  try {
    const updatedPrompt = await optionsRefForReconnect?.current.onSessionExpired?.();
    if (updatedPrompt) lastSystemPrompt = updatedPrompt;
  } catch (error) {
    console.warn('Reconnect prompt refresh failed, using last prompt:', error);
    logVoiceDiagnostic({
      event_type: 'reconnect_prompt_failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return lastSystemPrompt || undefined;
};

let optionsRefForReconnect: { current: UseOpenAIRealtimeOptions } | null = null;

// Cleanup stale tool calls periodically
const cleanupStaleToolCalls = () => {
  const now = Date.now();
  for (const [callId, timestamp] of toolCallsInFlight.entries()) {
    if (now - timestamp > TOOL_CALL_TIMEOUT_MS) {
      console.warn('Cleaning up stale tool call:', callId);
      toolCallsInFlight.delete(callId);
      if (activeToolCallId === callId) activeToolCallId = null;
    }
  }
};

// Helper to detect garbled/stuttered transcription
const isGarbledTranscription = (text: string): boolean => {
  if (!text || text.length < 2) return true;
  // Filter very short "phantom" transcripts from noise/typing (e.g. "hmm", "uh", "you")
  const trimmed = text.trim();
  if (trimmed.length < 4) return true;
  if (/(.)\1{4,}/.test(text)) return true;
  if (/(\b\w+\b)\s+\1\s+\1/i.test(text)) return true;
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  if (alphaRatio < 0.3 && text.length > 5) return true;
  // Common phantom transcriptions from background noise
  const phantomPhrases = ['thank you', 'thanks', 'you', 'bye', 'hmm', 'um', 'uh', 'oh', 'the', 'a', 'i', 'it'];
  if (phantomPhrases.includes(trimmed.toLowerCase())) return true;
  return false;
};

// Clear all per-connection timers (keepalive, cleanup, proactive refresh)
const clearConnectionTimers = () => {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
};

const sendRealtimeEvent = (payload: Record<string, unknown>): boolean => {
  const ws = globalWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Realtime send failed; connection likely changed state:', error);
    return false;
  }
};

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
    optionsRefForReconnect = optionsRef;
  }, [options]);

  // Send function call result back to the session.
  // `reasoningEffort` lets specific tools opt into deeper thinking
  // (e.g. web search synthesis, past-chat lookup). Default 'low' keeps the
  // conversational flow snappy.
  const sendFunctionResult = useCallback((
    callId: string,
    result: string,
    reasoningEffort: ReasoningEffort = 'low'
  ) => {
    // Tool calls can finish while the model is talking or while the user is
    // interrupting. Queue until the turn is settled so Realtime never gets a
    // second response.create while it is already handling one.
    const voiceState = useVoiceModeStore.getState();
    if (
      responseInProgress ||
      voiceState.hasPendingSpeech ||
      voiceState.status === 'thinking' ||
      voiceState.status === 'speaking'
    ) {
      queueFunctionResult(callId, result, reasoningEffort);
      return;
    }

    deliverFunctionResult(callId, result, reasoningEffort);
  }, []);

  // Clear audio buffer to prevent leftover audio from previous turns
  const clearAudioBuffer = useCallback(() => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      console.log('Clearing input audio buffer');
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
    }
  }, []);

  const handleServerEvent = useCallback((event: any) => {
    lastServerEventAt = Date.now();
    const { setStatus, setCurrentTranscript } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
        if (globalSessionId === event.session?.id) {
          console.log('Duplicate session.created event, ignoring');
          return;
        }
        globalSessionId = event.session?.id;
        sessionReady = true;
        console.log('Session created:', globalSessionId);
        logVoiceDiagnostic({
          event_type: 'session_created',
          message: 'Realtime session created',
          session_id: globalSessionId,
          details: { model: event.session?.model },
        });
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('VAD: User speech detected');
        userSpokeAfterLastResponse = true;
        useVoiceModeStore.getState().setHasPendingSpeech(true);
        // Natural interruption: if AI is currently speaking, stop playback
        // immediately so the user isn't talked over. Server VAD has
        // interrupt_response:true so it will also cancel the response.
        try {
          optionsRef.current.onInterrupt?.();
        } catch (err) {
          console.warn('onInterrupt handler threw:', err);
        }
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
        
        if (userTranscript.trim()) {
          hasRealTranscription = true;
          if (phantomCheckTimer) {
            clearTimeout(phantomCheckTimer);
            phantomCheckTimer = null;
            console.log('Phantom timer cleared — real transcription confirmed');
          }
          pendingUserTurns.push({
            transcript: userTranscript,
            queuedAt: Date.now(),
          });
          scheduleTurnFlush();
        }
        optionsRef.current.onTranscriptUpdate?.(userTranscript, true);
        break;

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        setStatus('speaking');
        const partialTranscript = event.delta || '';
        // Accumulate AI transcript separately — reset on each new response
        const { currentTranscript: existingTranscript } = useVoiceModeStore.getState();
        setCurrentTranscript(existingTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        const aiTranscript = event.transcript || '';
        if (!aiTranscript.trim()) return;
        console.log('AI said:', aiTranscript);
        
        const { lastGeneratedImageUrl } = useVoiceModeStore.getState();

        pendingAssistantTurns.push({
          transcript: aiTranscript,
          queuedAt: Date.now(),
          imageUrl: lastGeneratedImageUrl || undefined,
        });

        if (lastGeneratedImageUrl) {
          useVoiceModeStore.getState().setLastGeneratedImageUrl(null);
        }

        scheduleTurnFlush();
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta':
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
          if (queuedToolCallIds.has(call_id)) {
            console.log('Tool call already queued, ignoring:', call_id);
            return;
          }
          if (activeToolCallId && activeToolCallId !== call_id) {
            queuedToolCalls.push({ name, call_id, arguments: argsStr });
            queuedToolCallIds.add(call_id);
            logVoiceDiagnostic({
              event_type: 'tool_call_queued',
              message: `Realtime requested ${name} while another tool was active`,
              tool_name: name,
              tool_call_id: call_id,
              details: { activeToolCallId, queuedCount: queuedToolCalls.length },
            });
            return;
          }
          activeToolCallId = call_id;
          toolCallsInFlight.set(call_id, Date.now());
          console.log('Function call received:', { name, call_id, argsStr });
          logVoiceDiagnostic({
            event_type: 'tool_call_received',
            message: `Realtime requested ${name}`,
            tool_name: name,
            tool_call_id: call_id,
            details: { argsLength: (argsStr || '').length, argsPreview: (argsStr || '').slice(0, 400) },
          });

          const cleanupToolCall = () => {
            toolCallsInFlight.delete(call_id);
            if (activeToolCallId === call_id) activeToolCallId = null;
            const nextToolCall = queuedToolCalls.shift();
            if (nextToolCall) {
              queuedToolCallIds.delete(nextToolCall.call_id);
              window.setTimeout(() => {
                handleServerEvent({
                  type: 'response.output_item.done',
                  item: { type: 'function_call', ...nextToolCall },
                });
              }, 0);
            }
          };
          
          if (name === 'generate_image') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const prompt = args.prompt || '';
              const aspectRatio = args.aspect_ratio || '1:1';
              console.log('Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
              
              if (optionsRef.current.onImageGenerate) {
                withToolTimeout('generate_image', call_id, optionsRef.current.onImageGenerate(prompt, aspectRatio), 45000)
                  .then(() => {
                    console.log('Image generated successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({ 
                      success: true, 
                      message: `Image generated and displayed to user. Describe what you created based on: "${prompt}"`
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Image generation failed:', error);
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      message: error?.message || 'Image generation failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { errorName: error?.name },
                    });
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
          } else if (name === 'revise_image') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const prompt = args.prompt || '';
              const aspectRatio = args.aspect_ratio || '1:1';
              console.log('Revising current image with prompt:', prompt, 'aspect ratio:', aspectRatio);

              if (optionsRef.current.onImageRevise) {
                withToolTimeout('revise_image', call_id, optionsRef.current.onImageRevise(prompt, aspectRatio), 60000)
                  .then(() => {
                    console.log('Image revised successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      message: `Updated image generated and displayed to user. Briefly describe what changed based on: "${prompt}"`
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Image revision failed:', error);
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      message: error?.message || 'Image revision failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { errorName: error?.name },
                    });
                    sendFunctionResult(call_id, JSON.stringify({
                      success: false,
                      error: error.message || 'Failed to revise image'
                    }));
                    cleanupToolCall();
                  });
              } else {
                sendFunctionResult(call_id, JSON.stringify({
                  success: false,
                  error: 'No current generated image is available to revise. Ask the user to generate an image first.'
                }));
                cleanupToolCall();
              }
            } catch (e) {
              console.error('Failed to parse image revision args:', e);
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
                withToolTimeout('web_search', call_id, optionsRef.current.onWebSearch(query), 25000)
                  .then((results) => {
                    console.log('Web search completed');
                    logVoiceDiagnostic({
                      event_type: 'tool_call_completed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { resultLength: results?.length || 0 },
                    });
                    // Synthesizing fresh web results benefits from real reasoning.
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      results: results
                    }), 'medium');
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Web search failed:', error);
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      message: error?.message || 'Web search failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { errorName: error?.name },
                    });
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
                withToolTimeout('search_past_chats', call_id, optionsRef.current.onSearchPastChats(query), 25000)
                  .then((results) => {
                    console.log('Past chat search completed');
                    logVoiceDiagnostic({
                      event_type: 'tool_call_completed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { resultLength: results?.length || 0 },
                    });
                    // Recalling and weaving past context together needs deeper thinking.
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      context: results
                    }), 'medium');
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Past chat search failed:', error);
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      message: error?.message || 'Past chat search failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { errorName: error?.name },
                    });
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
          } else if (name === 'get_weather') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const location = args.location || '';
              console.log('Getting weather for:', location);

              if (optionsRef.current.onGetWeather) {
                withToolTimeout('get_weather', call_id, optionsRef.current.onGetWeather(location), 12000)
                  .then((result) => {
                    logVoiceDiagnostic({
                      event_type: 'tool_call_completed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { resultLength: result?.length || 0 },
                    });
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      weather: result
                    }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    console.error('Weather lookup failed:', error);
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      message: error?.message || 'Weather lookup failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { errorName: error?.name },
                    });
                    sendFunctionResult(call_id, JSON.stringify({
                      success: false,
                      error: error.message || 'Failed to fetch weather'
                    }));
                    cleanupToolCall();
                  });
              } else {
                sendFunctionResult(call_id, JSON.stringify({
                  success: false,
                  error: 'Weather not available'
                }));
                cleanupToolCall();
              }
            } catch (e) {
              console.error('Failed to parse weather args:', e);
              sendFunctionResult(call_id, JSON.stringify({
                success: false,
                error: 'Invalid location'
              }));
              cleanupToolCall();
            }
          } else if (name === 'save_memory') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const memory = (args.memory || '').trim();
              const replaces: string[] = Array.isArray(args.replaces) ? args.replaces.filter((s: any) => typeof s === 'string' && s.trim()) : [];
              if (!memory || !optionsRef.current.onSaveMemory) {
                sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'No memory provided or handler missing' }));
                cleanupToolCall();
              } else {
                withToolTimeout('save_memory', call_id, optionsRef.current.onSaveMemory(memory, replaces), 12000)
                  .then((msg) => {
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({ success: true, message: msg }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    logVoiceDiagnostic({ event_type: 'tool_call_failed', tool_name: name, tool_call_id: call_id, message: error?.message });
                    sendFunctionResult(call_id, JSON.stringify({ success: false, error: error?.message || 'Failed to save memory' }));
                    cleanupToolCall();
                  });
              }
            } catch (e) {
              sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Invalid arguments' }));
              cleanupToolCall();
            }
          } else if (name === 'recall_memory') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const query = typeof args.query === 'string' ? args.query : undefined;
              if (!optionsRef.current.onRecallMemory) {
                sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Memory recall not available' }));
                cleanupToolCall();
              } else {
                withToolTimeout('recall_memory', call_id, optionsRef.current.onRecallMemory(query), 10000)
                  .then((results) => {
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({ success: true, memories: results }), 'medium');
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    sendFunctionResult(call_id, JSON.stringify({ success: false, error: error?.message || 'Failed to recall memory' }));
                    cleanupToolCall();
                  });
              }
            } catch (e) {
              sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Invalid arguments' }));
              cleanupToolCall();
            }
          } else if (name === 'delete_memory') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const keywords: string[] = Array.isArray(args.keywords) ? args.keywords.filter((s: any) => typeof s === 'string' && s.trim()) : [];
              if (keywords.length === 0 || !optionsRef.current.onDeleteMemory) {
                sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'No keywords provided' }));
                cleanupToolCall();
              } else {
                withToolTimeout('delete_memory', call_id, optionsRef.current.onDeleteMemory(keywords), 10000)
                  .then((msg) => {
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({ success: true, message: msg }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    sendFunctionResult(call_id, JSON.stringify({ success: false, error: error?.message || 'Failed to delete memory' }));
                    cleanupToolCall();
                  });
              }
            } catch (e) {
              sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Invalid arguments' }));
              cleanupToolCall();
            }
          } else {
            cleanupToolCall();
          }
        }
        break;

      case 'response.created':
        responseInProgress = true;
        // Clear accumulated transcript so AI deltas start fresh
        setCurrentTranscript('');

        // Allow tool-triggered responses through the phantom guard
        if (awaitingToolResponse) {
          console.log('Allowing tool-triggered response through phantom guard');
          awaitingToolResponse = false;
          setStatus('thinking');
          break;
        }

        // Trust server VAD: if we got speech_started since the last response,
        // this is a real user turn — let it through. Whisper transcription
        // often arrives AFTER response.created, so we cannot wait on it.
        if (userSpokeAfterLastResponse || hasRealTranscription) {
          console.log('Allowing response — user speech detected by server VAD');
          setStatus('thinking');
          break;
        }

        // No speech detected at all — cancel immediately (true phantom)
        console.log('Cancelling phantom response — no speech_started fired');
        if (globalWs?.readyState === WebSocket.OPEN) {
          sendRealtimeEvent({ type: 'response.cancel' });
        }
        break;

      case 'response.done':
        responseInProgress = false;
        flushPendingFunctionResults();
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
        } else if (stillActive) {
          // Safety fallback: if onended never fires (AudioContext error, tab background, etc.)
          // force the state back to listening so the user can speak again
          setTimeout(() => {
            const { isActive: active, status: currentStatus } = useVoiceModeStore.getState();
            if (active && (currentStatus === 'speaking' || currentStatus === 'thinking')) {
              console.warn('Voice mode stuck — forcing reset to listening');
              useVoiceModeStore.getState().setIsAudioPlaying(false);
              useVoiceModeStore.getState().setStatus('listening');
            }
          }, 8000);
        }
        break;

      case 'error':
        if (event.error?.code === 'response_cancel_not_active') {
          console.log('No active response to cancel (harmless)');
          return;
        }

        // Fatal upstream errors — stop reconnecting
        if (FATAL_ERROR_CODES.includes(event.error?.code)) {
          console.error('Fatal voice error, stopping reconnect:', event.error);
          logVoiceDiagnostic({
            event_type: 'fatal_error',
            message: event.error?.message || 'Fatal voice error',
            details: { code: event.error?.code, error: event.error },
          });
          reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // prevent reconnect
          optionsRef.current.onError?.(event.error?.message || 'Voice session failed');
          return;
        }

        // Upstream closed relay — let onclose handle reconnect
        if (event.error?.code === 'upstream_closed') {
          console.warn('Upstream closed:', event.error?.message);
          return;
        }

        // Session expired — OpenAI hard-kills sessions after ~15 minutes.
        // This is expected during long calls. Reconnect seamlessly without
        // tearing down the overlay or losing conversation history.
        if (event.error?.code === 'session_expired') {
          console.warn('OpenAI session expired (15-min limit) — reconnecting seamlessly');
          // The WebSocket will close immediately after this error event.
          // onclose will handle the reconnect; we just need to make sure
          // reconnectAttempts is low enough to allow it.
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts = 0;
          }
          // Don't surface this as a user-visible error — it's expected behaviour.
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
          // Race-condition errors that can occur around mute/unmute and double response.create
          event.error?.code === 'response_already_active' ||
          event.error?.code === 'input_audio_buffer_empty' ||
          event.error?.code === 'response_not_created' ||
          event.error?.message?.includes('Cannot create a new response') ||
          event.error?.message?.includes('input audio buffer is empty') ||
          event.error?.message?.includes('response is already') ||
          event.error?.message?.includes('session.update') ||
          event.error?.message?.includes('Cannot update a conversation');
        
        if (isTransientError) {
          console.warn('Transient server error (voice mode continues):', event.error);
          logVoiceDiagnostic({
            event_type: 'transient_error',
            message: event.error?.message || 'Transient voice error',
            details: { code: event.error?.code, error: event.error },
          });
          return;
        }
        
        console.error('Server error:', event.error);
        logVoiceDiagnostic({
          event_type: 'server_error',
          message: event.error?.message || 'Server error',
          details: { code: event.error?.code, error: event.error },
        });
        optionsRef.current.onError?.('Voice hit a realtime error — reconnecting with context.');
        if (globalWs?.readyState === WebSocket.OPEN) {
          globalWs.close(4001, 'server_error_reconnect');
        }
        return;
    }
  }, [sendFunctionResult, clearAudioBuffer]);

  const connect = useCallback(async (systemPrompt?: string) => {
    const { setStatus } = useVoiceModeStore.getState();
    
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
      const staleWs = globalWs;
      staleWs.onclose = null;
      staleWs.onerror = null;
      staleWs.onmessage = null;
      staleWs.close();
      globalWs = null;
    }

    globalConnecting = true;
    globalSessionId = null;
    sessionReady = false;
    resetTurnOrderingBuffer();
    setStatus('connecting');

    try {
      let didOpen = false;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Not authenticated - cannot connect to voice mode');
        setStatus('idle');
        globalConnecting = false;
        optionsRef.current.onError?.('Please sign in to use Voice Mode.');
        return;
      }

      const { selectedVoice: currentVoice } = useVoiceModeStore.getState();
      const safeVoice = REALTIME_SUPPORTED_VOICES.includes(currentVoice) ? currentVoice : 'cedar';

      const { data: realtimeSession, error: realtimeSessionError } = await supabase.functions.invoke('openai-realtime-proxy', {
        body: {
          voice: safeVoice,
        },
      });

      if (realtimeSessionError || !realtimeSession?.client_secret) {
        throw new Error(realtimeSessionError?.message || 'Failed to create a secure voice session.');
      }

      const realtimeModel = realtimeSession.model || OPENAI_REALTIME_MODEL;
      
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
        [
          'realtime',
          `openai-insecure-api-key.${realtimeSession.client_secret}`,
        ]
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
        console.log('Connected to OpenAI Realtime');
        logVoiceDiagnostic({
          event_type: 'websocket_open',
          message: 'Connected to OpenAI Realtime',
          details: { reconnectAttempts, voice: safeVoice, model: realtimeModel },
        });
        globalConnecting = false;
        reconnectAttempts = 0;
        setIsConnected(true);
        setStatus('listening');
        
        // Periodic cleanup of stale tool calls during long sessions.
        // Use a single shared interval so reconnects don't accumulate timers.
        if (cleanupInterval) {
          clearInterval(cleanupInterval);
        }
        cleanupInterval = setInterval(() => cleanupStaleToolCalls(), 30000);

        // Keepalive: OpenAI may close idle sessions. Send a no-op session.update
        // every 20s to keep the WebSocket warm during silence or long tool calls.
        if (keepaliveInterval) {
          clearInterval(keepaliveInterval);
        }
        keepaliveInterval = setInterval(() => {
          if (
            globalWs?.readyState === WebSocket.OPEN &&
            sessionReady &&
            !activeToolCallId &&
            !responseInProgress
          ) {
            sendRealtimeEvent({ type: 'session.update', session: { type: 'realtime' } });
          }
        }, 20000);

        // Watchdog: if no server events arrive for 35s, the WebSocket is a
        // zombie (connection appears OPEN but the relay is dead). Force-close
        // it so onclose triggers a clean reconnect with full context.
        lastServerEventAt = Date.now();
        if (watchdogInterval) {
          clearInterval(watchdogInterval);
        }
        watchdogInterval = setInterval(() => {
          if (!globalWs || globalWs.readyState !== WebSocket.OPEN) return;
          const silentFor = Date.now() - lastServerEventAt;
          if (activeToolCallId || pendingFunctionResults.length > 0) {
            lastServerEventAt = Date.now();
            return;
          }
          if (silentFor > ZOMBIE_TIMEOUT_MS) {
            console.warn(`Zombie WebSocket detected (${silentFor}ms silent) — forcing reconnect`);
            logVoiceDiagnostic({
              event_type: 'zombie_ws_detected',
              message: `No server events for ${silentFor}ms — forcing reconnect`,
              details: { silentMs: silentFor },
            });
            // Reset attempts so onclose reconnects immediately.
            reconnectAttempts = 0;
            try { globalWs.close(4002, 'zombie_watchdog'); } catch {}
          }
        }, 10000);

        // Proactive session refresh: schedule a reconnect just before the
        // 15-minute hard limit so the user never experiences a forced drop.
        // We close the current WS cleanly at 13 minutes; onclose then
        // reconnects with an updated system prompt that includes conversation
        // context so the AI remembers what was discussed.
        if (proactiveRefreshTimer) {
          clearTimeout(proactiveRefreshTimer);
        }
        proactiveRefreshTimer = setTimeout(async () => {
          proactiveRefreshTimer = null;
          const { isActive } = useVoiceModeStore.getState();
          if (!isActive || !globalWs || globalWs.readyState !== WebSocket.OPEN) return;

          console.log('Proactive session refresh at 13-min mark — reconnecting before expiry');

          // Ask the controller for an updated system prompt that includes
          // a summary of the conversation so far.
          let updatedPrompt: string | undefined;
          try {
            updatedPrompt = await optionsRef.current.onSessionExpired?.();
          } catch (e) {
            console.warn('onSessionExpired callback failed, using last prompt:', e);
          }
          if (updatedPrompt) lastSystemPrompt = updatedPrompt;

          // Reset reconnect counter so the onclose handler will reconnect.
          reconnectAttempts = 0;

          // Close cleanly — onclose will reconnect.
          globalWs.close(1000, 'proactive_refresh');
        }, PROACTIVE_REFRESH_MS);
        
        sendRealtimeEvent({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: systemPrompt || `You're Arc — a calm, laid-back, friendly voice companion. Talk like a real person hanging out: relaxed, natural, a little playful, genuinely curious. Be warm but never gushy. Avoid sycophantic openers like "Great question!", "Absolutely!", "I'd love to", "What a great idea", or over-the-top enthusiasm. Skip filler praise. Don't perform — just talk. Be creative and thoughtful when it fits, concise by default. Use contractions, casual phrasing, occasional dry humor. CRITICAL RULE: NEVER speak unless the user has spoken first. Do NOT say things like "no rush", "take your time", "I'm here whenever you're ready", or any filler during silence. Just wait quietly. When generating an image, say something low-key first like "one sec, cooking that up" or "alright, on it" before calling generate_image.`,
            output_modalities: ['audio'],
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: { model: 'gpt-4o-transcribe', language: 'en' },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 700,
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: safeVoice,
              },
            },
            tool_choice: 'auto',
            tools: [
                {
                type: 'function',
                name: 'generate_image',
                description: 'Generate a NEW image based on user description. Use when user asks to create, generate, show, draw, or make a new image or picture of something. For changes to the currently displayed generated image, use revise_image instead. ALWAYS pay attention to size/shape requests - "wide", "widescreen", "landscape", "banner" = 16:9. "Tall", "portrait", "vertical", "phone wallpaper" = 9:16. "Square" or no preference = 1:1.',
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
                name: 'revise_image',
                description: 'Create a revised version of the currently displayed generated image. Use only after Arc has already generated an image in this voice session and the user asks to update it, change it, make another version, adjust style, add/remove details, or otherwise revise the photo/image. If no generated image is currently visible, ask the user to generate one first.',
                parameters: {
                  type: 'object',
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'Detailed instruction for how to revise the current generated image'
                    },
                    aspect_ratio: {
                      type: 'string',
                      enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
                      description: 'Aspect ratio for the revised image. Keep the current shape unless the user asks to change it.'
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
                description: 'Search the web for real-time information. Use when user asks about current events, news, recent movies, sports scores, latest updates, breaking news, or anything that requires up-to-date information from the internet. For WEATHER questions, use get_weather instead. IMPORTANT: Listen carefully to exact names - "Win the Night" is different from "Wind of Change". Repeat back the exact search term you heard before searching.',
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
                      description: 'The topic, question, or information to search for in past conversations'
                    }
                  },
                  required: ['query']
                }
              },
              {
                type: 'function',
                name: 'get_weather',
                description: 'Get the current weather for a specific location. Use when the user asks about the weather, temperature, forecast, or conditions for any city or place. Prefer this over web_search for weather questions — it returns structured data and shows a nice weather card to the user.',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: 'City name, optionally with state/country (e.g. "Austin, TX", "Tokyo", "Paris, France")'
                    }
                  },
                  required: ['location']
                }
              },
              {
                type: 'function',
                name: 'save_memory',
                description: 'Save or UPDATE a long-term personal fact about the user. Use this whenever the user shares info about themselves, asks you to remember something, OR corrects a previous memory. Save a clear third-person statement like "Jake prefers Cedric voice". When correcting/replacing outdated info, pass `replaces` with distinctive keywords from the OLD fact so it gets removed.',
                parameters: {
                  type: 'object',
                  properties: {
                    memory: { type: 'string', description: 'Clear, concise third-person fact about the user.' },
                    replaces: { type: 'array', items: { type: 'string' }, description: 'Optional keywords from any OLD memory this replaces.' }
                  },
                  required: ['memory']
                }
              },
              {
                type: 'function',
                name: 'recall_memory',
                description: 'List the user\'s saved long-term memories. Use when the user asks what you remember about them, or when you need to look up a saved fact mid-conversation. Pass an optional query to filter to relevant memories.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Optional. Topic or keyword to filter memories.' }
                  }
                }
              },
              {
                type: 'function',
                name: 'delete_memory',
                description: 'Delete one or more saved memories that match the given keyword phrases. Use when the user says things like "forget that I…", "delete the memory about X", "you can forget X". Pass distinctive keywords from the memory to remove.',
                parameters: {
                  type: 'object',
                  properties: {
                    keywords: { type: 'array', items: { type: 'string' }, description: 'Distinctive keywords/phrases from the memory to delete.' }
                  },
                  required: ['keywords']
                }
              }
            ]
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerEvent(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
          logVoiceDiagnostic({
            event_type: 'message_parse_failed',
            message: e instanceof Error ? e.message : String(e),
            details: { rawLength: event.data?.length || 0 },
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        logVoiceDiagnostic({
          event_type: 'websocket_error',
          message: 'Browser WebSocket error event',
          details: { error: String(error) },
        });
        globalConnecting = false;
      };

      ws.onclose = (event) => {
        clearTimeout(connectTimeout);
        if (globalWs && globalWs !== ws) {
          console.log('Ignoring stale realtime close from an older socket:', event.code, event.reason || '(no reason)');
          return;
        }
        console.log('Disconnected from OpenAI Realtime:', event.code, event.reason || '(no reason)');
        logVoiceDiagnostic({
          event_type: 'websocket_close',
          message: event.reason || '(no reason)',
          connection_state: 'closed',
          details: { code: event.code, reason: event.reason, wasClean: event.wasClean, reconnectAttempts },
        });
        globalConnecting = false;
        globalWs = null;
        globalSessionId = null;
        sessionReady = false;
        forceFlushTurnOrderingBuffer();
        toolCallsInFlight.clear();
        resetToolCallQueue();
        resetPendingFunctionResults();
        // Tear down per-connection intervals so they don't accumulate across reconnects
        clearConnectionTimers();
        setIsConnected(false);

        // If voice mode is still active, attempt auto-reconnect with exponential backoff.
        // OpenAI Realtime caps sessions at ~15 minutes, so a long voice chat WILL
        // hit a forced disconnect — we keep the overlay alive and reconnect silently.
        const { isActive, setStatus } = useVoiceModeStore.getState();
        if (isActive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(500 * Math.pow(1.6, reconnectAttempts - 1), 8000);
          console.log(`Auto-reconnecting voice mode (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
          setStatus('connecting');
          setTimeout(async () => {
            const { isActive: stillActive } = useVoiceModeStore.getState();
            if (stillActive) {
              connect(await buildReconnectPrompt());
            }
          }, delay);
        } else if (isActive && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          // Don't tear down the overlay — let the user decide. Stay in 'connecting'
          // and schedule a longer cooldown attempt so transient outages can self-heal.
          console.error('Max reconnect attempts reached — pausing reconnect loop, will retry after cooldown');
          reconnectAttempts = 0;
          setStatus('connecting');
          optionsRef.current.onError?.('Connection unstable. Reconnecting in the background — keep talking when you see the orb pulse again, or tap X to end.');
          setTimeout(async () => {
            const { isActive: stillActive } = useVoiceModeStore.getState();
            if (stillActive && (!globalWs || globalWs.readyState !== WebSocket.OPEN)) {
              connect(await buildReconnectPrompt());
            }
          }, 15000);
        } else {
          setStatus('idle');
        }
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      globalConnecting = false;
      globalWs = null;
      globalSessionId = null;
      forceFlushTurnOrderingBuffer();
      toolCallsInFlight.clear();
      resetToolCallQueue();
      resetPendingFunctionResults();
      logVoiceDiagnostic({
        event_type: 'connect_failed',
        message: error instanceof Error ? error.message : String(error),
      });
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

    // Clear all connection timers
    clearConnectionTimers();

    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }
    globalConnecting = false;
    globalSessionId = null;
    sessionReady = false;
    resetTurnOrderingBuffer();
    toolCallsInFlight.clear();
    resetToolCallQueue();
    resetPendingFunctionResults();
    setIsConnected(false);
    setStatus('idle');

    // Reset after close event has fired
    setTimeout(() => { reconnectAttempts = 0; }, 100);
  }, []);

  const reconnectNow = useCallback(async () => {
    const { isActive, setStatus } = useVoiceModeStore.getState();
    if (!isActive || globalConnecting) return;

    logVoiceDiagnostic({
      event_type: 'manual_reconnect_requested',
      message: 'User requested voice reconnect',
      details: { connectionState: getConnectionStateLabel() },
    });

    reconnectAttempts = 0;
    setStatus('connecting');

    if (globalWs) {
      try {
        const staleWs = globalWs;
        staleWs.onclose = null;
        staleWs.onerror = null;
        staleWs.onmessage = null;
        staleWs.close(1000, 'manual_reconnect');
      } catch (_) {}
      globalWs = null;
    }

    clearConnectionTimers();
    forceFlushTurnOrderingBuffer();
    toolCallsInFlight.clear();
    resetToolCallQueue();
    resetPendingFunctionResults();
    await connect(await buildReconnectPrompt());
  }, [connect]);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (globalWs?.readyState !== WebSocket.OPEN || !sessionReady) return;
    
    // Efficient base64 encoding — avoid per-byte string concatenation
    const bytes = new Uint8Array(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
    }
    const base64Audio = btoa(binary);
    
    sendRealtimeEvent({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });
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
    sendRealtimeEvent({ type: 'response.cancel' });
  }, []);

  // Commit the current audio buffer and trigger AI response
  const commitAudioAndRespond = useCallback(() => {
    if (globalWs?.readyState !== WebSocket.OPEN) return false;

    const { hasPendingSpeech, setHasPendingSpeech, setStatus, status } = useVoiceModeStore.getState();

    if (!hasPendingSpeech) {
      console.log('No pending speech to commit');
      return false;
    }

    // Don't send response.create if one is already active — causes a server error
    // that propagates as a fatal error and closes the UI
    if (status === 'thinking' || status === 'speaking') {
      console.log('Response already active, skipping mute handoff to avoid double response.create');
      return false;
    }

    console.log('Committing audio buffer and triggering response (mute handoff)');

    const committed = sendRealtimeEvent({ type: 'input_audio_buffer.commit' });
    if (!committed) return false;
    sendRealtimeEvent({ type: 'response.create' });

    setStatus('thinking');
    setHasPendingSpeech(false);

    return true;
  }, []);

  // Send an image to the conversation for vision analysis.
  // - `mimeType` defaults to JPEG (camera frames). Attached files pass their real MIME.
  // - `isLiveCamera=true` adds the image silently as ambient context (no response).
  // - `isLiveCamera=false` adds the image AND requests a response with medium reasoning
  //   so the model actually thinks about what it's seeing.
  const sendImage = useCallback((
    base64Image: string,
    isLiveCamera: boolean = false,
    mimeType: string = 'image/jpeg'
  ) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;

    console.log(`Sending ${isLiveCamera ? 'camera frame' : 'attached image'} (${mimeType}) to conversation`);

    // Realtime API expects input_image content. Pair with a brief text nudge so the
    // model knows the image is part of the user's current turn, not just ambient.
    const content: any[] = [
      {
        type: 'input_image',
        image_url: `data:${mimeType};base64,${base64Image}`,
      },
    ];

    if (!isLiveCamera) {
      content.push({
        type: 'input_text',
        text: 'I just attached this image. Take a look and respond to what you see.',
      });
    }

    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content,
      },
    });

    if (!isLiveCamera) {
      // Vision needs more thought than casual chat — bump reasoning effort just
      // for this response. Subsequent turns fall back to the session default.
      sendRealtimeEvent({
        type: 'response.create',
        response: {
          reasoning: { effort: 'medium' },
        },
      });
    }
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    sendAudio,
    sendImage,
    cancelResponse,
    commitAudioAndRespond,
    reconnectNow
  };
}
