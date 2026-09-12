import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

// Load the actual coordinator with type-only imports erased; no browser/auth setup.
const source = await readFile(new URL('./cloudRunLifecycle.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { CloudRunLifecycle } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const run = (id, status, extra = {}) => ({ id, status, ...extra });
const input = sessionId => ({ sessionId, kind: 'chat', mode: 'ask', expectedRevision: 4,
  userMessage: { id: `user-${sessionId}`, role: 'user', type: 'text', content: 'Hello', timestamp: '2026-09-12T00:00:00.000Z' },
  request: { messages: [{ role: 'user', content: 'Hello' }] } });
function harness(overrides = {}, options = {}) {
  let n = 0;
  const calls = [];
  const ports = {
    ownerId: async () => 'owner', uuid: () => `id-${++n}`,
    submit: async s => { calls.push(['submit', s]); return run(s.id, 'queued'); },
    status: async id => { calls.push(['status', id]); return run(id, 'completed'); },
    list: async q => { calls.push(['list', q]); return { runs: [], nextCursor: null }; },
    cancel: async id => { calls.push(['cancel', id]); return run(id, 'cancelled'); },
    respond: async (id, response) => { calls.push(['respond', id, response]); return run(id, 'queued'); },
    ...overrides,
  };
  return { lifecycle: new CloudRunLifecycle('owner', ports, { intervalMs: 1, maxPolls: 2, ...options }), calls, ports };
}

test('concurrent sessions retain captured input and stable UUIDs, no message writes', async () => {
  const { lifecycle: c, calls } = harness();
  const first = input('session-a');
  const a = c.prepare(first), b = c.prepare(input('session-b'));
  first.sessionId = 'changed'; first.request.messages[0].content = 'changed';
  await Promise.all([c.submit(a.id), c.submit(b.id)]);
  await Promise.all([c.reconnect(a.id), c.reconnect(b.id)]);
  assert.equal(c.get(a.id).sessionId, 'session-a');
  assert.equal(c.get(b.id).sessionId, 'session-b');
  assert.equal(c.get(a.id).run.status, 'completed');
  assert.equal(calls.find(x => x[0] === 'submit')[1].request.messages[0].content, 'Hello');
  assert.equal(calls.find(x => x[0] === 'submit')[1].userMessage.id, 'user-session-a');
  assert.equal(calls.find(x => x[0] === 'submit')[1].expectedRevision, 4);
  assert.throws(() => c.submit(a.id), /already attempted/);
  assert.equal(calls.filter(x => x[0] === 'submit').length, 2);
});

test('lifecycle requires atomic user message identity and revision before preparing', () => {
  const { lifecycle: c } = harness();
  assert.throws(() => c.prepare({ ...input('session'), userMessage: undefined }), /Atomic submission/);
  assert.throws(() => c.prepare({ ...input('session'), expectedRevision: undefined }), /Atomic submission/);
});

test('uncertain submit reconnects by same id without resubmission', async () => {
  let submissions = 0;
  const { lifecycle: c, calls } = harness({ submit: async () => { submissions++; throw new Error('timeout'); } });
  const a = c.prepare(input('session'));
  await assert.rejects(c.submit(a.id), /timeout/);
  assert.equal(c.get(a.id).connection, 'uncertain');
  await c.reconnect(a.id);
  assert.equal(c.get(a.id).run.status, 'completed');
  assert.equal(submissions, 1);
  assert.deepEqual(calls, [['status', a.id]]);
});

test('detach ignores late response; explicit reconnect observes completion, cancel is separate', async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const { lifecycle: c, calls, ports } = harness({ status: id => { started(); return new Promise(resolve => { release = () => resolve(run(id, 'running')); }); } });
  const a = c.prepare(input('session'));
  await c.submit(a.id);
  const observation = c.reconnect(a.id);
  await ready; c.detach(a.id); release(); await observation;
  assert.equal(c.get(a.id).connection, 'detached');
  assert.equal(c.get(a.id).run.status, 'queued');
  assert.equal(calls.some(x => x[0] === 'cancel'), false);
  ports.status = async id => run(id, 'completed');
  await c.reconnect(a.id);
  assert.equal(c.get(a.id).run.status, 'completed');
  await c.cancel(a.id);
  assert.equal(calls.filter(x => x[0] === 'cancel').length, 1);
});

test('restore is one owner/session discovery page; reconnect exposes exact approval and awaits', async () => {
  const pending = { callId: 'call', argumentsHash: 'hash', name: 'notify', arguments: '{}' };
  const checkpoint = { progress: { phase: 'tools', turns: 2, tokens: 4 }, pendingApproval: pending };
  const { lifecycle: c, calls } = harness({
    list: async q => { calls.push(['list', q]); return { runs: [{ ...run('restored', 'running'), sessionId: 'session', kind: 'chat', mode: 'ask' }], nextCursor: 'cursor' }; },
    status: async id => run(id, 'awaiting_input', { checkpoint }),
  });
  const page = await c.restore({ sessionId: 'session', limit: 5 });
  assert.equal(page.nextCursor, 'cursor'); assert.equal(calls.length, 1);
  c.detach('restored'); await c.reconnect('restored');
  assert.equal(c.get('restored').run.status, 'awaiting_input');
  assert.throws(() => c.respond('restored', 'yes'), /exact approval/);
  assert.throws(() => c.approve('restored', { decision: 'approve', callId: 'old', argumentsHash: 'hash' }), /does not match/);
  await c.approve('restored', { decision: 'deny', callId: 'call', argumentsHash: 'hash' });
  assert.deepEqual(calls[1], ['respond', 'restored', { decision: 'deny', callId: 'call', argumentsHash: 'hash' }]);
});

test('poll error stops immediately; reconnect is explicit, bounded polling has no idle loop', async () => {
  let reads = 0;
  const { lifecycle: c, ports } = harness({ status: async () => { reads++; throw new Error('network'); } });
  const a = c.prepare(input('session')); await c.submit(a.id);
  await assert.rejects(c.reconnect(a.id), /network/);
  assert.equal(reads, 1); assert.equal(c.get(a.id).connection, 'detached');
  ports.status = async id => { reads++; return run(id, 'running'); };
  await c.reconnect(a.id);
  assert.equal(reads, 3); assert.equal(c.get(a.id).connection, 'detached');
});

test('owner change discards coordinator state and never accesses runs as another owner', async () => {
  const emitted = [];
  const { lifecycle: c, ports, calls } = harness({}, { onChange: entry => emitted.push(entry) });
  const a = c.prepare(input('session')); await c.submit(a.id);
  emitted.length = 0;
  ports.ownerId = async () => 'other';
  await c.reconnect(a.id);
  assert.equal(emitted.length, 0, 'No cached owner data may be emitted before authentication');
  assert.equal(c.get(a.id), undefined);
  assert.equal(calls.some(x => x[0] === 'status'), false);
});

test('default active observation continues beyond 20 polls and stops immediately on completion', async () => {
  let reads = 0;
  const delays = [];
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => { delays.push(ms); return realTimeout(fn, 0, ...args); };
  try {
    const { lifecycle: c } = harness({ status: async id => run(id, ++reads < 25 ? 'running' : 'completed') },
      { intervalMs: undefined, maxPolls: undefined });
    const a = c.prepare(input('session'));
    await c.submit(a.id); await c.reconnect(a.id);
    assert.equal(reads, 25);
    assert.equal(c.get(a.id).run.status, 'completed');
    assert.equal(c.get(a.id).connection, 'idle');
    assert.deepEqual(delays, Array(24).fill(1500));
    await new Promise(resolve => realTimeout(resolve, 10));
    assert.equal(reads, 25, 'No idle polling after completion');
  } finally { globalThis.setTimeout = realTimeout; }
});

test('default poll count remains bounded at 1000; exhaustion never resubmits', async () => {
  let reads = 0;
  const { lifecycle: c, calls } = harness({ status: async id => { reads++; return run(id, 'running'); } },
    { maxPolls: undefined });
  const a = c.prepare(input('session')); await c.submit(a.id); await c.reconnect(a.id);
  assert.equal(reads, 1000); assert.equal(c.get(a.id).connection, 'detached');
  assert.equal(calls.filter(x => x[0] === 'submit').length, 1);
});

test('auth lookup failure and pending-auth detach never emit cached state', async () => {
  const emitted = [];
  const { lifecycle: c, ports, calls } = harness({}, { onChange: entry => emitted.push(entry) });
  const a = c.prepare(input('session')); await c.submit(a.id); emitted.length = 0;
  ports.ownerId = async () => { throw new Error('auth unavailable'); };
  await assert.rejects(c.reconnect(a.id), /auth unavailable/);
  assert.equal(emitted.length, 0);
  let release;
  ports.ownerId = () => new Promise(resolve => { release = resolve; });
  const observation = c.reconnect(a.id);
  c.detach(a.id);
  assert.equal(emitted.length, 0);
  release('owner');
  assert.equal(await observation, undefined);
  assert.equal(emitted.length, 0);
  assert.equal(calls.some(x => x[0] === 'status'), false);
});

test('detach immediately before auth resolves prevents the browser request', async () => {
  const { lifecycle: c, calls } = harness();
  const a = c.prepare(input('session'));
  const submission = c.submit(a.id); c.detach(a.id); await submission;
  assert.equal(calls.length, 0);
});

test('includeTerminal discovery restores missed completion without polling', async () => {
  const { lifecycle: c, calls } = harness({ list: async q => {
    calls.push(['list', q]);
    return { runs: [{ ...run('done', 'completed', { result: { content: 'saved' } }), sessionId: 'session', kind: 'app', mode: 'auto' }], nextCursor: null };
  } });
  await c.restore({ includeTerminal: true });
  assert.equal(c.get('done').run.result.content, 'saved');
  assert.equal(calls.length, 1);
});

test('detaching one concurrent session leaves the other observation intact', async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const { lifecycle: c, calls } = harness({ status: async id => {
    if (id === 'id-1') { started(); return new Promise(resolve => { release = () => resolve(run(id, 'completed')); }); }
    return run(id, 'completed');
  } });
  const a = c.prepare(input('a')), b = c.prepare(input('b'));
  await Promise.all([c.submit(a.id), c.submit(b.id)]);
  const observingA = c.reconnect(a.id);
  await ready;
  const observingB = c.reconnect(b.id);
  c.detach(a.id); release();
  await Promise.all([observingA, observingB]);
  assert.equal(c.get(a.id).connection, 'detached');
  assert.equal(c.get(b.id).run.status, 'completed');
  assert.equal(calls.some(call => call[0] === 'cancel'), false);
});

