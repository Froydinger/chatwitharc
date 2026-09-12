import { BargeInProbe, BARGE_IN_PROBE_MS } from '@/lib/bargeInProbe';
import { RealtimeBrowserTransport } from '@/lib/realtimeBrowserTransport';
import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore, VoiceName, REALTIME_SUPPORTED_VOICES, consumePendingMicStream } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';
import { readEdgeErrorBody } from '@/lib/invokeEdgeFunction';
import { getVoiceAudioConstraints, isIOSDevice } from '@/utils/platform';

interface UseOpenAIRealtimeOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
  // Returns how many milliseconds of Arc's audio the user actually heard, so
  // the interrupt can tell the server where to cut the response off.
  onInterrupt?: () => number | void;
  onInterruptProbeStart?: () => void;
  onInterruptProbeRejected?: () => void;
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
  onGetUserLocation?: () => Promise<string>;
  onOpenBugReport?: (summary?: string) => Promise<string>;
  // Called when a session expires so the controller can inject conversation
  // context into the fresh session's system prompt.
  onSessionExpired?: () => Promise<string | undefined>;
}

const GPT_LIVE_MODEL = 'gpt-live-1';

// Keep the live prompt short. OpenAI recommends putting detailed procedures
// and tool schemas in the delegated backend prompt, not in the voice model's
// small conversational context.
export const ARC_LIVE_PROMPT = `You are Arc, the voice assistant inside ArcAI.
Speak with Jake's preferred candor: casual, direct, warm, and a little dry. Keep a subtle Chicago-area cadence natural; never force slang or do a caricature. Be emotionally aware and concise. Use moderate backchannels without competing with the user.

Interruption policy: stop speaking when the user interrupts and listen. Keep listening sounds natural and do not take over the user's turn.
Delegation policy:
Backend tools: search, app actions, memory, images, reminders, location, and careful reasoning.
Delegate to the backend when the request needs one of those capabilities or an answer that depends on backend work.
Do not delegate greetings, brief clarifications, or answers already grounded in the conversation.
Delegate before giving an answer that depends on backend work. Do not guess while waiting.
Never pad a simple reply with capabilities, canned framing, a restatement, or a service closer.`;

const ARC_BACKEND_PROMPT = `You are Arc's backend reasoning agent. Execute only the supplied application tools, respect application permissions and confirmations, and return concise grounded results for spoken delivery.

Use memory tools to maintain Arc's living account memory. Preserve unrelated memory when editing or deleting, and never invent personal facts. Use search_past_chats for conversation history and web_search or get_weather only for current information. Return the actual tool result to the live model. Never claim an action succeeded until the application confirms it. For long-running image work, return a started status and let the application announce completion separately.`;

const LIVE_TOOL_DEFINITIONS = [
  { type: 'function', name: 'open_bug_report', description: 'Open the in-app bug report form when the user wants to report a bug, send feedback, contact support, or message the team.', parameters: { type: 'object', properties: { summary: { type: 'string' } } } },
  { type: 'function', name: 'generate_image', description: 'Generate a new image from a prompt.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['3:2', '1:1', '16:9', '9:16', '4:3', '3:4'] } }, required: ['prompt', 'aspect_ratio'] } },
  { type: 'function', name: 'revise_image', description: 'Revise the current image based on the user instruction.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['source', '3:2', '1:1', '16:9', '9:16', '4:3', '3:4'] } }, required: ['prompt', 'aspect_ratio'] } },
  { type: 'function', name: 'close_image', description: 'Dismiss the current temporary image or image attachment preview. Use this whenever the user says close, dismiss, hide, or remove the displayed image. Do not delete the image from chat history.', parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'get_user_location', description: 'Get the user device location for nearby or local questions.', parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'web_search', description: 'Search the web for current information, news, local places, or internet questions.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { type: 'function', name: 'search_past_chats', description: 'Search the user past conversation history.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { type: 'function', name: 'get_weather', description: 'Get current weather for a city or place.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } },
  { type: 'function', name: 'create_scheduled_task', description: 'Create a reminder or scheduled task for the user.', parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] } },
  { type: 'function', name: 'save_memory', description: 'Save or update a long-term personal fact about the user.', parameters: { type: 'object', properties: { memory: { type: 'string' }, replaces: { type: 'array', items: { type: 'string' } } }, required: ['memory'] } },
  { type: 'function', name: 'recall_memory', description: 'List relevant saved long-term memories.', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  { type: 'function', name: 'delete_memory', description: 'Delete saved memories matching keyword phrases.', parameters: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } } }, required: ['keywords'] } },
] as const;

// Singleton WebSocket instance to prevent duplicates
let globalWs: WebSocket | RealtimeBrowserTransport | null = null;
let connectionGeneration = 0;
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
// The assistant audio item currently being spoken, and how many milliseconds of
// audio the server has produced for it. An interrupt has to tell the server how
// much of that was actually heard, or it carries on as if the whole thing was.
// Realtime streams PCM16 at 24kHz, which is what turns sample counts into ms.
const REALTIME_AUDIO_SAMPLE_RATE = 24000;
let activeAudioItemId: string | null = null;
let activeAudioMs = 0;
const interruptedResponseIds = new Set<string>();
let bargeInProbeTimer: ReturnType<typeof setTimeout> | null = null;
let bargeInProbe: BargeInProbe | null = null;
let userSpeechInProgress = false;

