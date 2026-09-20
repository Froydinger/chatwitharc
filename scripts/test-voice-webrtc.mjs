import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

// Run the production hook with deterministic browser/React/session doubles.
// No microphone, network, tokens, or provider calls are used.
const original = Object.fromEntries(['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'WebSocket', 'window', 'fetch'].map(key => [key, globalThis[key]]));
const originalNow = Date.now;
let now = 100000, nextTimer = 1;
const timers = new Map();
globalThis.setTimeout = (fn, delay = 0) => { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.setInterval = () => nextTimer++;
globalThis.clearInterval = () => {};
globalThis.WebSocket = { OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3 };
globalThis.window = { dispatchEvent() { return true; }, setTimeout: globalThis.setTimeout };
globalThis.fetch = () => { throw new Error('Network forbidden in voice tests'); };
Date.now = () => now;
function advance(ms) {
  const end = now + ms;
  for (;;) {
    const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at; timers.delete(next[0]); next[1].fn();
  }
  now = end;
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const listeners = new Set(), transports = [], invocations = [];
const state = {
  isActive: true, isMuted: false, isAudioPlaying: false, status: 'listening', selectedVoice: 'marin',
  currentTranscript: '', inputAmplitude: 0, outputAmplitude: 0, hasPendingSpeech: false, conversationHistory: [], conversationTurns: [],
  addConversationTurn(turn) { state.conversationHistory.push(turn); },
  liveCaptions: [],
  appendLiveCaption(role, text) {
    const previous = state.liveCaptions.at(-1);
    if (previous?.role === role) { previous.text += text; return previous.id; }
    const id = `caption-${state.liveCaptions.length}`;
    state.liveCaptions.push({ id, role, text });
    return id;
  },
  setLastGeneratedImageUrl(value) { state.lastGeneratedImageUrl = value; },
  deactivateVoiceMode() { state.isActive = false; }, setError() {},
};
for (const field of ['status', 'currentTranscript', 'hasPendingSpeech', 'isAudioPlaying', 'inputAmplitude', 'outputAmplitude']) {
  state[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { state[field] = value; };
}
let tokenGate = null;
let useLegacySessionShape = false;
globalThis.__arcWebRTCTest = {
  state, listeners, transports,
  async invoke(name, args) {
    invocations.push({ name, args });
    if (tokenGate) await tokenGate;
    return useLegacySessionShape
      ? { data: { sdp: 'v=0\r\n', session_id: 'live-test', model: 'gpt-live-1' } }
      : { data: { transport: { sdp: 'v=0\r\n' }, session: { id: 'live-test' }, model: 'gpt-live-1' } };
  },
};
const result = await build({
  entryPoints: ['src/hooks/useOpenAIRealtime.tsx'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'voice-webrtc-doubles', setup(b) {
    b.onResolve({ filter: /^(react|@\/store\/useVoiceModeStore|@\/integrations\/supabase\/client|@\/lib\/realtimeBrowserTransport)$/ }, args => ({ path: args.path, namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: path === 'react' ? `
      export const useRef = v => ({current:v}); export const useCallback = f => f;
      export const useState = v => [v, () => {}]; export const useEffect = f => { f(); };
    ` : path.includes('supabase') ? `
      export const supabase = { auth: {getSession: async () => ({data:{session:{access_token:'test'}}})},
        functions: {invoke: (...args) => globalThis.__arcWebRTCTest.invoke(...args)} };
    ` : path.includes('realtimeBrowserTransport') ? `
      export class RealtimeBrowserTransport {
        readyState = 0; sent = []; muted = [];
        constructor(options) { this.options = options; globalThis.__arcWebRTCTest.transports.push(this); }
        async connect() { this.negotiation = await this.options.negotiateSdp?.('offer-sdp'); this.readyState = 1; this.onopen?.(); }
        setMuted(value) { this.muted.push(value); }
        stopOutput() {}
        closeSession() { this.sent.push({ type: 'session.close' }); }
        send(value) { this.sent.push(JSON.parse(value)); }
        close() { this.readyState = 3; this.onclose?.({code:1000,reason:'test close'}); }
        emit(event) { this.onmessage?.({data:JSON.stringify(event)}); }
      }
    ` : `
      const fixture = globalThis.__arcWebRTCTest;
      export const useVoiceModeStore = Object.assign(() => fixture.state, {
        getState: () => fixture.state,
        subscribe: f => { fixture.listeners.add(f); return () => fixture.listeners.delete(f); }
      });
      export const REALTIME_SUPPORTED_VOICES = ['marin','cedar'];
      export const consumePendingMicStream = () => null;
      export const setGlobalVolumeChangeHandler = () => {};
    ` }));
  } }],
});
const { useOpenAIRealtime } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + '\n//# sourceURL=voice-webrtc-hook-test.js').toString('base64')}`);
let ducks = 0, interrupts = 0, pcmChunks = 0, searchResolve;
const queries = [];
const hook = useOpenAIRealtime({
  onInterruptProbeStart() { ducks++; }, onInterrupt() { interrupts++; }, onAudioData() { pcmChunks++; },
  onWebSearch(query) { queries.push(query); return new Promise(resolve => { searchResolve = resolve; }); },
});
const start = (transport, id) => transport.emit({ type: 'response.created', response: { id } });
const done = (transport, id, status = 'completed') => transport.emit({ type: 'response.done', response: { id, status } });
const search = (transport, id) => transport.emit({ type: 'response.output_item.done', item: { type: 'function_call', name: 'web_search', call_id: id, arguments: JSON.stringify({ query: 'Chicago weather' }) } });
try {
  await hook.connect('Test instructions');
  let transport = transports.at(-1);
  transport.emit({ type: 'session.started', session: { id: 'first' } });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].args.body.sdp, 'offer-sdp');
  assert.equal(invocations[0].args.body.voice, 'marin');
  assert.equal(invocations[0].args.body.instructions, 'Test instructions');
  assert.equal(invocations[0].args.body.tools.length, 13);

  // A frontend can overlap an older Edge Function deployment briefly. The
  // browser still accepts that function's legacy top-level SDP alias.
  useLegacySessionShape = true;
  hook.disconnect();
  await hook.connect('Legacy response shape');
  transport = transports.at(-1);
  assert.equal(transport.negotiation.answerSdp, 'v=0\r\n');
  transport.emit({ type: 'session.started', session: { id: 'legacy' } });
  useLegacySessionShape = false;

  start(transport, 'first-response');
  transport.emit({ type: 'output_audio_buffer.started', response_id: 'first-response' });
  assert.equal(state.status, 'speaking'); assert.equal(state.isAudioPlaying, true);
  transport.emit({ type: 'response.output_audio.delta', response_id: 'first-response', delta: 'AAAA' });
  transport.emit({ type: 'input_audio_buffer.speech_started' });
  advance(500);
  assert.equal(ducks, 0); assert.equal(interrupts, 0); assert.equal(pcmChunks, 0);
  assert.equal(state.hasPendingSpeech, true);
  assert.equal(transport.sent.filter(event => ['response.cancel', 'conversation.item.truncate'].includes(event.type)).length, 0);
  transport.emit({ type: 'output_audio_buffer.cleared', response_id: 'first-response' });
  assert.equal(state.isAudioPlaying, false);
  done(transport, 'first-response', 'cancelled');
  transport.emit({ type: 'input_audio_buffer.speech_stopped' });

  start(transport, 'second-response');
  transport.emit({ type: 'output_audio_buffer.started', response_id: 'second-response' });
  state.currentTranscript = 'fresh text'; state.hasPendingSpeech = true;
  done(transport, 'first-response', 'cancelled');
  transport.emit({ type: 'output_audio_buffer.stopped', response_id: 'first-response' });
  assert.equal(state.currentTranscript, 'fresh text'); assert.equal(state.hasPendingSpeech, true);
  assert.equal(state.status, 'speaking'); assert.equal(state.isAudioPlaying, true);
  hook.cancelResponse();
  assert.equal(transport.sent.some(event => event.type === 'response.cancel'), false);
  assert.equal(transport.sent.some(event => event.type === 'output_audio_buffer.clear'), false);
  assert.equal(transport.sent.filter(event => event.type === 'conversation.item.truncate').length, 0);
  done(transport, 'second-response', 'cancelled');

  for (const muted of [true, false]) {
    const previous = { ...state }; state.isMuted = muted;
    for (const listener of listeners) listener(state, previous);
    assert.equal(transport.muted.at(-1), muted);
  }
  assert.equal(hook.commitAudioAndRespond(), false, 'mute must not create a duplicate VAD response');

  state.hasPendingSpeech = false;
  start(transport, 'search-response'); search(transport, 'search-one');
  searchResolve('Sunny with sources'); await settle();
  const outputs = transport.sent.filter(event => event.item?.type === 'function_call_output');
  assert.equal(outputs.length, 1); assert.equal(outputs[0].item.call_id, 'search-one');
  assert.deepEqual(JSON.parse(outputs[0].item.output), { success: true, results: 'Sunny with sources' });
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 0, 'wait for current response to finish');
  done(transport, 'search-response');
  transport.emit({ type: 'output_audio_buffer.stopped', response_id: 'search-response' });
  advance(700); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1);
  start(transport, 'search-spoken'); transport.emit({ type: 'output_audio_buffer.started', response_id: 'search-spoken' });
  done(transport, 'search-spoken');
  assert.equal(state.isAudioPlaying, true, 'generation completion must preserve buffered playback');
  transport.emit({ type: 'output_audio_buffer.stopped', response_id: 'search-spoken' });
  assert.equal(state.isAudioPlaying, false); assert.equal(state.status, 'listening');
  advance(1000);
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1);
  assert.deepEqual(queries, ['Chicago weather']);

  // Actual Live Responses envelopes use response.completed, not response.done.
  // Backend tools must continue even while native playback/UI remains speaking.
  const delegated = event => transport.emit({ type: 'response.event', delegation_id: 'delegation-real', event });
  const delegatedCall = id => ({ type: 'response.output_item.done', response_id: 'backend-real', item: {
    type: 'function_call', name: 'web_search', call_id: id, arguments: JSON.stringify({ query: id }),
  } });
  state.status = 'speaking'; state.isAudioPlaying = true; state.hasPendingSpeech = true;
  state.currentTranscript = 'Live speech stays intact';
  delegated({ type: 'response.created', response: { id: 'backend-real' } });
  assert.equal(state.status, 'speaking', 'backend creation must not change speech state');
  assert.equal(state.currentTranscript, 'Live speech stays intact', 'backend creation must not reset captions');
  delegated(delegatedCall('delegated-one'));
  delegated(delegatedCall('delegated-two'));
  delegated(delegatedCall('delegated-one'));
  searchResolve('First delegated result'); await settle(); advance(0); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1, 'all parallel outputs must be returned before continuing');
  delegated({ type: 'response.completed', response: { id: 'backend-real', output: [] } });
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1, 'empty completed output must not discard the second pending tool');
  searchResolve('Second delegated result'); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 2, 'backend must continue once despite native speech still active');
  assert.equal(transport.sent.filter(event => event.item?.call_id === 'delegated-one').length, 1);
  assert.equal(transport.sent.filter(event => event.item?.call_id === 'delegated-two').length, 1);
  delegated(delegatedCall('delegated-one'));
  advance(10000); await settle();
  assert.equal(queries.filter(query => query === 'delegated-one').length, 1, 'completed tool replay must not execute twice');
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 2, 'continuation must not retry after success');

  // Steering finishes the old backend response and automatically creates a
  // successor. Never inject a duplicate continuation in the gap between them.
  delegated({ type: 'response.created', response: { id: 'backend-steered' } });
  delegated(delegatedCall('steered-tool'));
  searchResolve('Steered result'); await settle();
  delegated({ type: 'response.incomplete', response: { id: 'backend-steered', incomplete_details: { reason: 'steered' } } });
  advance(1000); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 2, 'steering already schedules the next backend response');
  delegated({ type: 'response.created', response: { id: 'backend-successor' } });
  delegated({ type: 'response.incomplete', response: { id: 'backend-successor', incomplete_details: { reason: 'max_output_tokens' } } });
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 2, 'automatic successor already continued the delivered outputs');
  delegated({ type: 'response.failed', response: { id: 'backend-successor' } });
  advance(1000); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 2, 'terminal replay must not create another response');

  delegated({ type: 'response.created', response: { id: 'backend-incomplete' } });
  delegated(delegatedCall('incomplete-tool'));
  searchResolve('Incomplete result'); await settle();
  delegated({ type: 'response.incomplete', response: { id: 'backend-incomplete', incomplete_details: { reason: 'max_output_tokens' } } });
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 3, 'non-steering incomplete releases busy state for pending tools');

  search(transport, 'late-search'); hook.disconnect();
  await hook.connect('New session'); const fresh = transports.at(-1);
  fresh.emit({ type: 'session.created', session: { id: 'fresh' } });
  searchResolve('Late result'); await settle(); advance(1000);
  assert.equal(fresh.sent.filter(event => event.type === 'response.create' || event.item?.type === 'function_call_output').length, 0, 'old tool result must not enter a new session');
  state.liveCaptions = [];
  state.conversationHistory = [];
  const transcript = (role, delta, start_ms, end_ms) => fresh.emit({
    type: `session.${role === 'user' ? 'input' : 'output'}_transcript.delta`, delta, start_ms, end_ms,
  });
  transcript('user', 'Can you ', 0, 400);
  advance(3000);
  transcript('user', 'hear me?', 400, 800);
  assert.equal(state.conversationHistory.length, 0, 'packet delay must not split a speaker segment');
  transcript('assistant', 'Yes, ', 900, 1200);
  assert.deepEqual(state.conversationHistory.map(t => [t.role, t.transcript]), [['user', 'Can you hear me?']],
    'native completed user caption persists before hangup without Realtime terminal events');
  transcript('assistant', 'I can.', 1200, 1600);
  transcript('user', 'Actually search ', 1500, 2000);
  transcript('user', 'again.', 2000, 2400);
  transcript('assistant', 'Searching now.', 2500, 3100);
  assert.deepEqual(state.conversationHistory.map(t => [t.role, t.transcript]), [
    ['user', 'Can you hear me?'], ['assistant', 'Yes, I can.'], ['user', 'Actually search again.'],
  ], 'role changes preserve interruption order and complete exact fragments during the call');
  assert.deepEqual(state.liveCaptions.map(({ role, text }) => ({ role, text })), [
    { role: 'user', text: 'Can you hear me?' }, { role: 'assistant', text: 'Yes, I can.' },
    { role: 'user', text: 'Actually search again.' }, { role: 'assistant', text: 'Searching now.' },
  ]);
  state.lastGeneratedImageUrl = 'https://example.test/generated.png';
  hook.disconnect();
  assert.equal(state.conversationHistory.length, 4, 'hangup flushes only the trailing native caption');
  assert.equal(state.conversationHistory.at(-1).imageUrl, 'https://example.test/generated.png');
  assert.equal(state.lastGeneratedImageUrl, null, 'native assistant retains one generated-image attachment');
  assert.deepEqual(state.conversationHistory.map(t => t.liveCaptionId), state.liveCaptions.map(t => t.id));
  assert.deepEqual(state.conversationHistory.map(t => t.transcript), state.liveCaptions.map(t => t.text));
  hook.disconnect();
  assert.equal(state.conversationHistory.length, 4, 'repeated cleanup cannot duplicate native captions');

  // Legacy finalized events retain their late-user coalescing and assistant
  // terminal-event deduplication; the native stream has its own accumulator.
  await hook.connect('Legacy transcript replay');
  const legacyTranscriptTransport = transports.at(-1);
  legacyTranscriptTransport.emit({ type: 'session.created', session: { id: 'legacy-transcripts' } });
  state.conversationHistory = [];
  state.liveCaptions = [];
  legacyTranscriptTransport.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Can you hear' });
  legacyTranscriptTransport.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Can you hear me?' });
  start(legacyTranscriptTransport, 'legacy-transcript-response');
  legacyTranscriptTransport.emit({ type: 'response.output_audio_transcript.delta', response_id: 'legacy-transcript-response', delta: 'Yes.' });
  legacyTranscriptTransport.emit({ type: 'response.output_audio_transcript.done', response_id: 'legacy-transcript-response', transcript: 'Yes.' });
  done(legacyTranscriptTransport, 'legacy-transcript-response');
  advance(1000);
  hook.disconnect();
  assert.deepEqual(state.conversationHistory.map(t => [t.role, t.transcript]), [
    ['user', 'Can you hear me?'], ['assistant', 'Yes.'],
  ], 'late canonical input and duplicate terminal events still yield one legacy pair');
  let releaseToken;
  tokenGate = new Promise(resolve => { releaseToken = resolve; });
  const pending = hook.connect('Pending'); await settle();
  const transportCount = transports.length;
  hook.disconnect(); releaseToken(); await pending; advance(1000);
  assert.equal(transports.length, transportCount, 'late token mint must not open a microphone after disconnect');
  console.log('PASS: native voice lifecycle, interruption, mute, search result/one response, stale events and disconnect races (no network)');
} finally {
  hook.disconnect(); Date.now = originalNow;
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  delete globalThis.__arcWebRTCTest;
}