test('unknown submission plus lookup failure remains uncertain and never resubmits', async () => {
  let submitted = 0, lookedUp = 0;
  const { lifecycle: c } = harness({
    submit: async () => { submitted++; throw new Error('connection lost'); },
    status: async () => { lookedUp++; throw new Error('not found'); },
  });
  const a = c.prepare(input('session'));
  await assert.rejects(c.submit(a.id));
  await assert.rejects(c.reconnect(a.id), /not found/);
  assert.equal(c.get(a.id).id, a.id);
  assert.equal(c.get(a.id).connection, 'uncertain');
  assert.equal(submitted, 1); assert.equal(lookedUp, 1);
});

test('transport list uses authenticated POST and validates discovered sessions', async () => {
  const text = (await readFile(new URL('./cloudRuns.ts', import.meta.url), 'utf8'))
    .replace(/^import .*supabase\/client';/m, 'const { isSupabaseConfigured, supabase } = deps;')
    .replaceAll('import.meta.env.', 'deps.env.');
  const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {};
  const requests = [];
  const deps = { isSupabaseConfigured: true, env: { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'public' },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } } };
  let session = 'session';
  const fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.method, 'POST');
    requests.push(JSON.parse(options.body));
    return Response.json({ runs: [{ id: 'run', sessionId: session, kind: 'chat', mode: 'auto', status: 'running' }], nextCursor: null });
  };
  new Function('exports', 'deps', 'fetch', compiled)(api, deps, fetch);
  const page = await api.listCloudRuns({ sessionId: 'session', limit: 5 });
  assert.equal(page.runs.length, 1);
  assert.deepEqual(requests[0], { sessionId: 'session', limit: 5, action: 'list' });
  session = 'other-session';
  await assert.rejects(api.listCloudRuns({ sessionId: 'session' }), error => error.code === 'protocol');
});
