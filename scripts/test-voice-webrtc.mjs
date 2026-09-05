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
globalThis.window = globalThis;
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
  deactivateVoiceMode() { state.isActive = false; }, setError() {},
};
for (const field of ['status', 'currentTranscript', 'hasPendingSpeech', 'isAudioPlaying', 'inputAmplitude', 'outputAmplitude']) {
  state[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { state[field] = value; };
}
let tokenGate = null;
globalThis.__arcWebRTCTest = {
  state, listeners, transports,
  async invoke(name, args) {
    invocations.push({ name, args });
    if (tokenGate) await tokenGate;
    return { data: { client_secret: 'test-only', model: 'gpt-realtime-2.1-mini' } };
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
        async connect(secret) { this.secret = secret; this.readyState = 1; this.onopen?.(); }
        setMuted(value) { this.muted.push(value); }
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
  const transport = transports.at(-1);
  transport.emit({ type: 'session.created', session: { id: 'first' } });
  transport.emit({ type: 'session.updated', session: {} });
  assert.deepEqual(invocations, [{ name: 'openai-realtime-proxy', args: { body: { voice: 'marin' } } }]);
  assert.equal(transport.secret, 'test-only');
  const session = transport.sent.find(event => event.type === 'session.update').session;
  assert.equal(session.audio.input.transcription.model, 'gpt-transcribe');
  assert.equal(session.audio.input.turn_detection.interrupt_response, true);
  assert.equal(session.audio.input.turn_detection.create_response, true);
  assert.equal(session.audio.output.voice, 'marin');
  assert.equal(session.instructions, 'Test instructions');

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
  assert.deepEqual(transport.sent.slice(-2).map(event => event.type), ['response.cancel', 'output_audio_buffer.clear']);
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
  done(transport, 'search-response'); advance(700); await settle();
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1);
  start(transport, 'search-spoken'); transport.emit({ type: 'output_audio_buffer.started', response_id: 'search-spoken' });
  done(transport, 'search-spoken');
  assert.equal(state.isAudioPlaying, true, 'generation completion must preserve buffered playback');
  transport.emit({ type: 'output_audio_buffer.stopped', response_id: 'search-spoken' });
  assert.equal(state.isAudioPlaying, false); assert.equal(state.status, 'listening');
  advance(1000);
  assert.equal(transport.sent.filter(event => event.type === 'response.create').length, 1);
  assert.deepEqual(queries, ['Chicago weather']);

  search(transport, 'late-search'); hook.disconnect();
  await hook.connect('New session'); const fresh = transports.at(-1);
  fresh.emit({ type: 'session.created', session: { id: 'fresh' } });
  searchResolve('Late result'); await settle(); advance(1000);
  assert.equal(fresh.sent.filter(event => event.type === 'response.create' || event.item?.type === 'function_call_output').length, 0, 'old tool result must not enter a new session');
  hook.disconnect();
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
