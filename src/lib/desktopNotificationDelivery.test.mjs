import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./desktopNotificationDelivery.ts', import.meta.url), 'utf8');
const exports = {};
new Function('exports', ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(exports);
const { DesktopNotificationDelivery } = exports;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const item = (id, owner = 'alice') => ({ id, user_id: owner, title: `Alert ${id}` });

function harness(overrides = {}) {
  const calls = { pending: [], claim: [], show: [], register: [], disconnect: [], authStops: 0, wakeStops: 0 };
  const channels = [], timers = new Map(), claimed = new Set();
  let enabled = true, online = true, ownerCallback, wakeCallback, nextTimer = 0;
  const ports = {
    enabled: () => enabled,
    online: () => online,
    owner: async () => 'alice',
    onOwner: callback => { ownerCallback = callback; return () => { calls.authStops++; }; },
    onWake: callback => { wakeCallback = callback; return () => { calls.wakeStops++; }; },
    connect: (owner, callbacks) => { channels.push({ owner, ...callbacks }); return () => calls.disconnect.push(owner); },
    pending: async (owner, limit, signal) => { calls.pending.push({ owner, limit, signal }); return []; },
    claim: async (owner, id, signal) => {
      calls.claim.push({ owner, id, signal });
      const key = `${owner}:${id}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    show: async value => { calls.show.push(value); },
    register: async (owner, signal) => { calls.register.push({ owner, signal }); },
    setTimer: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => timers.delete(id),
    ...overrides,
  };
  const delivery = new DesktopNotificationDelivery(ports);
  return {
    delivery, ports, calls, channels, timers, claimed,
    owner: value => ownerCallback(value),
    wake: () => wakeCallback(),
    enabled: value => { enabled = value; delivery.refresh(); },
    online: value => { online = value; },
    ready: (channel = channels.at(-1)) => channel.system({ extension: 'postgres_changes', status: 'ok' }),
    fireTimer: async () => {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0]; timers.delete(id); timer.callback(); await tick();
      return timer.delay;
    },
  };
}

test('multiple consumers share one account subscription, backlog read and registration; final release cleans up', async () => {
  const h = harness();
  const releaseA = h.delivery.acquire(), releaseB = h.delivery.acquire();
  await tick();
  assert.equal(h.channels.length, 1);
  assert.equal(h.calls.pending.length, 1);
  assert.equal(h.calls.register.length, 1);
  assert.equal(h.calls.pending[0].owner, 'alice');
  releaseA(); releaseA();
  assert.equal(h.calls.disconnect.length, 0);
  releaseB();
  assert.deepEqual(h.calls.disconnect, ['alice']);
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.authStops, 1);
  assert.equal(h.calls.wakeStops, 1);
  assert.equal(h.calls.pending[0].signal.aborted, true);
  h.channels[0].change(); h.ready(h.channels[0]); h.wake(); h.owner('bob');
  await tick();
  assert.equal(h.calls.pending.length, 1);
  assert.equal(h.channels.length, 1);
});

test('disabled or signed-out consumers do no delivery I/O; enable, disable and remount work', async () => {
  const h = harness({ owner: async () => null });
  const release = h.delivery.acquire(); await tick();
  assert.equal(h.channels.length, 0);
  h.enabled(false); h.owner('alice'); await tick();
  assert.equal(h.channels.length, 0);
  h.enabled(true); await tick();
  assert.equal(h.calls.pending.length, 1);
  h.enabled(false); assert.equal(h.timers.size, 0);
  h.owner(null); h.enabled(true); await tick();
  assert.equal(h.channels.length, 1);
  release();
  h.ports.owner = async () => 'bob';
  const releaseAgain = h.delivery.acquire(); await tick();
  assert.equal(h.channels.at(-1).owner, 'bob');
  releaseAgain();
});

test('SUBSCRIBED alone retains bounded fallback; system-ready stops all idle polling and reconnect catches up', async () => {
  const h = harness(); const release = h.delivery.acquire(); await tick();
  h.channels.at(-1).status('SUBSCRIBED'); await tick();
  assert.equal(h.timers.size, 1);
  h.channels[0].system({ extension: 'presence', status: 'ok' });
  assert.equal(h.timers.size, 1);
  const delays = [];
  for (let n = 0; n < 7; n++) delays.push(await h.fireTimer());
  assert.deepEqual(delays, [30000, 60000, 120000, 240000, 300000, 300000, 300000]);
  h.ready(); await tick();
  assert.equal(h.timers.size, 0);
  const before = h.calls.pending.length; await tick();
  assert.equal(h.calls.pending.length, before);
  h.channels.at(-1).status('CHANNEL_ERROR');
  assert.equal(h.timers.size, 1);
  h.channels.at(-1).status('SUBSCRIBED'); await tick();
  assert.equal(h.timers.size, 1);
  h.ready(); await tick();
  assert.equal(h.timers.size, 0);
  assert.ok(h.calls.pending.length > before);
  h.channels.at(-1).system({ extension: 'postgres_changes', status: 'error' });
  assert.equal(h.timers.size, 1);
  release();
});

test('initial backlog, INSERT signals, focus and online recovery share serialized reads with atomic dedup', async () => {
  const pending = deferred(); const h = harness(); let reads = 0;
  h.ports.pending = async () => { reads++; return reads === 1 ? pending.promise : [item('one')]; };
  const release = h.delivery.acquire(); await tick();
  h.channels[0].change(); h.channels[0].change(); h.wake(); h.ready();
  await tick(); assert.equal(reads, 1);
  pending.resolve([item('one')]); await tick();
  assert.equal(reads, 2);
  assert.deepEqual(h.calls.show.map(value => value.id), ['one']);
  h.wake(); await tick();
  assert.equal(reads, 3);
  assert.equal(h.calls.show.length, 1);
  release();
});

test('two independent contexts racing the same backlog still show each notification only once', async () => {
  const claimed = new Set(), shown = [];
  const ports = {
    pending: async () => [item('shared')],
    claim: async (owner, id) => {
      assert.equal(owner, 'alice');
      if (claimed.has(id)) return false;
      claimed.add(id); return true;
    },
    show: async value => shown.push(value.id),
  };
  const a = harness(ports), b = harness(ports);
  const releaseA = a.delivery.acquire(), releaseB = b.delivery.acquire(); await tick();
  assert.deepEqual(shown, ['shared']);
  releaseA(); releaseB();
});

test('late pending results after account switch cannot claim or show old-account alerts', async () => {
  const pending = deferred(); const h = harness({ pending: async owner => owner === 'alice' ? pending.promise : [item('bob-alert', 'bob')] });
  const release = h.delivery.acquire(); await tick();
  const stale = h.channels[0]; h.owner('bob'); await tick();
  pending.resolve([item('alice-alert')]); stale.change(); stale.system({ extension: 'postgres_changes', status: 'ok' });
  await tick();
  assert.deepEqual(h.calls.claim.map(value => value.owner), ['bob']);
  assert.deepEqual(h.calls.show.map(value => value.id), ['bob-alert']);
  assert.deepEqual(h.calls.disconnect, ['alice']);
  release();
});

test('late successful claims after logout/disable/final release cannot show or continue the batch', async () => {
  for (const stop of [h => h.owner(null), h => h.enabled(false), (_h, release) => release()]) {
    const claim = deferred();
    const h = harness({ pending: async () => [item('one'), item('two')], claim: async () => claim.promise });
    const release = h.delivery.acquire(); await tick();
    stop(h, release); claim.resolve(true); await tick();
    assert.equal(h.calls.show.length, 0);
    assert.equal(h.timers.size, 0);
    release();
  }
});

test('late initial session reads cannot overwrite newer auth events, including logout', async () => {
  for (const owner of ['bob', null]) {
    const session = deferred(), h = harness({ owner: () => session.promise });
    const release = h.delivery.acquire(); h.owner(owner); await tick();
    session.resolve('alice'); await tick();
    assert.deepEqual(h.channels.map(channel => channel.owner), owner ? [owner] : []);
    release();
  }
});

test('foreign-account rows are rejected before claiming or displaying', async () => {
  const h = harness({ pending: async () => [item('foreign', 'bob'), item('ours')] });
  const release = h.delivery.acquire(); await tick();
  assert.deepEqual(h.calls.claim.map(value => value.id), ['ours']);
  assert.deepEqual(h.calls.show.map(value => value.id), ['ours']);
  release();
});

test('read and claim failures get bounded recovery even when Realtime is ready', async () => {
  for (const failure of ['pending', 'claim']) {
    const h = harness(); let fail = true;
    h.ports.pending = async () => {
      if (failure === 'pending' && fail) throw Error('offline');
      return [item('one')];
    };
    const claim = h.ports.claim;
    h.ports.claim = async (...args) => {
      if (failure === 'claim' && fail) throw Error('offline');
      return claim(...args);
    };
    const release = h.delivery.acquire(); await tick(); h.ready(); await tick();
    assert.equal(h.timers.size, 1);
    fail = false; await h.fireTimer();
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.show.length, 1);
    release();
  }
});

test('offline skips reads; wake after recovery drains missed notifications', async () => {
  const h = harness(); h.online(false);
  const release = h.delivery.acquire(); await tick();
  assert.equal(h.calls.pending.length, 0);
  await h.fireTimer(); assert.equal(h.calls.pending.length, 0);
  h.online(true); h.wake(); await tick();
  assert.equal(h.calls.pending.length, 1);
  h.ready(); await tick(); assert.equal(h.timers.size, 0);
  release();
});

test('native show failures are never unclaimed/retried as duplicate alerts', async () => {
  let shows = 0;
  const h = harness({ pending: async () => [item('one')], show: async () => { shows++; throw Error('uncertain native result'); } });
  const release = h.delivery.acquire(); await tick(); h.wake(); h.channels[0].change(); await tick();
  assert.equal(shows, 1);
  release();
});

test('large backlogs are drained in bounded batches and continue on recovery without missing rows', async () => {
  const rows = Array.from({ length: 61 }, (_, index) => item(String(index)));
  const h = harness();
  h.ports.pending = async (owner, limit) => rows.filter(row => !h.claimed.has(`${owner}:${row.id}`)).slice(0, limit);
  const release = h.delivery.acquire(); await tick();
  assert.equal(h.calls.show.length, 50);
  assert.equal(h.timers.size, 1);
  await h.fireTimer(); assert.equal(h.calls.show.length, 61);
  h.ready(); await tick(); assert.equal(h.timers.size, 0);
  release();
});


test('outage recovery replaces closed channels, ignoring late readiness/error/change from the old connection', async () => {
  const h = harness(); const release = h.delivery.acquire(); await tick();
  const stale = h.channels[0]; stale.status('CLOSED');
  await h.fireTimer();
  assert.equal(h.channels.length, 2);
  const before = h.calls.pending.length;
  stale.system({ extension: 'postgres_changes', status: 'ok' }); stale.change();
  await tick();
  assert.equal(h.calls.pending.length, before);
  assert.equal(h.timers.size, 1);
  h.ready(); await tick();
  stale.status('CHANNEL_ERROR');
  assert.equal(h.timers.size, 0);
  release();
});

test('failed channel construction retries with bounded backoff and recovers', async () => {
  const h = harness(); const connect = h.ports.connect; let fail = true;
  h.ports.connect = (...args) => { if (fail) throw Error('channel unavailable'); return connect(...args); };
  const release = h.delivery.acquire(); await tick();
  assert.equal(h.channels.length, 0);
  assert.equal(h.calls.pending.length, 1);
  fail = false; await h.fireTimer();
  assert.equal(h.channels.length, 1);
  h.ready(); await tick();
  assert.equal(h.timers.size, 0);
  release();
});
