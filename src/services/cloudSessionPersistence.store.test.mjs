import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const changesUrl = moduleUrl(await read('./cloudSessionChanges.ts'));
const adapterUrl = moduleUrl((await read('./cloudSessionPersistence.ts')).replace("'./cloudSessionChanges'", JSON.stringify(changesUrl)));
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const msg = (id, content = id) => ({ id, content, role: 'user', type: 'text', timestamp: '2026-09-12T00:00:00.000Z' });
let serial = 0;
async function fixture({ enabled = true, localOnly = false, protectedSession = true, missing = false, rpcError = null, legacyWaitMs = 5000 } = {}) {
  const storage = new Map(), calls = [];
  let remote = { id, user_id: owner, title: 'Discovered', created_at: '2026-09-12T00:00:00Z', updated_at: '2026-09-12T00:00:00Z', messages: [msg('a')], canvas_content: null, revision: 2, persistence_version: 1 };
  let replyGate, saveGate, saveError, currentOwner = owner;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: currentOwner } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (rpcError) return { error: { code: rpcError }, data: null };
      if (args.p_operation.kind === 'append') remote.messages.push(args.p_operation.message);
      return { error: null, data: { operation_id: args.p_operation_id, session_revision: ++remote.revision, replayed: false } };
    },
    from: table => {
      const query = { table, filters: [] };
      const chain = {
        select() { return chain; }, eq(k, v) { query.filters.push([k, v]); return chain; },
        async single() { calls.push(query); if (replyGate) await replyGate; return { data: structuredClone(remote), error: null }; },
        async maybeSingle() { calls.push(query); return { data: missing ? null : structuredClone(remote), error: null }; },
        async upsert(value) {
          calls.push({ upsert: value }); if (saveGate) await saveGate;
          if (saveError) return { error: saveError };
          Object.assign(remote, JSON.parse(JSON.stringify(value))); missing = false;
          return { error: null };
        },
        async insert(value) { calls.push({ insert: structuredClone(value) }); remote = { ...remote, ...value }; missing = false; return { error: null }; },
      };
      return chain;
    },
  };
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.__storeFixture = {
    supabase,
    create: () => initializer => {
      let state;
      const set = value => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; };
      const get = () => state;
      state = initializer(set, get);
      return { getState: get, setState: set };
    },
  };
  let source = await read('../store/useArcStore.ts');
  source = source.replace(/^import .*;$/gm, line => {
    if (line.includes('cloudSessionPersistence')) return `import { createCloudSessionPersistence } from ${JSON.stringify(adapterUrl)};`;
    if (line.includes('cloudSessionChanges')) return `import { transcriptChanges } from ${JSON.stringify(changesUrl)};`;
    return '';
  });
  source = `const { create, supabase } = globalThis.__storeFixture;
    const persist = fn => fn; const isSupabaseConfigured = true;
    const useCanvasStore = {}; const detectMemoryCommand = () => null;
    const addToMemoryBank = () => {}; const formatMemoryConfirmation = () => '';\n` + source;
  source = source.replace("import.meta.env.VITE_CLOUD_SESSION_OPERATIONS_ENABLED === 'true'", String(enabled));
  source = source.replace('const LEGACY_SAVE_WAIT_MS = 5_000;', `const LEGACY_SAVE_WAIT_MS = ${legacyWaitMs};`);
  const { useArcStore: store } = await import(moduleUrl(source + `\n// fixture ${++serial}`));
  store.setState({ currentSessionId: id, messages: [msg('a')], chatSessions: [{
    id, title: 'test', messages: [msg('a')], isHydrated: true, isLocalOnly: localOnly,
    createdAt: new Date(), lastMessageAt: new Date(),
    ...(protectedSession ? { persistenceVersion: 1, persistenceOwnerId: owner, revision: 2 } : {}),
  }] });
  return { store, storage, calls, remote, gate: value => { replyGate = value; },
    saveGate: value => { saveGate = value; }, saveError: value => { saveError = value; }, owner: value => { currentOwner = value; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('prepare waits for one existing legacy save, without a second write', async () => {
  const f = await fixture({ protectedSession: false }); f.remote.persistence_version = 0;
  const gate = deferred(); f.saveGate(gate.promise);
  await f.store.getState().addMessage({ role: 'user', type: 'text', content: 'new' });
  let prepared = false;
  const preparation = f.store.getState().prepareCloudSession(id).then(value => { prepared = true; return value; });
  await tick(); assert.equal(prepared, false);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
  gate.resolve(); await preparation;
  assert.equal(f.remote.messages.length, 2);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
  assert.equal(f.calls.some(c => c.insert || c.name), false);
});

test('bounded pending-save wait does not cancel or replay an ambiguous write', async () => {
  const f = await fixture({ protectedSession: false, legacyWaitMs: 5 }); f.remote.persistence_version = 0;
  const gate = deferred(); f.saveGate(gate.promise);
  await f.store.getState().addMessage({ role: 'user', type: 'text', content: 'new' });
  await assert.rejects(f.store.getState().prepareCloudSession(id), /still pending/);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
  assert.equal(f.calls.some(c => c.insert || c.name), false);
  gate.resolve(); await tick();
  assert.equal((await f.store.getState().prepareCloudSession(id)).revision, 2);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
});

test('failed acknowledgement blocks preparation until explicit reload, no automatic replay', async () => {
  const f = await fixture({ protectedSession: false }); f.remote.persistence_version = 0;
  const gate = deferred(); f.saveGate(gate.promise); f.saveError({ message: 'fetch failed' });
  await f.store.getState().addMessage({ role: 'user', type: 'text', content: 'new' });
  const preparation = f.store.getState().prepareCloudSession(id);
  gate.resolve(); await assert.rejects(preparation, /not confirmed/);
  await assert.rejects(f.store.getState().prepareCloudSession(id), /not confirmed/);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
  assert.equal(f.calls.some(c => c.insert || c.name), false);
  await f.store.getState().reloadCloudSession(id);
  await f.store.getState().prepareCloudSession(id);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
});

test('owner changes and concurrent edits while waiting fail before prepare writes', async () => {
  for (const mutate of [f => f.owner('33333333-3333-4333-8333-333333333333'), f => f.store.getState().editMessage('a', 'edited')]) {
    const f = await fixture({ protectedSession: false }); f.remote.persistence_version = 0;
    const gate = deferred(); f.saveGate(gate.promise);
    await f.store.getState().addMessage({ role: 'user', type: 'text', content: 'new' });
    const preparation = f.store.getState().prepareCloudSession(id);
    await tick(); mutate(f); gate.resolve();
    await assert.rejects(preparation, /changed/);
    assert.equal(f.calls.some(c => c.insert || c.name), false);
  }
});

test('specific protected stale rejection preserves connectivity but still rejects and surfaces reload', async () => {
  const f = await fixture({ protectedSession: false }); f.remote.persistence_version = 0;
  f.saveError({ code: '42501', message: 'Cloud session requires a versioned server write; reload before editing' });
  await assert.rejects(f.store.getState().saveChatToSupabase(f.store.getState().chatSessions[0]));
  assert.equal(f.store.getState().isOnline, true);
  assert.match(f.store.getState().sessionSaveErrors[id], /stale save.*Reload/);
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
});

for (const enabled of [false, true]) test(`legacy voice payload and failure behavior remain unchanged (gate ${enabled})`, async () => {
  const f = await fixture({ enabled, protectedSession: false }); f.remote.persistence_version = 0;
  await f.store.getState().addMessage({ role: 'assistant', type: 'text', content: 'Voice reply', sourceModel: 'cloud-voice', modelUsed: 'gpt-live-1' });
  await tick();
  assert.equal(f.calls.filter(c => c.upsert).length, 1);
  assert.equal(f.remote.messages.at(-1).sourceModel, 'cloud-voice');
  assert.equal(f.remote.messages.at(-1).modelUsed, 'gpt-live-1');
  f.saveError({ code: '42501', message: 'unrelated permission denied' });
  await assert.rejects(f.store.getState().saveChatToSupabase(f.store.getState().chatSessions[0]));
  assert.equal(f.store.getState().isOnline, false);
});

test('background completion flushes without local metadata and hydrates only the discovered session', async () => {
  const f = await fixture();
  f.store.setState({ chatSessions: [], currentSessionId: 'other', messages: [msg('other')] });
  assert.equal((await f.store.getState().flushCloudSession(id)).status, 'complete');
  assert.equal((await f.store.getState().reloadCloudSession(id)).status, 'reloaded');
  assert.equal(f.store.getState().chatSessions[0].persistenceOwnerId, owner);
  assert.equal(f.store.getState().chatSessions[0].title, 'Discovered');
  assert.equal(f.store.getState().messages[0].id, 'other');
});

test('metadata-only session needs no preassigned owner for empty outbox flush', async () => {
  const f = await fixture({ protectedSession: false });
  f.store.setState({ chatSessions: f.store.getState().chatSessions.map(s => ({ ...s, messages: [], isHydrated: false })) });
  assert.equal((await f.store.getState().flushCloudSession(id)).status, 'complete');
  assert.equal((await f.store.getState().reloadCloudSession(id)).status, 'reloaded');
  assert.ok(f.store.getState().chatSessions[0].messages[0].timestamp instanceof Date);
});

test('aborted completion never applies fetched messages', async () => {
  const f = await fixture();
  const controller = new AbortController();
  let release;
  f.gate(new Promise(resolve => { release = resolve; }));
  f.remote.messages = [msg('remote')];
  const reload = f.store.getState().reloadCloudSession(id, undefined, controller.signal);
  await tick();
  controller.abort();
  release();
  await assert.rejects(reload, { name: 'AbortError' });
  assert.equal(f.store.getState().messages[0].id, 'a');
  const count = f.calls.length;
  await assert.rejects(f.store.getState().reloadCloudSession(id, 0, controller.signal), { name: 'AbortError' });
  assert.equal(f.calls.length, count);
});

test('reload does not resurrect a session deleted during fetch', async () => {
  const f = await fixture();
  let release;
  f.gate(new Promise(resolve => { release = resolve; }));
  const reload = f.store.getState().reloadCloudSession(id);
  await tick();
  f.store.setState({ chatSessions: [] });
  release();
  assert.equal((await reload).status, 'stale');
  assert.equal(f.store.getState().chatSessions.length, 0);
});

test('protected edit captures expected message and semantic removals, never upsert', async () => {
  const f = await fixture();
  f.store.getState().editMessage('a', 'edited');
  assert.equal(f.storage.size, 1, 'intent journaled synchronously');
  await tick();
  const call = f.calls.find(c => c.name);
  assert.equal(call.args.p_operation.kind, 'replace');
  assert.equal(call.args.p_operation.expected.content, 'a');
  assert.equal(call.args.p_operation.message.content, 'edited');
  assert.ok(!f.calls.some(c => c.upsert));
});

test('canvas mutation outside updater captures true before value', async () => {
  const f = await fixture();
  await f.store.getState().updateSessionCanvasContent(id, 'new canvas');
  assert.deepEqual(f.calls.find(c => c.name).args.p_operation, { kind: 'canvas', expected: null, value: 'new canvas' });
});

test('authoritative reload accepts shorter transcript and never changes another selected chat', async () => {
  const f = await fixture();
  f.remote.messages = [];
  f.remote.revision = 5;
  f.store.setState({ currentSessionId: 'other', messages: [msg('other')] });
  assert.deepEqual(await f.store.getState().reloadCloudSession(id, 5), { status: 'reloaded', revision: 5 });
  assert.deepEqual(f.store.getState().chatSessions[0].messages, []);
  assert.equal(f.store.getState().messages[0].id, 'other');
  assert.deepEqual(f.calls[0].filters, [['id', id], ['user_id', owner]]);
});

test('authoritative reload normalizes ISO timestamps for message consumers', async () => {
  const f = await fixture();
  await f.store.getState().reloadCloudSession(id);
  assert.ok(f.store.getState().messages[0].timestamp instanceof Date);
  assert.equal(f.store.getState().messages[0].timestamp.toISOString(), '2026-09-12T00:00:00.000Z');
});

test('preparation rejects differing existing history without deletion or append RPC', async () => {
  const f = await fixture();
  f.remote.messages.push(msg('remote-only'));
  await assert.rejects(f.store.getState().prepareCloudSession(id), /differ/);
  assert.ok(!f.calls.some(c => c.name || c.upsert || c.insert));
});

test('preparing existing history does not append a final user turn', async () => {
  const f = await fixture();
  assert.deepEqual(await f.store.getState().prepareCloudSession(id), { revision: 2 });
  assert.ok(!f.calls.some(c => c.name || c.upsert || c.insert));
  assert.equal(f.store.getState().messages.length, 1);
});

test('new row is inserted empty before semantic existing-history operations', async () => {
  const f = await fixture({ missing: true, protectedSession: false });
  await f.store.getState().prepareCloudSession(id);
  const insertIndex = f.calls.findIndex(c => c.insert);
  const operationIndex = f.calls.findIndex(c => c.name);
  assert.ok(insertIndex >= 0 && operationIndex > insertIndex);
  assert.deepEqual(f.calls[insertIndex].insert.messages, []);
  assert.equal(f.calls[operationIndex].args.p_operation.message.id, 'a');
  assert.ok(!f.calls.some(c => c.upsert));
});

test('uncertain save retains journal and reload refuses to overwrite pending edits', async () => {
  const f = await fixture({ rpcError: 'network' });
  f.store.getState().editMessage('a', 'pending edit');
  await tick();
  assert.equal((await f.store.getState().reloadCloudSession(id)).status, 'pending');
  assert.match(f.store.getState().sessionSaveErrors[id], /uncertain/);
  const journal = JSON.parse([...f.storage.values()][0]);
  assert.equal(journal.ownerId, owner);
  assert.equal(journal.pending[0].operation.message.content, 'pending edit');
});

for (const mutation of ['addMessage', 'replaceMessage', 'replaceLastMessage', 'upsertCanvasMessage', 'upsertCodeMessage', 'updateMessageMemoryAction']) {
  test(`${mutation} journals semantic intent for protected sessions`, async () => {
    const f = await fixture();
    const s = f.store.getState();
    if (mutation === 'addMessage' || mutation === 'replaceLastMessage') await s[mutation](msg('ignored', 'new'));
    if (mutation === 'replaceMessage') await s.replaceMessage('a', msg('ignored', 'new'));
    if (mutation === 'upsertCanvasMessage') await s.upsertCanvasMessage('document', 'Doc');
    if (mutation === 'upsertCodeMessage') await s.upsertCodeMessage('code', 'js', 'Code');
    if (mutation === 'updateMessageMemoryAction') s.updateMessageMemoryAction('a', { type: 'memory_saved' });
    await tick();
    assert.ok(f.calls.some(c => c.name === 'apply_chat_session_operation'));
    assert.ok(!f.calls.some(c => c.upsert));
  });
}

test('reload rejects stale revision and local mutation during fetch', async () => {
  const f = await fixture();
  assert.equal((await f.store.getState().reloadCloudSession(id, 3)).status, 'stale');
  let release;
  f.gate(new Promise(resolve => { release = resolve; }));
  const reload = f.store.getState().reloadCloudSession(id);
  await tick();
  f.store.getState().editMessage('a', 'new local');
  await tick();
  release();
  assert.equal((await reload).status, 'pending');
  assert.equal(f.store.getState().messages[0].content, 'new local');
});

test('local-only never journals or calls database', async () => {
  const f = await fixture({ localOnly: true });
  await f.store.getState().updateSessionCanvasContent(id, 'private');
  assert.equal(f.calls.length, 0);
  assert.equal(f.storage.size, 0);
});

test('disabled activation rejects prepare and protected save explicitly', async () => {
  const f = await fixture({ enabled: false });
  await assert.rejects(f.store.getState().prepareCloudSession(id), /not enabled/);
  await assert.rejects(f.store.getState().saveChatToSupabase(f.store.getState().chatSessions[0]), /not enabled/);
  await tick();
  assert.match(f.store.getState().sessionSaveErrors[id], /not enabled/);
  assert.equal(f.calls.length, 0);
});

test('unprotected legacy save retains full legacy path when migration gate disabled', async () => {
  const f = await fixture({ enabled: false, protectedSession: false });
  f.remote.persistence_version = 0;
  await f.store.getState().saveChatToSupabase(f.store.getState().chatSessions[0]);
  assert.ok(f.calls.some(c => c.upsert));
  assert.equal(f.storage.size, 0);
});
