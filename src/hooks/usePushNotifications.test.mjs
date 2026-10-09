import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const deliveryExports = {};
new Function('exports', compile(await readFile(new URL('../lib/desktopNotificationDelivery.ts', import.meta.url), 'utf8')))(deliveryExports);
const hookSource = compile(await readFile(new URL('./usePushNotifications.ts', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));

// Execute the real hook adapter and controller. The hook shim only collects mount effects.
function harness() {
  const effects = [], queries = [], channels = [], shows = [], timers = new Map();
  const rows = [{ id: 'one', user_id: 'alice', title: 'A notification', body: '', url: '/', tag: null }];
  const claims = new Set(), storage = new Map([['arcai-desktop-notifications-enabled', 'true']]);
  const native = { getDeviceId: async () => 'device', enable: async () => ({ ok: true }), show: async item => { shows.push(item); return { ok: true }; } };
  const window = Object.assign(new EventTarget(), { arcaiDesktop: { notifications: native }, matchMedia: () => ({ matches: false }) });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const navigator = { userAgent: 'ArcAIInternalAuth/1', platform: 'MacIntel', maxTouchPoints: 0, onLine: true };
  window.navigator = navigator;
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  let authCallback, authStops = 0, removed = 0, delivery, timerId = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'alice' } } } }),
      getUser: async () => ({ data: { user: { id: 'alice' } } }),
      onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe: () => { authStops++; } } } }; },
    },
    from: table => {
      const query = { table, operations: [] };
      const builder = {};
      for (const name of ['select', 'eq', 'is', 'order', 'limit', 'abortSignal', 'update', 'upsert', 'delete', 'maybeSingle']) {
        builder[name] = (...args) => { query.operations.push([name, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => {
        queries.push(query);
        const update = query.operations.find(([name]) => name === 'update');
        let data = null;
        if (table === 'desktop_notifications' && update) {
          const id = query.operations.find(([name, key]) => name === 'eq' && key === 'id')?.[2];
          if (!claims.has(id)) { claims.add(id); data = { id }; }
        } else if (table === 'desktop_notifications') data = rows.filter(item => !claims.has(item.id));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return builder;
    },
    channel: name => {
      const channel = {
        name, bindings: [],
        on(type, filter, callback) { this.bindings.push({ type, filter, callback }); return this; },
        subscribe(callback) { this.status = callback; return this; },
      };
      channels.push(channel); return channel;
    },
    removeChannel: async () => { removed++; },
  };
  const exports = {};
  const modules = {
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect: effect => effects.push(effect), useCallback: callback => callback },
    '@/integrations/supabase/client': { supabase: client },
    '@/lib/desktopNotificationDelivery': { DesktopNotificationDelivery: class extends deliveryExports.DesktopNotificationDelivery {
      constructor(ports) { super(ports); delivery = this; }
    } },
  };
  new Function('exports', 'require', 'window', 'document', 'navigator', 'localStorage', 'setTimeout', 'clearTimeout', hookSource)(
    exports, name => { assert.ok(modules[name], `Unexpected import: ${name}`); return modules[name]; },
    window, document, navigator, localStorage,
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, id => timers.delete(id),
  );
  const hookA = exports.usePushNotifications(), hookB = exports.usePushNotifications();
  const cleanup = effects.map(effect => effect()).filter(Boolean);
  return { queries, channels, shows, timers, native, localStorage, window, document, hookA, hookB, delivery,
    stop: () => cleanup.forEach(fn => fn()), authStops: () => authStops, removed: () => removed,
    auth: id => authCallback(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null) };
}

test('hook mounts share real delivery and adapter scopes channel, SELECT and atomic UPDATE to account', async () => {
  const h = harness(); await tick();
  assert.equal(h.channels.length, 1);
  assert.equal(h.channels[0].name, 'desktop-notifications:alice:1');
  const binding = h.channels[0].bindings.find(value => value.type === 'postgres_changes');
  assert.deepEqual(binding.filter, { event: 'INSERT', schema: 'public', table: 'desktop_notifications', filter: 'user_id=eq.alice' });
  const reads = h.queries.filter(query => query.table === 'desktop_notifications' && !query.operations.some(([op]) => op === 'update'));
  const updates = h.queries.filter(query => query.operations.some(([op]) => op === 'update'));
  assert.equal(reads.length, 1); assert.equal(updates.length, 1);
  for (const query of [...reads, ...updates]) {
    assert.ok(query.operations.some(([op, key, value]) => op === 'eq' && key === 'user_id' && value === 'alice'));
    assert.ok(query.operations.some(([op, key, value]) => op === 'is' && key === 'delivered_at' && value === null));
    assert.ok(query.operations.some(([op, signal]) => op === 'abortSignal' && signal instanceof AbortSignal));
  }
  assert.ok(updates[0].operations.some(([op, key, value]) => op === 'eq' && key === 'id' && value === 'one'));
  assert.ok(updates[0].operations.some(([op, column]) => op === 'select' && column === 'id'));
  assert.equal(h.queries.filter(query => query.table === 'desktop_notification_devices').length, 1);
  assert.equal(h.shows.length, 1);
  h.channels[0].status('SUBSCRIBED'); await tick(); assert.equal(h.timers.size, 1);
  h.channels[0].bindings.find(value => value.type === 'system').callback({ extension: 'postgres_changes', status: 'ok' });
  await tick(); assert.equal(h.timers.size, 0);
  h.window.dispatchEvent(new Event('focus')); await tick();
  assert.equal(h.shows.length, 1);
  h.stop(); assert.equal(h.authStops(), 1); assert.equal(h.removed(), 1);
  const before = h.queries.length;
  h.window.dispatchEvent(new Event('focus')); h.document.dispatchEvent(new Event('visibilitychange'));
  await tick(); assert.equal(h.queries.length, before);
});

test('hook disable fences delivery immediately, even while native device lookup is pending', async () => {
  const h = harness(); await tick();
  let finishDevice;
  h.native.getDeviceId = () => new Promise(resolve => { finishDevice = resolve; });
  const pending = h.hookA.unsubscribe();
  assert.equal(h.localStorage.getItem('arcai-desktop-notifications-enabled'), undefined);
  assert.equal(h.timers.size, 0);
  assert.equal(h.removed(), 1);
  finishDevice('device'); await pending;
  h.stop();
});
