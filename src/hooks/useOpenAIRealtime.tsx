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
  onCreateScheduledTask?: (request: string) => Promise<string>;
  onSaveMemory?: (memory: string, replaces?: string[]) => Promise<string>;
  onRecallMemory?: (query?: string) => Promise<string>;
  onDeleteMemory?: (keywords: string[]) => Promise<string>;
  onOpenBugReport?: (summary?: string) => Promise<string>;
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
let suppressInterruptedResponseAudio = false;
let activeResponseId: string | null = null;
const interruptedResponseIds = new Set<string>();

const rememberInterruptedResponse = (responseId: string | null) => {
  if (!responseId) return;
  interruptedResponseIds.add(responseId);
  // Bound this for long-running sessions while retaining enough history to
  // reject late WebSocket events from recently cancelled responses.
  if (interruptedResponseIds.size > 20) {
    const oldest = interruptedResponseIds.values().next().value;
    if (oldest) interruptedResponseIds.delete(oldest);
  }
};

const isInterruptedResponseEvent = (event: any) => {
  const responseId = event?.response_id || event?.response?.id;
  return Boolean(responseId && interruptedResponseIds.has(responseId));
};

// Auto-reconnect state
let reconnectAttempts = 0;
// Allow recovery from transient network failures and the finite Realtime
// session-duration boundary without tearing the user back to chat.
const MAX_RECONNECT_ATTEMPTS = 20;
let lastSystemPrompt: string | null = null;
let sessionReady = false; // Gate: true after session.created received
// Diagnostics for the "listens but never responds" case: did mic audio ever
// reach the socket, and did the server ever hear speech in it?
let audioChunksSent = 0;
let loggedFirstSpeech = false;
let connectionOpenedAt = 0;

// Keepalive: OpenAI may idle-disconnect long sessions during silence.
// Ten minutes with neither side speaking closes the session so an abandoned
// background call cannot remain connected indefinitely.
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

const resetInactivityTimer = () => {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    console.log('Voice mode paused after 10 minutes of silence');
    const { deactivateVoiceMode, setError } = useVoiceModeStore.getState();
    deactivateVoiceMode();
    setError('Voice mode paused after 10 minutes of silence.');
  }, INACTIVITY_TIMEOUT_MS);
};

const clearSessionTimers = () => {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
};

// Voice Mode deliberately KEEPS RUNNING when the tab is backgrounded — Jake
// uses it in the background on purpose. Do not re-add a visibilitychange
// disconnect here. The 10-minute inactivity timeout applies whether the tab is
// visible or not.

// Deterministic errors that should NOT trigger reconnect
// `model_not_found` is deterministic: retrying re-mints a token and redials a
// model that will never exist, which is exactly the "reconnecting with context"
// loop. It must never be treated as transient.
const FATAL_ERROR_CODES = ['auth_failed', 'upstream_init_failed', 'invalid_api_key', 'model_not_found'];
const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1-mini';
// Barge-in sensitivity. Anything quieter than this while Arc is talking is
// treated as breathing, room noise, or speaker bleed rather than an interrupt.
// iOS needs a higher bar because the handset speaker leaks into the mic even
// with echo cancellation on — but a bar, not a blanket block, or the user can
// never talk over Arc at all.
const BARGE_IN_AMPLITUDE = 0.045;
const IOS_BARGE_IN_AMPLITUDE = 0.09;
// speech_started fires on the leading edge of a word, where the level is still
// near silence — sampling the amplitude at that instant almost always read
// below the threshold, so real interrupts were thrown away as echo. Track the
// loudest level from just before the event instead.
const INPUT_PEAK_WINDOW_MS = 700;
let recentInputPeak = 0;
let recentInputPeakAt = 0;

const noteInputAmplitude = (amplitude: number) => {
  const now = Date.now();
  if (amplitude >= recentInputPeak || now - recentInputPeakAt > INPUT_PEAK_WINDOW_MS) {
    recentInputPeak = amplitude;
    recentInputPeakAt = now;
  }
};

const getRecentInputPeak = (currentAmplitude: number) => {
  if (Date.now() - recentInputPeakAt > INPUT_PEAK_WINDOW_MS) return currentAmplitude;
  return Math.max(recentInputPeak, currentAmplitude);
};

