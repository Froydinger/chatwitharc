import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

// Exercise the production hook and PCM probe with a fake socket/clock. No API
// requests, microphone permission, animation frames, or paid calls are needed.
let now = 0;
let nextTimer = 1;
const timers = new Map();
const original = { setTimeout, clearTimeout, setInterval, clearInterval, performance, WebSocket: globalThis.WebSocket };
globalThis.setTimeout = (fn, delay = 0) => { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.setInterval = () => nextTimer++;
globalThis.clearInterval = () => {};
Object.defineProperty(globalThis, 'performance', { configurable: true, writable: true, value: { now: () => now } });
function advance(ms) {
  const end = now + ms;
  while (true) {
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at; timers.delete(next[0]); next[1].fn();
  }
  now = end;
}
let socket;
class FakeSocket {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 1;
  sent = [];
  constructor() { socket = this; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  emit(event) { this.onmessage({ data: JSON.stringify(event) }); }
}
globalThis.WebSocket = FakeSocket;
const state = {
  isActive: true, isAudioPlaying: false, status: 'listening', selectedVoice: 'marin',
  currentTranscript: '', inputAmplitude: 0, hasPendingSpeech: false, conversationHistory: [],
  setStatus(v) { state.status = v; },
  setCurrentTranscript(v) { state.currentTranscript = v; },
  setHasPendingSpeech(v) { state.hasPendingSpeech = v; },
  setIsAudioPlaying(v) { state.isAudioPlaying = v; },
  addConversationTurn() {}, setOutputAmplitude() {},
};
globalThis.__arcVoiceTest = { state };
const bundle = async entry => build({
  entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'voice-test-dependencies', setup(b) {
    b.onResolve({ filter: /^(react|@\/store\/useVoiceModeStore|@\/integrations\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: path === 'react' ? `
      export const useRef = v => ({current:v}); export const useCallback = f => f;
      export const useState = v => [v, () => {}]; export const useEffect = f => { f(); };
    ` : path.includes('supabase') ? `
      export const supabase = { auth: {getSession: async () => ({data:{session:{access_token:'test'}}})},
        functions: {invoke: async () => ({data:{client_secret:'test', model:'gpt-realtime-2.1-mini'}})} };
    ` : `
      export const useVoiceModeStore = Object.assign(() => globalThis.__arcVoiceTest.state, { getState: () => globalThis.__arcVoiceTest.state });
      export const REALTIME_SUPPORTED_VOICES = ['marin','cedar'];
    ` }));
  } }],
});
const result = await bundle('src/hooks/useOpenAIRealtime.tsx');
const { useOpenAIRealtime } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const probeCode = await build({entryPoints:['src/lib/bargeInProbe.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const { BargeInProbe } = await import(`data:text/javascript;base64,${Buffer.from(probeCode.outputFiles[0].text).toString('base64')}`);
const clickProbe = new BargeInProbe('clicks', 0);
clickProbe.addAudio(new Int16Array(240 * 8).fill(1200), 180);
clickProbe.addAudio(new Int16Array(240 * 2), 200);
clickProbe.addAudio(new Int16Array(240 * 8).fill(1200), 280);
assert.equal(clickProbe.confirmed, false, 'separated clicks/cough bursts must not accumulate');
const speechProbe = new BargeInProbe('speech', 0);
speechProbe.addAudio(new Int16Array(240 * 16).fill(1200), 260);
assert.equal(speechProbe.confirmed, true, 'sustained voice-level audio must remain interruptible');
let ducks = 0, cuts = 0, restores = 0, chunks = 0;
const hook = useOpenAIRealtime({
  onInterruptProbeStart() { ducks++; }, onInterruptProbeRejected() { restores++; },
  onInterrupt() { cuts++; state.isAudioPlaying = false; state.status = 'listening'; return 50; },
  onAudioData() { chunks++; state.isAudioPlaying = true; },
});
const pcm = level => new Int16Array(4096).fill(level);
const audio = (id) => socket.emit({ type: 'response.output_audio.delta', response_id: id, item_id: `item-${id}`, delta: Buffer.from(pcm(1000).buffer).toString('base64') });
const start = id => { socket.emit({type:'response.created', response:{id}}); audio(id); };
const done = (id, status = 'completed') => socket.emit({type:'response.done', response:{id,status}});
const speech = () => socket.emit({type:'input_audio_buffer.speech_started'});
const feed = (level = 1200) => { advance(180); hook.sendAudio(pcm(level)); advance(180); hook.sendAudio(pcm(level)); advance(100); };
try {
  await hook.connect('Test'); socket.onopen(); socket.emit({type:'session.created',session:{id:'session-1'}});
  assert.equal(socket.sent.find(e=>e.type==='session.update').session.audio.input.transcription.model, 'gpt-transcribe');
  assert.equal(socket.sent.find(e=>e.type==='session.update').session.audio.input.turn_detection.threshold, 0.60);
  assert.equal(socket.sent.find(e=>e.type==='session.update').session.audio.input.turn_detection.silence_duration_ms, 1000);
  // Three sustained speech interruptions, including speech with the visual
  // meter frozen.
  for (const id of ['one','two','three']) {
    start(id); speech(); feed(); done(id,'cancelled');
    const count = chunks; audio(id); assert.equal(chunks,count,'cancelled audio stays suppressed');
  }
  assert.equal(cuts,3); assert.equal(ducks,3);
  assert.equal(socket.sent.filter(e=>e.type==='response.cancel').length,3);
  assert.deepEqual(socket.sent.filter(e=>e.type==='conversation.item.truncate').map(e=>e.item_id),['item-one','item-two','item-three']);
  // Queued audio stays interruptible after generation ends, without cancelling
  // a nonexistent server response or starting another paid response.
  start('queued'); done('queued'); speech(); feed();
  assert.equal(cuts,4); assert.equal(socket.sent.filter(e=>e.type==='response.cancel').length,3);
  assert.equal(socket.sent.filter(e=>e.type==='conversation.item.truncate').at(-1).item_id,'item-queued');
  // Breathing / handling noise may trigger server speech_started, but must not
  // cut off Arc unless it becomes sustained voice-like audio.
  start('breath'); speech(); feed(120);
  assert.equal(cuts,4); assert.ok(restores>=1);
  // Echo vanishes after ducking: restore playback, do not cut.
  start('echo'); speech(); advance(80); hook.sendAudio(pcm(10000)); feed(0);
  assert.equal(cuts,4); assert.ok(restores>=1);
  // Late completion of an old response cannot reset the fresh turn or clear mic.
  start('fresh'); state.currentTranscript='fresh text'; state.hasPendingSpeech=true;
  done('one','cancelled'); assert.equal(state.currentTranscript,'fresh text'); assert.equal(state.hasPendingSpeech,true);
  assert.equal(socket.sent.filter(e=>e.type==='input_audio_buffer.clear').length,0);
  // A pending old probe cannot cancel a newly-created response.
  speech(); start('newer'); feed(); assert.equal(cuts,4);
  // Natural completion while the user speaks must preserve the interruption.
  speech(); done('newer'); feed(); assert.equal(cuts,5);
  assert.equal(state.hasPendingSpeech,true);
  // Reconnection resets pending probes, response history, and audio IDs.
  start('reconnect-old'); speech(); hook.disconnect(); await hook.connect('Test');
  socket.onopen(); socket.emit({type:'session.created',session:{id:'session-2'}}); feed(); assert.equal(cuts,5);
  start('one'); speech(); feed(); assert.equal(cuts,6);
  assert.equal(socket.sent.filter(e=>e.type==='response.create').length,0,'probe must never create paid responses');
  // Real playback hook: every scheduled source stops, and its delayed onended
  // callback cannot reset the next playback burst.
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const sources = [];
  const gains = [];
  const node = () => ({ connect() {}, disconnect() {} });
  globalThis.AudioContext = class {
    state = 'running'; destination = {}; get currentTime() { return now / 1000; }
    createAnalyser() { return node(); }
    createGain() { const gain = { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value=v; }, exponentialRampToValueAtTime(v) { this.value=v; } }; gains.push(gain); return {...node(),gain}; }
    createBuffer(channels,length,rate) { return {duration:length/rate,getChannelData:()=>new Float32Array(length)}; }
    createBufferSource() { const source = {...node(),start() {},stop() { this.stopped=true; }}; sources.push(source); return source; }
    close() { this.state='closed'; }
  };
  const playbackCode = await bundle('src/hooks/useAudioPlayback.tsx');
  const { useAudioPlayback } = await import(`data:text/javascript;base64,${Buffer.from(playbackCode.outputFiles[0].text).toString('base64')}`);
  state.status='listening';
  const playback = useAudioPlayback();
  for (let i=0;i<3;i++) {
    playback.queueAudio(pcm(1000)); playback.queueAudio(pcm(1000));
    const oldSources=sources.slice(-2);
    playback.duckPlayback(); assert.equal(gains[0].value,0.0001);
    playback.restorePlayback(); assert.equal(gains[0].value,1);
    advance(100);
    const played=playback.clearQueue(); assert.ok(played>=0 && played<=342);
    assert.ok(oldSources.every(source=>source.stopped));
    advance(110); playback.queueAudio(pcm(1000));
    oldSources.forEach(source=>source.onended());
    assert.equal(state.isAudioPlaying,true,'old source cannot reset new playback');
    sources.at(-1).onended();
    assert.equal(state.isAudioPlaying,false);
  }
  playback.stopPlayback();
  delete globalThis.AudioContext; delete globalThis.document;
  console.log('PASS: repeated/quiet interruptions, echo, queued playback, stale events, reconnect, playback cutoff, no extra responses');
} finally {
  hook.disconnect();
  Object.assign(globalThis, original);
  delete globalThis.__arcVoiceTest;
}
