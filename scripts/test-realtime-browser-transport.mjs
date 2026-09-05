import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

const bundled = await build({
  entryPoints: ['src/lib/realtimeBrowserTransport.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});

class Target {
  listeners = new Map();
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(fn);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((listener) => listener !== fn));
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...event });
  }
}

const documentTarget = new Target();
const elements = [];
globalThis.document = Object.assign(documentTarget, {
  body: { appendChild(element) { elements.push(element); } },
  createElement() {
    const element = Object.assign(new Target(), {
      autoplay: false,
      style: {},
      srcObject: null,
      playCalls: 0,
      paused: false,
      removed: false,
      setAttribute() {},
      removeAttribute() {},
      play() { this.playCalls++; return this.srcObject ? Promise.resolve() : Promise.reject(new Error('no source')); },
      pause() { this.paused = true; },
      remove() { this.removed = true; },
    });
    return element;
  },
});

class FakeDataChannel extends Target {
  readyState = 'connecting';
  sent = [];
  send(value) { this.sent.push(value); }
  close() { this.readyState = 'closed'; this.emit('close'); }
}

const peers = [];
class FakePeerConnection extends Target {
  connectionState = 'new';
  channel = new FakeDataChannel();
  tracks = [];
  localDescription = null;
  remoteDescription = null;
  closed = false;
  constructor() { super(); peers.push(this); }
  createDataChannel(name) { assert.equal(name, 'oai-events'); return this.channel; }
  addTrack(track, stream) { assert.equal(stream.getAudioTracks()[0], track); this.tracks.push(track); }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }
  async setLocalDescription(offer) { this.localDescription = offer; }
  async setRemoteDescription(answer) { this.remoteDescription = answer; }
  async getStats() { return new Map(); }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
globalThis.RTCPeerConnection = FakePeerConnection;

const makeTrack = () => ({ enabled: true, stopped: false, stop() { this.stopped = true; } });
const makeStream = (track = makeTrack()) => ({ getAudioTracks: () => [track], getTracks: () => [track] });
let getUserMedia;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { mediaDevices: { getUserMedia: (...args) => getUserMedia(...args) } },
});

let requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  return { ok: true, status: 200, text: async () => 'answer-sdp' };
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { RealtimeBrowserTransport } = await import(moduleUrl);

// Happy path: one mic, muted until explicitly enabled, one SDP request, and
// WebSocket-shaped event delivery over the data channel.
{
  const track = makeTrack();
  getUserMedia = async (constraints) => {
    assert.equal(constraints.audio.echoCancellation, true);
    assert.equal(constraints.audio.noiseSuppression, true);
    return makeStream(track);
  };
  const transport = new RealtimeBrowserTransport();
  let opened = 0;
  let message = '';
  let closed = 0;
  transport.onopen = () => opened++;
  transport.onmessage = (event) => { message = event.data; };
  transport.onclose = () => closed++;
  await transport.connect('ephemeral-test-key');
  assert.equal(peers.at(-1).tracks.length, 1);
  assert.equal(track.enabled, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.body, 'offer-sdp');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer ephemeral-test-key');
  peers.at(-1).channel.readyState = 'open';
  peers.at(-1).channel.emit('open');
  assert.equal(opened, 1);
  transport.setMuted(false);
  assert.equal(track.enabled, true);
  transport.send('{"type":"session.update"}');
  transport.clearOutput();
  assert.deepEqual(peers.at(-1).channel.sent, [
    '{"type":"session.update"}',
    '{"type":"output_audio_buffer.clear"}',
  ]);
  peers.at(-1).channel.emit('message', { data: '{"type":"session.updated"}' });
  assert.equal(message, '{"type":"session.updated"}');
  const remoteStream = makeStream();
  peers.at(-1).emit('track', { streams: [remoteStream], track: remoteStream.getAudioTracks()[0] });
  await Promise.resolve();
  assert.equal(transport.audioElement.srcObject, remoteStream);
  assert.equal(transport.audioElement.playCalls, 1);
  assert.equal((documentTarget.listeners.get('pointerup') ?? []).length, 0, 'successful playback removes retry listener');
  transport.close();
  assert.equal(track.stopped, true);
  assert.equal(peers.at(-1).closed, true);
  assert.equal(elements.at(-1).removed, true);
  assert.equal(closed, 1);
}

// Closing while microphone permission is pending stops the eventually granted
// track and never reaches SDP negotiation.
{
  let grant;
  getUserMedia = () => new Promise((resolve) => { grant = resolve; });
  const transport = new RealtimeBrowserTransport();
  let errors = 0;
  let closes = 0;
  transport.onerror = () => errors++;
  transport.onclose = () => closes++;
  const pending = transport.connect('ephemeral-late').catch((error) => error);
  transport.close();
  const lateTrack = makeTrack();
  grant(makeStream(lateTrack));
  const error = await pending;
  assert.equal(error.name, 'AbortError');
  assert.equal(lateTrack.stopped, true);
  assert.equal(requests.length, 1, 'late permission must not create another session');
  assert.equal(errors, 0, 'manual close must not become a transport error');
  assert.equal(closes, 1);
}

// Negotiation failure stops capture and emits one error/close pair.
{
  const failedTrack = makeTrack();
  getUserMedia = async () => makeStream(failedTrack);
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'denied' });
  const transport = new RealtimeBrowserTransport();
  let errors = 0;
  let closes = 0;
  transport.onerror = () => errors++;
  transport.onclose = () => closes++;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(transport.connect('bad-key'), /401/);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failedTrack.stopped, true);
  assert.equal(errors, 1);
  assert.equal(closes, 1);
  assert.equal(transport.readyState, RealtimeBrowserTransport.CLOSED);
}

console.log('PASS: WebRTC transport session, mute, events, late permission, failure, and cleanup');