useVoiceModeStore.subscribe((state) => noteInputAmplitude(state.inputAmplitude));
const IS_IOS_VOICE_DEVICE = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

// Delayed phantom guard timer — gives Whisper time to confirm real speech
let phantomCheckTimer: ReturnType<typeof setTimeout> | null = null;

// Transcript ordering buffer: smooth late events so turns stay strictly user→assistant
type QueuedTurn = {
  transcript: string;
  queuedAt: number;
  imageUrl?: string;
  webSearch?: {
    query: string;
    summary: string;
    sources: { url: string; title: string; snippet?: string }[];
    provider: 'tavily';
    locationUsed?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  };
  waitForUser?: boolean;
};

const TURN_ORDER_GRACE_MS = 220;
const TURN_FORCE_FLUSH_MS = 900;
const TURN_USER_TRANSCRIPT_TIMEOUT_MS = 5000;
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
        webSearch: assistantTurn.webSearch,
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

  while (pendingAssistantTurns.length > 0) {
    const nextAssistantTurn = pendingAssistantTurns[0];
    const timeoutMs = nextAssistantTurn.waitForUser
      ? TURN_USER_TRANSCRIPT_TIMEOUT_MS
      : TURN_FORCE_FLUSH_MS;
    if (now - nextAssistantTurn.queuedAt < timeoutMs) break;

    const staleAssistantTurn = pendingAssistantTurns.shift();
    if (staleAssistantTurn) {
      addConversationTurn({
        role: 'assistant',
        transcript: staleAssistantTurn.transcript,
        timestamp: new Date(),
        imageUrl: staleAssistantTurn.imageUrl,
        webSearch: staleAssistantTurn.webSearch,
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
        webSearch: turn.webSearch,
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

const getConnectionStateLabel = () => {
  const state = globalWs?.readyState;
  if (state === WebSocket.CONNECTING) return 'connecting';
  if (state === WebSocket.OPEN) return 'open';
  if (state === WebSocket.CLOSING) return 'closing';
  if (state === WebSocket.CLOSED) return 'closed';
  return 'none';
};

// Privacy choice: diagnostics remain available in the local console, but Arc
// no longer uploads per-session voice events or device details to the database.
const logVoiceDiagnostic = (_payload: VoiceDiagnosticPayload) => undefined;

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
// A tool result is on the conversation but Arc has not been asked to speak it
// yet, because a response was already running or the user was mid-turn.
let pendingToolResponseRequest = false;
let pendingToolResponseSince = 0;
let toolResponseRetryTimer: ReturnType<typeof setTimeout> | null = null;
const TOOL_RESPONSE_RETRY_MS = 600;
// hasPendingSpeech is left set on purpose after a cancelled response, so a
// tool reply must not wait on it forever. Past this point, the only thing that
// can still hold the reply back is an actually-running response.
const TOOL_RESPONSE_MAX_WAIT_MS = 6000;
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

  // The output is now on the conversation, so the model can never lose it.
  // Asking for the spoken reply is the part that has to wait for a free turn.
  if (!pendingToolResponseRequest) pendingToolResponseSince = Date.now();
  pendingToolResponseRequest = true;
  requestToolResponse();
  return true;
};

// Ask Realtime to speak now that a tool result is on the conversation. Only one
// response may be active at a time, so this backs off and retries rather than
// dropping the request — a dropped request is the model never mentioning the
// result it already has.
const requestToolResponse = () => {
  if (!pendingToolResponseRequest) return false;

  if (globalWs?.readyState !== WebSocket.OPEN) {
    scheduleToolResponseRetry();
    return false;
  }

  const voiceState = useVoiceModeStore.getState();
  const waitedTooLong = Date.now() - pendingToolResponseSince > TOOL_RESPONSE_MAX_WAIT_MS;
  const turnIsBusy = waitedTooLong
    ? responseInProgress
    : responseInProgress ||
      voiceState.hasPendingSpeech ||
      voiceState.status === 'thinking' ||
      voiceState.status === 'speaking';

  if (turnIsBusy) {
    scheduleToolResponseRetry();
    return false;
  }

  pendingToolResponseRequest = false;
  awaitingToolResponse = true;

  // NOTE: the Realtime API has no `reasoning` parameter — that belongs to the
  // Responses API. Sending it made OpenAI reject every tool reply with an
  // unknown_parameter error, which is why Arc went silent after the first few
  // turns. `reasoningEffort` is kept for diagnostics only.
  const responseCreateSent = sendRealtimeEvent({
    type: 'response.create',
  });

  if (!responseCreateSent) {
    logVoiceDiagnostic({
      event_type: 'tool_response_create_failed',
      message: 'Failed to request realtime response after tool output',
    });
    pendingToolResponseRequest = true;
    scheduleToolResponseRetry();
    return false;
  }

  responseInProgress = true;
  return true;
};

const scheduleToolResponseRetry = () => {
  if (toolResponseRetryTimer) return;
  toolResponseRetryTimer = setTimeout(() => {
    toolResponseRetryTimer = null;
    if (pendingToolResponseRequest) requestToolResponse();
  }, TOOL_RESPONSE_RETRY_MS);
};

const flushPendingFunctionResults = (force = false) => {
  if (pendingFunctionFlushTimer) {
    clearTimeout(pendingFunctionFlushTimer);
    pendingFunctionFlushTimer = null;
  }

  // Only outputs that failed to send land here now (socket closed mid-call, a
  // stale call id). Retry them; delivery itself no longer waits on the turn.
  while (pendingFunctionResults.length > 0) {
    const item = pendingFunctionResults[0];
    logVoiceDiagnostic({
      event_type: force ? 'tool_result_force_flushed' : 'tool_result_flushed',
      tool_call_id: item.callId,
      details: { queuedMs: Date.now() - item.queuedAt, reasoningEffort: item.reasoningEffort },
    });
    if (!deliverFunctionResult(item.callId, item.result, item.reasoningEffort)) break;
    pendingFunctionResults.shift();
    pendingFunctionResultCallIds.delete(item.callId);
  }

  requestToolResponse();
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
  pendingToolResponseRequest = false;
  pendingToolResponseSince = 0;
  if (toolResponseRetryTimer) {
    clearTimeout(toolResponseRetryTimer);
    toolResponseRetryTimer = null;
  }
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

// Clear all per-connection timers (cleanup and inactivity)
const clearConnectionTimers = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
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
    // Always put the result on the conversation right away. Withholding it
    // until the turn settled meant a result that arrived while Arc was still
    // saying "let me check" sat in a queue that the next user turn re-blocked,
    // so Arc answered "that's still running" while holding the answer.
    // Only the follow-up response.create has to wait for a free turn.
    if (!deliverFunctionResult(callId, result, reasoningEffort)) {
      queueFunctionResult(callId, result, reasoningEffort);
    }
  }, []);

  // Clear audio buffer to prevent leftover audio from previous turns
  const clearAudioBuffer = useCallback(() => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      console.log('Clearing input audio buffer');
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
    }
  }, []);

  const handleServerEvent = useCallback((event: any) => {
    const { setStatus, setCurrentTranscript } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
        if (globalSessionId === event.session?.id) {
          console.log('Duplicate session.created event, ignoring');
          return;
        }
        globalSessionId = event.session?.id;
        activeResponseId = null;
        interruptedResponseIds.clear();
        suppressInterruptedResponseAudio = false;
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
        // Log what the server ACTUALLY applied. If turn_detection comes back
        // null the model will never detect speech, which looks like "listening
        // forever with no response".
        logVoiceDiagnostic({
          event_type: 'session_updated',
          message: 'Realtime session config applied',
          details: {
            turn_detection: event.session?.audio?.input?.turn_detection
              ?? event.session?.turn_detection ?? null,
            output_modalities: event.session?.output_modalities
              ?? event.session?.modalities ?? null,
            input_format: event.session?.audio?.input?.format ?? null,
            transcription: event.session?.audio?.input?.transcription ?? null,
            voice: event.session?.audio?.output?.voice ?? event.session?.voice ?? null,
            toolCount: Array.isArray(event.session?.tools) ? event.session.tools.length : null,
          },
        });
        break;

      case 'input_audio_buffer.speech_started':
        console.log('VAD: User speech detected');
        const stateAtSpeechStart = useVoiceModeStore.getState();
        const bargeInThreshold = IS_IOS_VOICE_DEVICE ? IOS_BARGE_IN_AMPLITUDE : BARGE_IN_AMPLITUDE;
        const speechLevel = getRecentInputPeak(stateAtSpeechStart.inputAmplitude);
        // Only audible speech can be talked over. While Arc is silently waiting
        // on a tool (weather, search, image), an interrupt cancels the response
        // the tool result was going to land in: the result then queues behind
        // hasPendingSpeech, which a cancelled response deliberately leaves set,
        // and Arc answers "still waiting for that to finish" forever.
        const arcIsAudiblySpeaking =
          stateAtSpeechStart.status === 'speaking' || stateAtSpeechStart.isAudioPlaying;
        const toolWorkOutstanding =
          toolCallsInFlight.size > 0 ||
          pendingFunctionResults.length > 0 ||
          stateAtSpeechStart.isSearching ||
          stateAtSpeechStart.isSearchingPastChats ||
          stateAtSpeechStart.isGeneratingImage ||
          stateAtSpeechStart.isFetchingWeather ||
          stateAtSpeechStart.isSchedulingTask;
        const canBargeIn = arcIsAudiblySpeaking && !toolWorkOutstanding;

        // iOS used to discard every speech_started while Arc was responding,
        // which killed echo loops but also made voice barge-in impossible — the
        // user talked over Arc and Arc played the rest of its answer anyway.
        // Discard only what cannot be a real interrupt, or is quiet enough to
        // actually be speaker bleed.
        if (IS_IOS_VOICE_DEVICE && (
          responseInProgress ||
          stateAtSpeechStart.status === 'thinking' ||
          stateAtSpeechStart.status === 'speaking' ||
          stateAtSpeechStart.isAudioPlaying
        ) && !(canBargeIn && speechLevel > bargeInThreshold)) {
          console.log(`Ignoring iOS speaker echo during Arc response (peak ${speechLevel.toFixed(3)})`);
          sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
          return;
        }
        // Real activity — restart the silence countdown. Without this the
        // "inactivity" timeout was only ever armed at connect time, so it was a
        // hard inactivity kill that would end a call mid-conversation.
        resetInactivityTimer();
        if (!loggedFirstSpeech) {
          loggedFirstSpeech = true;
          logVoiceDiagnostic({
            event_type: 'first_speech_detected',
            message: 'Server VAD detected user speech',
            details: { audioChunksSent },
          });
        }
        userSpokeAfterLastResponse = true;
        const voiceStateAtSpeechStart = stateAtSpeechStart;
        const isBargeIn = canBargeIn && speechLevel > bargeInThreshold; // Guard against ambient noise/breathing cutting off AI speech

        if (isBargeIn) {
          console.log(`🎙️ Intentional user barge-in confirmed (peak ${speechLevel.toFixed(3)} > ${bargeInThreshold})`);
          rememberInterruptedResponse(activeResponseId);
          suppressInterruptedResponseAudio = true;
          useVoiceModeStore.getState().setHasPendingSpeech(true);
          try {
            optionsRef.current.onInterrupt?.();
          } catch (err) {
            console.warn('onInterrupt handler threw:', err);
          }
          if (globalWs?.readyState === WebSocket.OPEN) {
            sendRealtimeEvent({ type: 'response.cancel' });
          }
        } else if (arcIsAudiblySpeaking) {
          console.log(`🤫 Ignored background noise/breath during AI speech (peak ${speechLevel.toFixed(3)})`);
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
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
        setStatus('speaking');
        const partialTranscript = event.delta || '';
        // Accumulate AI transcript separately — reset on each new response
        const { currentTranscript: existingTranscript } = useVoiceModeStore.getState();
        setCurrentTranscript(existingTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
        const aiTranscript = event.transcript || '';
        if (!aiTranscript.trim()) return;
        console.log('AI said:', aiTranscript);
        
        const { lastGeneratedImageUrl, searchSummary } = useVoiceModeStore.getState();

        pendingAssistantTurns.push({
          transcript: aiTranscript,
          queuedAt: Date.now(),
          imageUrl: lastGeneratedImageUrl || undefined,
          webSearch: searchSummary ? {
            query: searchSummary.query,
            summary: searchSummary.summary,
            sources: searchSummary.sources,
            provider: 'tavily',
            locationUsed: searchSummary.locationUsed,
          } : undefined,
          // Realtime can finish speaking before Whisper emits the user's final
          // transcript. Hold this reply longer when it belongs to a spoken turn
          // so the saved chat cannot place Arc above the user who triggered it.
          waitForUser: userSpokeAfterLastResponse || hasRealTranscription,
        });

        if (lastGeneratedImageUrl) {
          useVoiceModeStore.getState().setLastGeneratedImageUrl(null);
        }
        if (searchSummary) {
          useVoiceModeStore.getState().setSearchSummary(null);
        }

        scheduleTurnFlush();
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta':
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
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
          
          if (name === 'open_bug_report') {
            const args = JSON.parse(argsStr || '{}');
            if (optionsRef.current.onOpenBugReport) {
              optionsRef.current.onOpenBugReport(args.summary)
                .then((message) => sendFunctionResult(call_id, JSON.stringify({ success: true, message })))
                .catch((error) => sendFunctionResult(call_id, JSON.stringify({ success: false, error: error?.message || 'Could not open bug report' })))
                .finally(cleanupToolCall);
            } else {
              sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Bug reporting is unavailable' }));
              cleanupToolCall();
            }
          } else if (name === 'generate_image') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const prompt = args.prompt || '';
              const aspectRatio = args.aspect_ratio || '3:2';
              console.log('Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
              
              if (optionsRef.current.onImageGenerate) {
                withToolTimeout('generate_image', call_id, optionsRef.current.onImageGenerate(prompt, aspectRatio), 90000)
                  .then(() => {
                    console.log('Image generated successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({ 
                      success: true, 
                      message: `Image generated in the chat thread. Briefly acknowledge it, but do not mention retries or previous failures.`
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
              const aspectRatio = args.aspect_ratio || '3:2';
              console.log('Revising current image with prompt:', prompt, 'aspect ratio:', aspectRatio);

              if (optionsRef.current.onImageRevise) {
                withToolTimeout('revise_image', call_id, optionsRef.current.onImageRevise(prompt, aspectRatio), 60000)
                  .then(() => {
                    console.log('Image revised successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    sendFunctionResult(call_id, JSON.stringify({
                      success: true,
                      message: `Updated image generated in the chat thread. Briefly acknowledge the edit, but do not mention retries or previous failures.`
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
          } else if (name === 'create_scheduled_task') {
            try {
              const args = JSON.parse(argsStr || '{}');
              const request = (args.request || '').trim();
              if (!request || !optionsRef.current.onCreateScheduledTask) {
                sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'No reminder request provided or handler missing' }));
                cleanupToolCall();
              } else {
                withToolTimeout('create_scheduled_task', call_id, optionsRef.current.onCreateScheduledTask(request), 25000)
                  .then((result) => {
                    logVoiceDiagnostic({
                      event_type: 'tool_call_completed',
                      tool_name: name,
                      tool_call_id: call_id,
                      details: { resultLength: result?.length || 0 },
                    });
                    sendFunctionResult(call_id, JSON.stringify({ success: true, result }));
                    cleanupToolCall();
                  })
                  .catch((error) => {
                    logVoiceDiagnostic({
                      event_type: 'tool_call_failed',
                      tool_name: name,
                      tool_call_id: call_id,
                      message: error?.message || 'Scheduled task failed',
                      details: { errorName: error?.name },
                    });
                    sendFunctionResult(call_id, JSON.stringify({ success: false, error: error?.message || 'Failed to create reminder' }));
                    cleanupToolCall();
                  });
              }
            } catch (e) {
              sendFunctionResult(call_id, JSON.stringify({ success: false, error: 'Invalid reminder request' }));
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
            // Every function_call needs an output or the model stalls waiting
            // on one it will never get.
            console.warn('Realtime requested an unknown tool:', name);
            sendFunctionResult(call_id, JSON.stringify({ success: false, error: `Unknown tool: ${name}` }));
            cleanupToolCall();
          }
        }
        break;

      case 'response.created':
        // Arc talking counts as activity too.
        resetInactivityTimer();
        responseInProgress = true;
        activeResponseId = event.response?.id || null;
        suppressInterruptedResponseAudio = false; // Always reset audio suppression for fresh response
        setCurrentTranscript('');

        // Allow tool-triggered or VAD-triggered responses through
        if (awaitingToolResponse) {
          console.log('Allowing tool-triggered response');
          awaitingToolResponse = false;
        }
        setStatus('thinking');
        break;

      case 'response.done':
        const completedResponseId = event.response?.id || null;
        const completedActiveResponse = !completedResponseId || completedResponseId === activeResponseId;
        if (event.response?.status === 'cancelled') {
          rememberInterruptedResponse(completedResponseId || activeResponseId);
        }
        // A cancelled response can finish after the next response has already
        // started. Never let that stale completion reset the new turn.
        if (completedActiveResponse) {
          responseInProgress = false;
          activeResponseId = null;
          suppressInterruptedResponseAudio = false;
        }
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

        // Session expired — Realtime sessions have a finite maximum duration.
        // This is expected during long calls. Reconnect seamlessly without
        // tearing down the overlay or losing conversation history.
        if (event.error?.code === 'session_expired') {
          console.warn('OpenAI session expired — reconnecting seamlessly');
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
      const safeVoice = REALTIME_SUPPORTED_VOICES.includes(currentVoice) ? currentVoice : 'marin';

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
        connectionOpenedAt = Date.now();
        audioChunksSent = 0;
        loggedFirstSpeech = false;
        setIsConnected(true);
        setStatus('listening');
        
        // Periodic cleanup of stale tool calls during long sessions.
        // Use a single shared interval so reconnects don't accumulate timers.
        if (cleanupInterval) {
          clearInterval(cleanupInterval);
        }
        cleanupInterval = setInterval(() => cleanupStaleToolCalls(), 30000);

        // Start inactivity timer
        resetInactivityTimer();

        const sessionUpdateSent = sendRealtimeEvent({
          type: 'session.update',
          session: {
            instructions: systemPrompt || lastSystemPrompt || `You are Arc inside the ArcAI app, founded and created by Win The Night™ Foundation (winthenight.org). Speak casually and directly, like someone from the South Side suburbs of Chicago. Let a subtle local cadence and vowel feel come through naturally, but never exaggerate it, force slang, or turn it into a "Da Bears" caricature. Be emotionally aware, punchy, human, and collaborative. Default verbosity is low to medium. Natural fillers like "um," "hmm," "uh," "oh," and "I mean" are welcome when they genuinely fit, but vary them and use them sparingly. Let amusement, curiosity, warmth, excitement, and seriousness come through naturally in vocal tone without announcing the emotion. For casual back-and-forth, default to one brief conversational thought, usually around 5–25 spoken words; only go longer when the user asks for something substantial. Never pad a simple reply with your capabilities, role, or suggestions for what to ask next. Avoid polished AI-assistant language, canned framing, restating the user's message, and service closers. Never speak unless the user has spoken first; silence needs no filler. Ignore keyboard typing, key clicks, and background noise.`,
            // GA Realtime session schema. The previous-generation keys
            // (`modalities`, `input_audio_format`, top-level `voice`,
            // `input_audio_transcription`) are rejected by the GA mini model
            // with a session_update_error, which is what produced the endless
            // "reconnecting" loop with no audio.
            type: 'realtime',
            output_modalities: ['audio'],
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                // whisper-1 is the cheapest transcription tier; do not switch
                // this to gpt-4o-transcribe, it costs several times more.
                transcription: { model: 'whisper-1' },
                turn_detection: {
                  type: 'server_vad',
                  // Deliberately high: typing, breathing and coughing were
                  // tripping the VAD and cutting Arc off mid-sentence. 0.65 was
                  // high enough that speech over Arc's own voice rarely
                  // registered at all, which is what made it un-interruptible.
                  threshold: 0.55,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 700,
                  // Let the server stop its own response the moment it hears
                  // speech, instead of relying only on the client's cancel.
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
                name: 'open_bug_report',
                description: 'Open the in-app ArcAI bug report form when the user wants to report a bug, send feedback, contact support, or send the team a message.',
                parameters: {
                  type: 'object',
                  properties: { summary: { type: 'string', description: 'Short issue summary if one was provided.' } }
                }
              },
              {
                type: 'function',
                name: 'generate_image',
                description: 'Generate a new image from a prompt. Aspect ratios: 16:9 (wide), 9:16 (tall), 1:1 (square).',
                parameters: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string', description: 'Image prompt' },
                    aspect_ratio: { type: 'string', enum: ['3:2', '1:1', '16:9', '9:16', '4:3', '3:4'] }
                  },
                  required: ['prompt', 'aspect_ratio']
                }
              },
              {
                type: 'function',
                name: 'revise_image',
                description: 'Revise the current image based on user instruction.',
                parameters: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string', description: 'Revision prompt' },
                    aspect_ratio: { type: 'string', enum: ['source', '3:2', '1:1', '16:9', '9:16', '4:3', '3:4'] }
                  },
                  required: ['prompt', 'aspect_ratio']
                }
              },
              {
                type: 'function',
                name: 'close_image',
                description: 'Close the displayed image.',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'web_search',
                description: 'Search the web for real-time news, current events, or internet info.',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string', description: 'Search query' } },
                  required: ['query']
                }
              },
              {
                type: 'function',
                name: 'search_past_chats',
                description: 'Search user past conversation history.',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string', description: 'Query for past chats' } },
                  required: ['query']
                }
              },
              {
                type: 'function',
                name: 'get_weather',
                description: 'Get current weather for a city or place.',
                parameters: {
                  type: 'object',
                  properties: { location: { type: 'string', description: 'City/location name' } },
                  required: ['location']
                }
              },
              {
                type: 'function',
                name: 'create_scheduled_task',
                description: 'Create a reminder, timed task, alarm-like reminder, or recurring scheduled task for the user. Use when the user says things like "remind me in five minutes", "remind me tomorrow", "set a reminder", "schedule this", or asks Arc to notify them later. The reminder card is added directly to the chat thread.',
                parameters: {
                  type: 'object',
                  properties: {
                    request: {
                      type: 'string',
                      description: 'The full reminder request exactly as the user intended, including what to remind them about and when.'
                    }
                  },
                  required: ['request']
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

        logVoiceDiagnostic({
          event_type: 'session_update_sent',
          message: sessionUpdateSent
            ? 'session.update dispatched'
            : 'session.update FAILED to dispatch',
          details: { sent: sessionUpdateSent, voice: safeVoice, model: realtimeModel },
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
          details: {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            reconnectAttempts,
            sessionAgeMs: connectionOpenedAt ? Date.now() - connectionOpenedAt : null,
            responseInProgress,
            activeToolCallId,
            conversationTurnCount: useVoiceModeStore.getState().conversationTurns.length,
            audioChunksSent,
            sawSpeech: loggedFirstSpeech,
          },
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
          // Give up for real. This branch used to reset reconnectAttempts to 0
          // and schedule another attempt, which made the "capped" retry loop
          // infinite — a failing socket would re-mint a token and redial
          // forever. Ending the session is the only safe terminal state.
          console.error('Max reconnect attempts reached — ending voice session');
          const { deactivateVoiceMode } = useVoiceModeStore.getState();
          deactivateVoiceMode();
          optionsRef.current.onError?.('Voice connection kept dropping, so the call was ended. Tap the orb to try again.');
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

    audioChunksSent++;
    if (audioChunksSent === 1) {
      logVoiceDiagnostic({
        event_type: 'first_audio_chunk_sent',
        message: 'Mic audio is reaching the realtime socket',
        details: { samples: audioData.length },
      });
    }

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
    rememberInterruptedResponse(activeResponseId);
    suppressInterruptedResponseAudio = true;
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
      // Vision turns ask for a response like any other; the Realtime API has no
      // per-response reasoning control (see deliverFunctionResult).
      sendRealtimeEvent({
        type: 'response.create',
      });
    }
  }, []);

  // Process speech turn via Whisper STT -> Luna (gpt-5.6-luna) -> OpenAI Neural TTS
  const processWhisperSpeechTurn = useCallback(async (audioBlob: Blob) => {
    if (!audioBlob || audioBlob.size === 0) return;

    const { setStatus, selectedVoice, addConversationTurn, setInputAmplitude, setOutputAmplitude } = useVoiceModeStore.getState();
    const safeVoice = REALTIME_SUPPORTED_VOICES.includes(selectedVoice) ? selectedVoice : 'marin';

    setStatus('thinking');

    try {
      // 1. Transcribe audio via Whisper STT edge function
      const formData = new FormData();
      formData.append('file', audioBlob, 'user_speech.webm');

      const { data: whisperData, error: whisperErr } = await supabase.functions.invoke('whisper-transcribe', {
        body: formData,
      });

      if (whisperErr || !whisperData?.text || whisperData.text.trim().length === 0) {
        console.log('Whisper transcription quiet or empty');
        setStatus('listening');
        return;
      }

      const userText = whisperData.text.trim();
      console.log('🎤 Whisper STT transcribed:', userText);

      // Add user turn to store
      addConversationTurn({ role: 'user', transcript: userText, isFinal: true, timestamp: Date.now() });

      // 2. Process text reasoning via Luna (gpt-5.6-luna) in chat edge function
      const { data: chatData, error: chatErr } = await supabase.functions.invoke('chat', {
        body: {
          message: userText,
          model: 'gpt-5.6-luna',
        },
      });

      const aiText = chatData?.response || chatData?.message || chatData?.content || "Got it! How else can I help?";
      console.log('🧠 Luna (gpt-5.6-luna) response:', aiText);

      // Add AI assistant turn to store
      addConversationTurn({ role: 'assistant', transcript: aiText, isFinal: true, timestamp: Date.now() });

      // 3. Synthesize HD Neural Voice audio via test-voice edge function
      const { data: ttsData, error: ttsErr } = await supabase.functions.invoke('test-voice', {
        body: {
          voice: safeVoice,
          text: aiText,
        },
      });

      if (ttsErr || !ttsData?.audio) {
        console.warn('TTS synthesis failed:', ttsErr);
        setStatus('listening');
        return;
      }

      // 4. Play HD Neural Voice audio in browser (Web Audio API + HTML5 Audio fallback)
      const audioBytes = Uint8Array.from(atob(ttsData.audio), c => c.charCodeAt(0));
      const audioBlobObj = new Blob([audioBytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlobObj);

      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const audioBuffer = await audioCtx.decodeAudioData(audioBytes.buffer.slice(0));
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        useVoiceModeStore.getState().setIsAudioPlaying(true);
        setStatus('speaking');

        source.onended = () => {
          URL.revokeObjectURL(audioUrl);
          useVoiceModeStore.getState().setIsAudioPlaying(false);
          setStatus('listening');
          try { audioCtx.close(); } catch (_) {}
        };
        source.start(0);
      } catch (decodeErr) {
        console.warn('Web Audio decode failed, falling back to HTML5 Audio:', decodeErr);
        const audioPlayer = new Audio(audioUrl);
        audioPlayer.onplay = () => {
          setStatus('speaking');
          useVoiceModeStore.getState().setIsAudioPlaying(true);
        };
        audioPlayer.onended = () => {
          URL.revokeObjectURL(audioUrl);
          useVoiceModeStore.getState().setIsAudioPlaying(false);
          setStatus('listening');
        };
        audioPlayer.onerror = (e) => {
          console.error('Audio playback error:', e);
          URL.revokeObjectURL(audioUrl);
          useVoiceModeStore.getState().setIsAudioPlaying(false);
          setStatus('listening');
        };
        await audioPlayer.play().catch(console.error);
      }

    } catch (err: any) {
      console.error('Whisper pipeline error:', err);
      useVoiceModeStore.getState().setIsAudioPlaying(false);
      setStatus('listening');
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
    reconnectNow,
    processWhisperSpeechTurn
  };
}