const clearBargeInProbe = () => {
  if (bargeInProbeTimer) clearTimeout(bargeInProbeTimer);
  bargeInProbeTimer = null;
  bargeInProbe = null;
};

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
// Set when we close the socket on purpose (leaving the chat, ending the call).
// Without this, an intentional close looked identical to having exhausted the
// retry budget, and reported itself as a connection that kept dropping.
let intentionalDisconnect = false;
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
let liveSessionReadyTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (liveSessionReadyTimer) { clearTimeout(liveSessionReadyTimer); liveSessionReadyTimer = null; }
};

// GPT-Live is full duplex. Keep this compatibility helper for the shared
// playback lifecycle, but never gate the microphone based on estimated speech.
let iosSpeakingPlaybackTimer: ReturnType<typeof setTimeout> | null = null;
let currentResponseTranscript = '';
let currentResponseTranscriptQueued = false;
let currentResponseTranscriptSource: 'audio' | 'text' | null = null;
let currentResponseId: string | null = null;
let responseTranscriptFinalized = false;
let responseStartTime = 0;
let liveInputTranscript = '';
let liveInputCaptionId: string | null = null;
let currentResponseCaptionId: string | null = null;

const startIosSpeakingGate = () => {
  if (iosSpeakingPlaybackTimer) {
    clearTimeout(iosSpeakingPlaybackTimer);
    iosSpeakingPlaybackTimer = null;
  }
  useVoiceModeStore.getState().setIsAudioPlaying(true);
};

const scheduleIosSpeakingGateRelease = (_transcript: string) => {
  if (iosSpeakingPlaybackTimer) {
    clearTimeout(iosSpeakingPlaybackTimer);
    iosSpeakingPlaybackTimer = null;
  }
};

// GPT-Live transcript deltas are a display stream, not a reliable turn
// boundary. Some transports emit a transcript.done event and some finish the
// response with response.done after the last delta. Queue the assistant turn
// from either path, exactly once, so it reaches the ordinary chat stream.
const queueCurrentAssistantTranscript = (transcriptOverride?: string): string => {
  if (currentResponseTranscriptQueued) return transcriptOverride?.trim() || currentResponseTranscript.trim();

  const transcript = (transcriptOverride || currentResponseTranscript).trim();
  if (!transcript) return '';

  // The user's final input transcript can trail the assistant's first output
  // event. Move the display-only input accumulator into the ordering buffer
  // before Arc's reply, but only once. The old code also did this in the
  // transcript-delta handler, which could split one iOS utterance into a
  // partial user turn plus its later finalized turn.
  queuePendingLiveInputTranscript();

  const { lastGeneratedImageUrl } = useVoiceModeStore.getState();
  pendingAssistantTurns.push({
    transcript,
    queuedAt: Date.now(),
    imageUrl: lastGeneratedImageUrl || undefined,
    waitForUser: userSpokeAfterLastResponse || hasRealTranscription,
    liveCaptionId: currentResponseCaptionId || undefined,
  });
  currentResponseTranscriptQueued = true;

  if (lastGeneratedImageUrl) {
    useVoiceModeStore.getState().setLastGeneratedImageUrl(null);
  }
  scheduleTurnFlush();
  return transcript;
};

const normalizeTranscriptForMatch = (transcript: string) =>
  transcript.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const queueUserTranscript = (transcript: string, liveCaptionId?: string | null) => {
  const trimmed = transcript.trim();
  if (!trimmed) return;

  const normalized = normalizeTranscriptForMatch(trimmed);
  const previous = pendingUserTurns[pendingUserTurns.length - 1];
  if (previous) {
    const previousNormalized = normalizeTranscriptForMatch(previous.transcript);
    // A late finalized iOS transcript may be a longer version of the partial
    // fallback already queued. Replace that pending partial instead of
    // emitting two user bubbles for one utterance.
    if (
      normalized === previousNormalized ||
      normalized.includes(previousNormalized) ||
      previousNormalized.includes(normalized)
    ) {
      if (trimmed.length > previous.transcript.length) previous.transcript = trimmed;
      if (!previous.liveCaptionId && liveCaptionId) previous.liveCaptionId = liveCaptionId;
      return;
    }
  }

  pendingUserTurns.push({ transcript: trimmed, queuedAt: Date.now(), liveCaptionId: liveCaptionId || undefined });
  scheduleTurnFlush();
};

const queuePendingLiveInputTranscript = () => {
  const transcript = liveInputTranscript.trim();
  if (!transcript) return;
  queueUserTranscript(transcript, liveInputCaptionId);
  liveInputTranscript = '';
  liveInputCaptionId = null;
  userSpeechInProgress = false;
};

const resetResponseAccumulator = (clearLiveBubble = false) => {
  currentResponseTranscript = '';
  currentResponseTranscriptQueued = false;
  currentResponseTranscriptSource = null;
  currentResponseId = null;
  responseTranscriptFinalized = false;
  currentResponseCaptionId = null;
  if (clearLiveBubble) useVoiceModeStore.getState().setCurrentTranscript('');
};

