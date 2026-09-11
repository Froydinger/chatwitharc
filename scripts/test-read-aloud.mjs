import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

const timers = new Map();
globalThis.setTimeout = fn => { const id = Symbol(); timers.set(id, fn); return id; };
globalThis.clearTimeout = id => timers.delete(id);
const calls = [], contexts = [], notices = [];
let resolveRequest;
const fixture = globalThis.__readTest = {
  voice: { isActive: false, selectedVoice: 'marin', volume: 0.8, voiceSpeed: 1 },
  invoke: (name, options) => { calls.push({ name, options }); return new Promise(resolve => { resolveRequest = resolve; }); },
  toast: value => notices.push(value),
};
class FakeContext {
  state = 'suspended'; destination = {}; started = false;
  constructor() { contexts.push(this); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return {}; }
  createGain() { return { gain: {}, connect() {} }; }
  createBufferSource() {
    const context = this;
    return this.player = { playbackRate: {}, connect() {}, disconnect() {}, stop() {}, start() { context.started = true; } };
  }
}
globalThis.window = { AudioContext: FakeContext };
const result = await build({
  entryPoints: ['src/store/useReadAloudStore.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'doubles', setup(b) {
    b.onResolve({ filter: /^(zustand|@\/)/ }, args => ({ path: args.path, namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents:
      path === 'zustand' ? `export const create = init => { let state; const get = () => state; const set = value => { state = {...state, ...(typeof value === 'function' ? value(state) : value)}; }; state = init(set, get); return {getState:get,setState:set}; };`
      : path.includes('supabase') ? `export const supabase = {functions:{invoke:(...args)=>globalThis.__readTest.invoke(...args)}};`
      : path.includes('useVoiceModeStore') ? `export const useVoiceModeStore = {getState:()=>globalThis.__readTest.voice,subscribe:fn=>{globalThis.__readTest.onVoice=fn;}};`
      : `export const toast = value => globalThis.__readTest.toast(value);`
    }));
  } }],
});
const { useReadAloudStore: store } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const settle = async () => { for (let i=0;i<10;i++) await Promise.resolve(); };
const success = () => resolveRequest({ data: { audio: btoa('fake mp3') } });
let run = store.getState().playMessage('one', '**Hello**');
assert.equal(contexts[0].state, 'running', 'audio unlocked synchronously on tap');
await settle();
assert.equal(calls[0].name, 'test-voice');
assert.equal(calls[0].options.body.text, 'Hello');
success(); await run;
assert.equal(store.getState().playingMessageId, 'one');
assert.equal(contexts[0].started, true);
contexts[0].player.onended();
assert.equal(store.getState().playingMessageId, null);
run = store.getState().playMessage('two', 'Cancel me'); await settle();
store.getState().stop(); success(); await run;
assert.equal(contexts[1].started, false, 'cancelled request cannot start audio');
run = store.getState().playMessage('three', 'Timeout'); await settle();
[...timers.values()][0]();
assert.equal(store.getState().loadingMessageId, null);
assert.equal(calls.at(-1).options.signal.aborted, true);
success(); await run;
assert.equal(contexts[2].started, false);
run = store.getState().playMessage('four', 'Failure'); await settle();
resolveRequest({ error: new Error('failure') }); await run;
assert.equal(store.getState().loadingMessageId, null);
assert.equal(notices.length, 2);
run = store.getState().playMessage('five', 'Voice takes over'); await settle();
fixture.onVoice({isActive:true}, {isActive:false}); success(); await run;
assert.equal(contexts.at(-1).started, false);
assert.equal(timers.size, 0);
console.log('PASS: read aloud playback, tap unlock, stop, timeout, errors, and voice takeover (no network)');
