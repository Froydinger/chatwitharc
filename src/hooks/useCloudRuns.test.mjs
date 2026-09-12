import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
async function load(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', js)(exports, name => imports[name] ?? require(name));
  return exports;
}
const lifecycle = await load('../services/cloudRunLifecycle.ts');
const { CloudRunsBinding, useCloudRuns, CloudRunsProvider } = await load('./useCloudRuns.ts', { '@/services/cloudRunLifecycle': lifecycle });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const input = sessionId => ({ sessionId, mode: 'ask', request: { messages: [{ role: 'user', content: 'Hi' }] },
  expectedRevision: 3, userMessage: { id: `message-${sessionId}`, role: 'user', type: 'text', content: 'Hi', timestamp: '2026-09-12T00:00:00.000Z' } });
function harness(overrides = {}, options = {}) {
  const calls = [], snapshots = [], terminals = []; let n = 0;
  const ports = {
    ownerId: async () => 'owner', uuid: () => `run-${++n}`,
    list: async query => { calls.push(['list', query]); return { runs: [], nextCursor: null }; },
    submit: async s => { calls.push(['submit', s]); return { id: s.id, status: 'queued', sessionRevision: 4, replayed: false }; },
    status: async id => { calls.push(['status', id]); return { id, status: 'completed' }; },
    cancel: async id => { calls.push(['cancel', id]); return { id, status: 'cancelled' }; },
    respond: async (id, response) => { calls.push(['respond', id, response]); return { id, status: 'queued' }; }, ...overrides,
  };
  const binding = new CloudRunsBinding('owner', {
    createLifecycle: async (opts, owner) => new lifecycle.CloudRunLifecycle(owner, ports, { ...opts, intervalMs: 1, maxPolls: 2 }),
    onChange: s => snapshots.push(s), onTerminal: (entry, context) => terminals.push({ entry, context }), ...options,
  });
  return { binding, calls, snapshots, terminals, ports };
}

test('disabled hook stays inert, including null session', () => {
  const React = require('react'); const { renderToString } = require('react-dom/server');
  let api;
  const consumers = [];
  function Consumer() { api = useCloudRuns(); consumers.push(api); return null; }
  renderToString(React.createElement(CloudRunsProvider, { ownerId: 'owner', sessionId: null, onTerminal() {}, createLifecycle() { throw Error('must not initialize'); } }, React.createElement(Consumer), React.createElement(Consumer)));
  assert.equal(consumers[0], consumers[1]);
  assert.equal(api.ready, false); assert.deepEqual(api.entries, []);
  assert.throws(() => api.prepare(input('new')), /not enabled/);
});

test('explicit new-session snapshots, concurrent sessions, acceptance before full reply and shared observations', async () => {
  const pending = deferred(); let reads = 0;
  const h = harness({ status: async id => { reads++; await pending.promise; return { id, status: 'completed' }; } });
  await h.binding.start();
  const original = input('new'); const a = h.binding.prepare(original), b = h.binding.prepare(input('other'));
  original.sessionId = 'wrong'; original.userMessage.content = 'changed';
  const accepted = await h.binding.submit(a.id);
  assert.equal(accepted.run.status, 'queued'); assert.equal(accepted.run.sessionRevision, 4);
  const first = h.binding.reconnect(a.id); assert.equal(first, h.binding.reconnect(a.id));
  await h.binding.submit(b.id); await tick(); assert.equal(reads, 2);
  assert.equal(h.calls.find(c => c[0] === 'submit')[1].sessionId, 'new');
  assert.equal(h.calls.find(c => c[0] === 'submit')[1].userMessage.content, 'Hi');
  pending.resolve(); await first; await tick();
  assert.deepEqual(h.terminals.map(t => t.context.sessionId).sort(), ['new', 'other']);
  await h.binding.restore(); await tick(); assert.equal(reads, 2);
  h.binding.dispose();
});

test('uncertain submission reconnects same UUID without resubmitting', async () => {
  let submissions = 0;
  const h = harness({ submit: async () => { submissions++; throw Error('timeout'); } });
  await h.binding.start(); const a = h.binding.prepare(input('new'));
  await assert.rejects(h.binding.submit(a.id), /timeout/);
  await h.binding.reconnect(a.id); assert.equal(submissions, 1);
  assert.equal(h.terminals[0].entry.id, a.id); h.binding.dispose();
});

test('focus/online discovery is bounded and coalesced; cleanup only detaches', async () => {
  const target = new EventTarget(), h = harness(); await h.binding.start(target);
  const page = deferred(); let lists = 0;
  h.ports.list = async query => { lists++; assert.equal(query.limit, 25); await page.promise; return { runs: [], nextCursor: null }; };
  target.dispatchEvent(new Event('focus')); target.dispatchEvent(new Event('online'));
  await tick(); assert.equal(lists, 1); page.resolve(); await tick(); assert.equal(lists, 2);
  h.binding.dispose(); target.dispatchEvent(new Event('focus')); await tick(); assert.equal(lists, 2);
  assert.equal(h.calls.some(c => c[0] === 'cancel'), false);
});

test('exact approval only, stale approval rejected, awaiting input stays distinct', async () => {
  const pendingApproval = { callId: 'call', argumentsHash: 'hash', name: 'send', arguments: '{}' };
  const h = harness({ list: async () => ({ runs: [{ id: 'restored', sessionId: 'new', kind: 'chat', mode: 'ask', status: 'awaiting_input', checkpoint: { pendingApproval } }], nextCursor: null }),
    status: async id => ({ id, status: 'awaiting_input', checkpoint: { pendingApproval } }) });
  await h.binding.start(); await tick();
  await assert.rejects(h.binding.respond('restored', 'yes'), /exact approval/);
  await assert.rejects(h.binding.respond('restored', { decision: 'approve', callId: 'stale', argumentsHash: 'hash' }), /does not match/);
  const decision = { decision: 'deny', callId: 'call', argumentsHash: 'hash' };
  await h.binding.respond('restored', decision);
  assert.deepEqual(h.calls.find(c => c[0] === 'respond')[2], decision); h.binding.dispose();
});

test('dispose suppresses late completion and queued mutation; owner change hides cached emissions', async () => {
  const pending = deferred(); let current = true;
  const h = harness({ status: async id => { await pending.promise; return { id, status: 'completed' }; } }, { isCurrent: () => current });
  await h.binding.start(); const a = h.binding.prepare(input('new')); await h.binding.submit(a.id); await tick();
  const count = h.snapshots.length; current = false; h.binding.dispose(); pending.resolve(); await tick();
  assert.equal(h.snapshots.length, count); assert.equal(h.terminals.length, 0);
  const other = harness(); await other.binding.start(); const b = other.binding.prepare(input('new'));
  const submission = other.binding.submit(b.id); other.binding.dispose(); await submission;
  assert.equal(other.calls.some(c => c[0] === 'submit'), false);
});

test('terminal reconciliation failure surfaces and retries only on explicit restore', async () => {
  let attempts = 0;
  const h = harness({}, { onTerminal() { if (++attempts === 1) throw Error('reconcile failed'); } });
  await h.binding.start(); const a = h.binding.prepare(input('new')); await h.binding.submit(a.id); await tick();
  assert.equal(attempts, 1); assert.equal(h.snapshots.at(-1).error, 'reconcile failed');
  await h.binding.restore(); await tick(); assert.equal(attempts, 2); h.binding.dispose();
});