const startResponseSegment = (responseId: string | null) => {
  if (!responseId) return;
  if (currentResponseId && currentResponseId !== responseId && currentResponseTranscript.trim()) {
    queueCurrentAssistantTranscript();
    resetResponseAccumulator(true);
  }
  currentResponseId = responseId;
};

const extractAssistantTranscript = (responseOrEvent: any): string => {
  const items = Array.isArray(responseOrEvent?.output)
    ? responseOrEvent.output
    : responseOrEvent?.item
      ? [responseOrEvent.item]
      : [];

  for (const item of items) {
    if (item?.role && item.role !== 'assistant') continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const transcript = typeof content?.transcript === 'string' ? content.transcript : '';
      if (transcript.trim()) return transcript;
      const text = typeof content?.text === 'string' ? content.text : '';
      if (text.trim()) return text;
    }
  }
  return '';
};

const clearIosSpeakingGate = () => {
  if (iosSpeakingPlaybackTimer) {
    clearTimeout(iosSpeakingPlaybackTimer);
    iosSpeakingPlaybackTimer = null;
  }
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
    images?: string[];
    provider: 'tavily';
    locationUsed?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  };
  waitForUser?: boolean;
  liveCaptionId?: string;
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
  liveInputTranscript = '';
  liveInputCaptionId = null;
  resetResponseAccumulator(true);
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
      addConversationTurn({ role: 'user', transcript: userTurn.transcript, timestamp: new Date(), liveCaptionId: userTurn.liveCaptionId });
    }

    if (assistantTurn) {
      addConversationTurn({
        role: 'assistant',
        transcript: assistantTurn.transcript,
        timestamp: new Date(),
        liveCaptionId: assistantTurn.liveCaptionId,
        imageUrl: assistantTurn.imageUrl,
        webSearch: assistantTurn.webSearch,
      });
    }
  }

  // Fallback path: flush stale unmatched turns
  while (pendingUserTurns.length > 0 && now - pendingUserTurns[0].queuedAt >= TURN_FORCE_FLUSH_MS) {
    const staleUserTurn = pendingUserTurns.shift();
    if (staleUserTurn) {
      addConversationTurn({ role: 'user', transcript: staleUserTurn.transcript, timestamp: new Date(), liveCaptionId: staleUserTurn.liveCaptionId });
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
        liveCaptionId: staleAssistantTurn.liveCaptionId,
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

  // Closing WebRTC can happen before response.done reaches the browser. Save
  // any in-flight speech transcript first so ending the call cannot erase the
  // last assistant reply that was already visible live.
  queuePendingLiveInputTranscript();
  queueCurrentAssistantTranscript();

  const { addConversationTurn } = useVoiceModeStore.getState();
  while (pendingUserTurns.length > 0) {
    const turn = pendingUserTurns.shift();
    if (turn) addConversationTurn({ role: 'user', transcript: turn.transcript, timestamp: new Date(), liveCaptionId: turn.liveCaptionId });
  }
  while (pendingAssistantTurns.length > 0) {
    const turn = pendingAssistantTurns.shift();
    if (turn) {
      addConversationTurn({
        role: 'assistant',
        transcript: turn.transcript,
        timestamp: new Date(),
        liveCaptionId: turn.liveCaptionId,
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

let diagnosticWriteQueue: Promise<void> = Promise.resolve();
let cachedDiagnosticUserId: string | null = null;

// Privacy choice: Arc does not upload routine per-session voice telemetry,
// audio chunks, transcripts, or frequent state changes. We only log genuine failures
// and terminal errors so connection/permission issues can be diagnosed.
const ERROR_DIAGNOSTIC_EVENTS = new Set([
  'connect_failed',
  'websocket_error',
  'session_update_error',
  'fatal_error',
  'tool_call_failed',
]);

const logVoiceDiagnostic = (payload: VoiceDiagnosticPayload) => {
  if (!ERROR_DIAGNOSTIC_EVENTS.has(payload.event_type)) {
    return;
  }

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
          url: typeof window !== 'undefined' ? window.location?.pathname : undefined,
          visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
          online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
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
    type: 'response.item.create',
    event_id: `tool_result_${callId}_${Date.now()}`,
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

// Report work that finished long after the tool call was answered. The result
// arrives as a conversation item rather than a function output, because the
// function call itself was already closed out, and then asks for a reply using
// the same free-turn logic as any other tool response.
const announceBackgroundWork = (text: string) => {
  if (globalWs?.readyState !== WebSocket.OPEN) return;

  const sent = sendRealtimeEvent({
    type: 'session.commentary.append',
    event_id: `commentary_${Date.now()}`,
    delegation_id: null,
    content: text.slice(0, 1800),
  });
  if (!sent) return;

  if (!pendingToolResponseRequest) pendingToolResponseSince = Date.now();
  pendingToolResponseRequest = true;
  requestToolResponse();
};

// Over a WebSocket the client owns playback, so the server has no idea how much
// of its audio was actually heard when the user cuts in. Without this it keeps
// the entire spoken response in context — Arc then answers as if it had said
// things the user never heard, and those unheard audio tokens are billed on
// every following turn.
const truncateSpokenAudio = (playedMs: number) => {
  if (!activeAudioItemId || globalWs?.readyState !== WebSocket.OPEN) return;

  // The server errors if the cut is past the real audio length.
  const audioEndMs = Math.max(0, Math.min(Math.floor(playedMs), Math.floor(activeAudioMs)));

  sendRealtimeEvent({
    type: 'conversation.item.truncate',
    item_id: activeAudioItemId,
    content_index: 0,
    audio_end_ms: audioEndMs,
  });

  activeAudioItemId = null;
  activeAudioMs = 0;
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
  if (liveSessionReadyTimer) {
    clearTimeout(liveSessionReadyTimer);
    liveSessionReadyTimer = null;
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
  useEffect(() => useVoiceModeStore.subscribe((state, previous) => {
    if (state.isMuted !== previous.isMuted && globalWs instanceof RealtimeBrowserTransport && sessionReady) {
      globalWs.setMuted(state.isMuted);
    }
  }), []);
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

  const handleServerEvent = useCallback((event: any) => {
    // Responses delegation wraps every backend event in response.event. The
    // outer delegation id is metadata for the handoff, not part of the inner
    // Responses event, so unwrap it once before the existing tool dispatcher.
    if (event?.type === 'response.event' && event.event) {
      // Backend text/lifecycle events are not Live speech, but some Live
      // transcript/lifecycle events can also arrive through this envelope.
      // Keep tool completions and unwrap the Live events that drive captions,
      // turn persistence, and readiness.
      const innerType = event.event.type;
      const isLiveEvent =
        innerType === 'response.created' ||
        innerType === 'response.done' ||
        innerType === 'input_audio_buffer.speech_started' ||
        innerType === 'input_audio_buffer.speech_stopped' ||
        innerType === 'session.input_transcript.delta' ||
        innerType === 'conversation.item.input_audio_transcription.completed' ||
        innerType === 'session.output_transcript.delta' ||
        innerType === 'session.output_transcript.done' ||
        innerType === 'response.audio_transcript.delta' ||
        innerType === 'response.audio_transcript.done' ||
        innerType === 'response.output_audio_transcript.delta' ||
        innerType === 'response.output_audio_transcript.done' ||
        innerType === 'response.text.delta' ||
        innerType === 'response.text.done';
      if (innerType !== 'response.output_item.done' && !isLiveEvent) return;
      event = { ...event.event, delegation_id: event.delegation_id ?? null };
    }
    const { setStatus, setCurrentTranscript } = useVoiceModeStore.getState();
    
    switch (event.type) {
      case 'session.created':
      case 'session.started': {
        const incomingSessionId = event.session?.id || event.session_id || null;
        if (sessionReady && globalSessionId === incomingSessionId) {
          console.log('Duplicate Live session event, ignoring');
          return;
        }
        globalSessionId = incomingSessionId;
        clearBargeInProbe();
        optionsRef.current.onInterruptProbeRejected?.();
        responseInProgress = false;
        userSpeechInProgress = false;
        activeResponseId = null;
        activeAudioItemId = null;
        activeAudioMs = 0;
        resetResponseAccumulator(false);
        interruptedResponseIds.clear();
        suppressInterruptedResponseAudio = false;
        sessionReady = true;
        if (liveSessionReadyTimer) clearTimeout(liveSessionReadyTimer);
        const markLiveInputReady = () => {
          liveSessionReadyTimer = null;
          if (
            globalSessionId !== incomingSessionId ||
            !(globalWs instanceof RealtimeBrowserTransport) ||
            !useVoiceModeStore.getState().isActive
          ) return;
          setStatus('listening');
        };
        if (isIOSDevice()) {
          // iOS can report session.created before its WebRTC audio route and
          // Live transcription pipeline have settled. Keep only the UI in
          // Connecting during that short handoff; the negotiated RTP track is
          // already live so WebKit cannot strand the microphone in silence.
          liveSessionReadyTimer = setTimeout(markLiveInputReady, 320);
        } else {
          markLiveInputReady();
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('arc-voice-quota-changed'));
        }
        console.log('GPT-Live session started:', globalSessionId);
        logVoiceDiagnostic({
          event_type: 'session_created',
          message: 'GPT-Live session started',
          session_id: globalSessionId,
          details: { model: event.session?.model },
        });
        break;
      }

      case 'session.delegation.created':
        console.log('GPT-Live delegated backend work:', event.delegation_id);
        break;

      case 'session.updated':
        if (globalWs instanceof RealtimeBrowserTransport) {
          globalWs.setMuted(useVoiceModeStore.getState().isMuted);
        }
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
        // Playback can outlive server generation. Both are interruptible.
        const canBargeIn =
          responseInProgress ||
          stateAtSpeechStart.status === 'speaking' ||
          stateAtSpeechStart.isAudioPlaying;
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
        userSpeechInProgress = true;

        // WebRTC owns echo cancellation, interruption and played-audio
        // truncation. Do not run the PCM duck/probe against native playback.
        if (globalWs instanceof RealtimeBrowserTransport) {
          const isAssistantSpeaking = responseInProgress || stateAtSpeechStart.status === 'speaking' || stateAtSpeechStart.isAudioPlaying;
          useVoiceModeStore.getState().setHasPendingSpeech(true);
          if (canBargeIn) rememberInterruptedResponse(activeResponseId);
          setStatus('listening');
          break;
        }

        if (canBargeIn && !bargeInProbeTimer) {
          // At loud speaker volumes iOS can report Arc's own output as speech.
          // Duck the speaker first, then only interrupt if microphone energy
          // remains after the echo source is gone.
          optionsRef.current.onInterruptProbeStart?.();
          bargeInProbe = new BargeInProbe(activeResponseId, performance.now());
          bargeInProbeTimer = setTimeout(() => {
            const confirmedUserSpeech = bargeInProbe?.confirmed ?? false;
            const interruptedId = bargeInProbe?.responseId ?? null;
            clearBargeInProbe();
            if (interruptedId !== activeResponseId || !confirmedUserSpeech) {
              console.log('🔈 Rejected speaker echo after barge-in probe');
              optionsRef.current.onInterruptProbeRejected?.();
              return;
            }

            console.log('🎙️ User barge-in confirmed after speaker duck');
            rememberInterruptedResponse(interruptedId);
            suppressInterruptedResponseAudio = true;
            useVoiceModeStore.getState().setHasPendingSpeech(true);
            let playedMs = 0;
            try {
              playedMs = optionsRef.current.onInterrupt?.() ?? 0;
            } catch (err) {
              console.warn('onInterrupt handler threw:', err);
            }
            if (globalWs?.readyState === WebSocket.OPEN) {
              if (responseInProgress) sendRealtimeEvent({ type: 'response.cancel' });
              truncateSpokenAudio(playedMs);
            }
          }, BARGE_IN_PROBE_MS);
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        userSpeechInProgress = false;
        console.log('VAD: User speech stopped');
        break;

      case 'session.input_transcript.delta': {
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (!delta) break;
        // `speech_stopped` can arrive before the last transcript fragments.
        // Do not clear the accumulator here or Safari/iOS can split one spoken
        // sentence into several partial words. The next speech_started event
        // is the boundary that resets it.
        userSpeechInProgress = true;
        userSpokeAfterLastResponse = true;
        hasRealTranscription = true;
        liveInputTranscript += delta;
        liveInputCaptionId = useVoiceModeStore.getState().appendLiveCaption('user', delta);
        useVoiceModeStore.getState().setHasPendingSpeech(true);
        optionsRef.current.onTranscriptUpdate?.(delta, false);
        break;
      }

      case 'output_audio_buffer.started':
        if (isInterruptedResponseEvent(event)) break;
        useVoiceModeStore.getState().setIsAudioPlaying(true);
        setStatus('speaking');
        break;

      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (event.response_id && activeResponseId && event.response_id !== activeResponseId) break;
        useVoiceModeStore.getState().setIsAudioPlaying(false);
        useVoiceModeStore.getState().setOutputAmplitude(0);
        setStatus(responseInProgress && event.type !== 'output_audio_buffer.cleared' ? 'thinking' : 'listening');
        requestToolResponse();
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
          // This is the canonical user turn. It may arrive after the partial
          // display transcript, so coalesce it with a queued fallback instead
          // of creating a second bubble.
          queueUserTranscript(userTranscript, liveInputCaptionId);
          liveInputTranscript = '';
          liveInputCaptionId = null;
          userSpeechInProgress = false;
        }
        optionsRef.current.onTranscriptUpdate?.(userTranscript, true);
        break;

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
      case 'session.output_transcript.delta':
      case 'response.text.delta':
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
        // A transcript.done event is the boundary even if a Live session does
        // not send response.created for the next automatic VAD response.
        if (responseTranscriptFinalized || currentResponseTranscriptQueued) {
          resetResponseAccumulator(true);
        }
        startResponseSegment(event.response_id || event.response?.id || null);
        {
          const transcriptSource = event.type === 'response.text.delta' ? 'text' : 'audio';
          // Live may expose both a text stream and an audio transcript for one
          // response. Use the first complete stream only so the chat cannot
          // duplicate Arc's words when both are present.
          if (currentResponseTranscriptSource && currentResponseTranscriptSource !== transcriptSource) return;
          currentResponseTranscriptSource = transcriptSource;
        }
        startIosSpeakingGate();
        setStatus('speaking');
        const partialTranscript = event.delta || '';
        if (partialTranscript) {
          currentResponseCaptionId = useVoiceModeStore.getState().appendLiveCaption('assistant', partialTranscript);
        }
        currentResponseTranscript += partialTranscript;
        // Accumulate AI transcript separately — reset on each new response
        const { currentTranscript: existingTranscript } = useVoiceModeStore.getState();
        setCurrentTranscript(existingTranscript + partialTranscript);
        optionsRef.current.onTranscriptUpdate?.(partialTranscript, false);
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
      case 'session.output_transcript.done':
      case 'response.text.done':
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
        startResponseSegment(event.response_id || event.response?.id || null);
        {
          const transcriptSource = event.type === 'response.text.done' ? 'text' : 'audio';
          if (currentResponseTranscriptSource && currentResponseTranscriptSource !== transcriptSource) return;
          currentResponseTranscriptSource = transcriptSource;
        }
        const aiTranscript = event.transcript || event.text || currentResponseTranscript || '';
        scheduleIosSpeakingGateRelease(aiTranscript);
        const queuedTranscript = queueCurrentAssistantTranscript(aiTranscript);
        if (queuedTranscript) {
          // Keep the queued flag through response.done so that the terminal
          // event cannot enqueue the same assistant turn a second time.
          responseTranscriptFinalized = true;
          currentResponseTranscript = '';
          currentResponseTranscriptSource = null;
        }
        if (queuedTranscript) console.log('AI said:', queuedTranscript);
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta':
        if (globalWs instanceof RealtimeBrowserTransport) break;
        if (suppressInterruptedResponseAudio || isInterruptedResponseEvent(event)) return;
        if (event.delta) {
          const binaryString = atob(event.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const audioData = new Int16Array(bytes.buffer);
          if (event.item_id && event.item_id !== activeAudioItemId) {
            activeAudioItemId = event.item_id;
            activeAudioMs = 0;
          }
          activeAudioMs += (audioData.length / REALTIME_AUDIO_SAMPLE_RATE) * 1000;
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
                // Answer the call immediately and let the render continue in the
                // background, so the conversation keeps flowing while it draws.
                // The finished image is announced as its own turn below.
                sendFunctionResult(call_id, JSON.stringify({
                  success: true,
                  status: 'started',
                  message: 'Image generation started and is rendering now. Say something brief and natural to that effect, keep talking with the user as normal, and do NOT describe the image or claim it is finished — you will be told the moment it is ready.'
                }));
                cleanupToolCall();

                withToolTimeout('generate_image', call_id, optionsRef.current.onImageGenerate(prompt, aspectRatio), 90000)
                  .then(() => {
                    console.log('Image generated successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    announceBackgroundWork(`The image you started ("${prompt}") has finished rendering and is now visible in the chat. Comment on it briefly and naturally, as if you just saw it appear. Do not mention retries or previous failures.`);
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
                    announceBackgroundWork(`The image you started ("${prompt}") failed to render: ${error?.message || 'unknown error'}. Tell the user briefly and offer to try again.`);
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
                sendFunctionResult(call_id, JSON.stringify({
                  success: true,
                  status: 'started',
                  message: 'Image edit started and is rendering now. Say something brief and natural to that effect, keep talking with the user as normal, and do NOT describe the result or claim it is finished — you will be told the moment it is ready.'
                }));
                cleanupToolCall();

                withToolTimeout('revise_image', call_id, optionsRef.current.onImageRevise(prompt, aspectRatio), 60000)
                  .then(() => {
                    console.log('Image revised successfully');
                    logVoiceDiagnostic({ event_type: 'tool_call_completed', tool_name: name, tool_call_id: call_id });
                    announceBackgroundWork(`The image edit you started ("${prompt}") has finished and the updated image is now visible in the chat. Comment on it briefly and naturally. Do not mention retries or previous failures.`);
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
                    announceBackgroundWork(`The image edit you started ("${prompt}") failed: ${error?.message || 'unknown error'}. Tell the user briefly and offer to try again.`);
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
                // The chat search performs retrieval and synthesis. Give that
                // existing pipeline enough time to finish before Realtime
                // converts a successful in-flight search into a tool failure.
                withToolTimeout('web_search', call_id, optionsRef.current.onWebSearch(query), 55000)
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
          } else if (name === 'get_user_location') {
            console.log('Retrieving device location for voice session');
            if (optionsRef.current.onGetUserLocation) {
              withToolTimeout('get_user_location', call_id, optionsRef.current.onGetUserLocation(), 15000)
                .then((locResult) => {
                  sendFunctionResult(call_id, JSON.stringify({
                    success: true,
                    location: locResult
                  }));
                  cleanupToolCall();
                })
                .catch((error) => {
                  console.error('Location fetch failed:', error);
                  sendFunctionResult(call_id, JSON.stringify({
                    success: false,
                    error: error?.message || 'Location unavailable'
                  }));
                  cleanupToolCall();
                });
            } else {
              sendFunctionResult(call_id, JSON.stringify({
                success: false,
                error: 'Location service not available'
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
        if (bargeInProbeTimer) {
          clearBargeInProbe();
          optionsRef.current.onInterruptProbeRejected?.();
        }
        // Arc talking counts as activity too.
        resetInactivityTimer();
        responseStartTime = Date.now();
        currentResponseTranscript = '';
        currentResponseTranscriptQueued = false;
        currentResponseTranscriptSource = null;
        currentResponseId = event.response?.id || null;
        startIosSpeakingGate();
        responseInProgress = true;
        activeResponseId = event.response?.id || null;
        activeAudioItemId = null;
        activeAudioMs = 0;
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
          // Keep the ID and audio item until the next response: queued audio
          // is still interruptible after generation has completed.
        }
        if (!completedActiveResponse) break;
        flushPendingFunctionResults();
        const responseAlreadyQueued = responseTranscriptFinalized || currentResponseTranscriptQueued;
        const completedTranscript = responseAlreadyQueued
          ? extractAssistantTranscript(event.response)
          : queueCurrentAssistantTranscript(extractAssistantTranscript(event.response));
        if (completedTranscript || currentResponseTranscriptQueued) {
          // Keep the ordinary chat bubble as the durable copy, but clear only
          // the internal response accumulator. The visible live bubble stays
          // until the controller has persisted this turn.
          resetResponseAccumulator(false);
        }
        // Keep the live chat bubble visible until VoiceModeController persists
        // the finalized assistant turn. MobileChatApp hides it automatically
        // once the ordinary saved message is present.
        
        // Clear phantom timer
        if (phantomCheckTimer) {
          clearTimeout(phantomCheckTimer);
          phantomCheckTimer = null;
        }
        
        // Only reset speech flags on COMPLETED responses, not cancelled ones.
        const responseStatus = event.response?.status;
        if (responseStatus !== 'cancelled' && !userSpeechInProgress && !bargeInProbeTimer && !isInterruptedResponseEvent(event)) {
          userSpokeAfterLastResponse = false;
          hasRealTranscription = false;
          useVoiceModeStore.getState().setHasPendingSpeech(false);
        } else {
          console.log('Keeping pending user speech intact');
        }
        
        // Only transition to listening if audio has finished playing.
        const { isActive: stillActive, isAudioPlaying: audioStillPlaying } = useVoiceModeStore.getState();
        if (stillActive && !audioStillPlaying) {
          setStatus('listening');
        }
        scheduleIosSpeakingGateRelease(completedTranscript);
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
  }, [sendFunctionResult]);

  const connect = useCallback(async (systemPrompt?: string) => {
    if (!useVoiceModeStore.getState().isActive) return;
    const { setStatus } = useVoiceModeStore.getState();

    // A fresh dial-out clears the intentional-close latch.
    intentionalDisconnect = false;

    if (systemPrompt) lastSystemPrompt = systemPrompt;
    if (globalWs?.readyState === WebSocket.OPEN) {
      console.log('Already connected to OpenAI Realtime (global check)');
      setIsConnected(true);
      if (sessionReady) setStatus('listening');
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
    const generation = ++connectionGeneration;
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

      const realtimeModel = GPT_LIVE_MODEL;
      if (generation !== connectionGeneration || !useVoiceModeStore.getState().isActive) return;
      const ws = new RealtimeBrowserTransport({
        audioConstraints: getVoiceAudioConstraints(),
        prewarmedStream: consumePendingMicStream(),
        onInputAmplitude: (level) => useVoiceModeStore.getState().setInputAmplitude(level),
        onOutputAmplitude: (level) => useVoiceModeStore.getState().setOutputAmplitude(level),
        onOutputEvent: (event) => {
          if (event.type === 'playing') {
            useVoiceModeStore.getState().setIsAudioPlaying(true);
            useVoiceModeStore.getState().setStatus('speaking');
          } else if (event.type === 'paused' || event.type === 'ended') {
            responseInProgress = false;
            useVoiceModeStore.getState().setIsAudioPlaying(false);
            useVoiceModeStore.getState().setOutputAmplitude(0);
            if (useVoiceModeStore.getState().isActive && !responseInProgress) {
              useVoiceModeStore.getState().setStatus('listening');
            }
            requestToolResponse();
          }
        },
        negotiateSdp: async (offerSdp) => {
          const { data, error } = await supabase.functions.invoke('openai-realtime-proxy', {
            body: {
              sdp: offerSdp,
              voice: safeVoice,
              instructions: systemPrompt || lastSystemPrompt || ARC_LIVE_PROMPT,
              backendInstructions: ARC_BACKEND_PROMPT,
              tools: LIVE_TOOL_DEFINITIONS,
            },
          });
          if (error) {
            const details = await readEdgeErrorBody(error);
            if (details?.code === 'voice_daily_limit') {
              // The local usage card is optimistic between devices/tabs. If
              // the server is the first place to see exhaustion, open the
              // same Boost checkout modal used by the input bar.
              window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
            }
            throw new Error(
              typeof details?.error === 'string'
                ? details.error
                : error.message || 'Failed to create GPT-Live session.',
            );
          }
          // Accept the official Live response and the top-level `sdp` alias
          // used by the immediately previous Edge Function deployment. This
          // keeps a frontend/function rollout overlap from breaking WebRTC.
          const answerSdp = typeof data?.transport?.sdp === 'string'
            ? data.transport.sdp
            : data?.sdp;
          if (typeof answerSdp !== 'string' || !/^v=0(?:\r?\n|$)/.test(answerSdp)) {
            throw new Error(data?.error || 'GPT-Live returned an invalid WebRTC SDP answer.');
          }
          return { answerSdp, sessionId: data?.session?.id };
        },
      });
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
        // The data channel being open is not the same as the Live session
        // being ready. session.created/session.started is the authoritative
        // point at which the UI may tell the user it is listening.
        
        // Periodic cleanup of stale tool calls during long sessions.
        // Use a single shared interval so reconnects don't accumulate timers.
        if (cleanupInterval) {
          clearInterval(cleanupInterval);
        }
        cleanupInterval = setInterval(() => cleanupStaleToolCalls(), 30000);

        // Start inactivity timer
        resetInactivityTimer();

      };

      ws.onmessage = (event) => {
        if (globalWs !== ws) return;
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
        if (intentionalDisconnect) {
          // We closed this ourselves — never reconnect, never report a fault.
          setStatus('idle');
        } else if (isActive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(500 * Math.pow(1.6, reconnectAttempts - 1), 8000);
          console.log(`Auto-reconnecting voice mode (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
          setStatus('connecting');
          setTimeout(async () => {
            const { isActive: stillActive } = useVoiceModeStore.getState();
            if (stillActive && generation === connectionGeneration) {
              const prompt = await buildReconnectPrompt();
              if (generation === connectionGeneration && useVoiceModeStore.getState().isActive) await connect(prompt);
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

      await ws.connect();
    } catch (error) {
      if (generation !== connectionGeneration) return;
      console.error('Failed to connect:', error);
      if (globalWs) {
        globalWs.onclose = null;
        globalWs.close();
      }
      globalConnecting = false;
      globalWs = null;
      globalSessionId = null;
      forceFlushTurnOrderingBuffer();
      toolCallsInFlight.clear();
      resetToolCallQueue();
      resetPendingFunctionResults();
      const err = error as any;
      const errorMsg = error instanceof Error ? error.message : String(error);
      let userFacingError = 'Failed to connect to voice service';

      if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        errorMsg.toLowerCase().includes('permission denied') ||
        errorMsg.toLowerCase().includes('not allowed')
      ) {
        userFacingError = 'Microphone access denied. Please allow microphone access in your browser or device settings.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        userFacingError = 'No microphone was detected on this device.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        userFacingError = 'Microphone is currently unavailable or in use by another app.';
      } else if (errorMsg.includes('Failed to create a secure voice session')) {
        userFacingError = 'Could not start voice session. Please check your network and try again.';
      } else if (typeof errorMsg === 'string' && errorMsg.length > 0 && !errorMsg.includes('[object Object]')) {
        userFacingError = errorMsg.length > 120 ? `${errorMsg.slice(0, 117)}...` : errorMsg;
      }

      logVoiceDiagnostic({
        event_type: 'connect_failed',
        message: errorMsg,
        details: {
          errorName: err?.name,
          userFacingError,
        },
      });
      optionsRef.current.onError?.(userFacingError);
      setStatus('idle');
    }
  }, [handleServerEvent]);

  const disconnect = useCallback(() => {
    const { setStatus } = useVoiceModeStore.getState();
    clearIosSpeakingGate();

    // Reset reconnect state — this is an intentional disconnect
    intentionalDisconnect = true;
    connectionGeneration++;
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS;

    // Clear phantom timer
    if (phantomCheckTimer) {
      clearTimeout(phantomCheckTimer);
      phantomCheckTimer = null;
    }

    // Clear all connection timers
    clearConnectionTimers();
    clearBargeInProbe();

    // Flush before closing WebRTC. Once the data channel is closed, Live may
    // never deliver response.done for the words that were already on screen.
    forceFlushTurnOrderingBuffer();

    if (globalWs) {
      if (globalWs instanceof RealtimeBrowserTransport) {
        // Give GPT-Live its explicit close signal before tearing down the
        // browser transport. No reconnect can be scheduled after this point.
        globalWs.closeSession();
      }
      globalWs.close();
      globalWs = null;
    }
    globalConnecting = false;
    globalSessionId = null;
    sessionReady = false;
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
    clearBargeInProbe();
    forceFlushTurnOrderingBuffer();
    toolCallsInFlight.clear();
    resetToolCallQueue();
    resetPendingFunctionResults();
    await connect(await buildReconnectPrompt());
  }, [connect]);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (globalWs instanceof RealtimeBrowserTransport) return;
    if (globalWs?.readyState !== WebSocket.OPEN || !sessionReady) return;
    
    bargeInProbe?.addAudio(audioData, performance.now());

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

  const cancelResponse = useCallback((playedMs: number = 0) => {
    if (globalWs?.readyState !== WebSocket.OPEN) return;
    
    console.log('Manually cancelling AI response');
    clearIosSpeakingGate();
    rememberInterruptedResponse(activeResponseId);
    suppressInterruptedResponseAudio = true;
    clearBargeInProbe();
    if (globalWs instanceof RealtimeBrowserTransport) {
      // GPT-Live handles natural barge-in itself. A manual tap only needs to
      // stop local playback; Realtime-only cancel/clear events are invalid on
      // the Live data channel.
      globalWs.stopOutput();
      useVoiceModeStore.getState().setIsAudioPlaying(false);
      return;
    }
    if (responseInProgress) sendRealtimeEvent({ type: 'response.cancel' });
    truncateSpokenAudio(playedMs);
  }, []);

  // Commit the current audio buffer and trigger AI response
  const commitAudioAndRespond = useCallback(() => {
    if (globalWs?.readyState !== WebSocket.OPEN) return false;
    // Disabling the RTP mic track sends silence. Server VAD commits the tail
    // and responds once; a second manual commit/create duplicates that turn.
    if (globalWs instanceof RealtimeBrowserTransport) return false;

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

    // GPT-Live's audio frontend is not vision-capable. Images must be queued as
    // Responses delegation input, then explicitly run through the delegated
    // backend. The old conversation.item.create/input_image payload was a
    // Realtime shape and is rejected by GPT-Live.
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
      type: globalWs instanceof RealtimeBrowserTransport ? 'response.item.create' : 'conversation.item.create',
      event_id: `image_${Date.now()}`,
      item: { type: 'message', role: 'user', content },
    });

    if (!isLiveCamera) {
      // Attached-image turns must explicitly resume the delegated Responses
      // workflow. Camera frames stay queued as context to avoid starting a
      // costly backend response for every preview frame.
      sendRealtimeEvent({
        type: 'response.create',
        event_id: `image_response_${Date.now()}`,
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
