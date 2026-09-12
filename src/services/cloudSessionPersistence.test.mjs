import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const url = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const changes = url(await readFile(new URL('./cloudSessionChanges.ts', import.meta.url), 'utf8'));
const source = await readFile(new URL('./cloudSessionPersistence.ts', import.meta.url), 'utf8');
const { createCloudSessionPersistence } = await import(url(source.replace("'./cloudSessionChanges'", JSON.stringify(changes))));
const ownerId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const message = (id, content = id) => ({ id, content, role: 'user' });
const snap = (...messages) => ({ messages });
function fixture(overrides = {}) {
  let n = 0;
  const calls = [], journals = [];
  const options = {
    ownerId, sessionId, currentOwnerId: async () => ownerId,
    randomUUID: () => `33333333-3333-4333-8333-${String(++n).padStart(12, '0')}`,
    persistOutbox: async outbox => { journals.push(structuredClone(outbox)); },
    client: { rpc: async (name, args) => {
      calls.push({ name, ...structuredClone(args) });
      return { data: { operation_id: args.p_operation_id, session_revision: calls.length, replayed: false }, error: null };
    } }, ...overrides,
  };
  return { adapter: createCloudSessionPersistence(options), calls, journals, options };
}

test('sequential semantic operations, journal before RPC, no array overwrite', async () => {
  const f = fixture();
  const a = message('a');
  f.adapter.enqueue(snap(a), { messages: [message('a', 'edited'), message('b')], canvasContent: 'canvas' });
  f.adapter.enqueue(snap(message('a', 'edited'), message('b')), snap(message('b')));
  assert.equal(f.calls.length, 0);
  const result = await f.adapter.flush();
  assert.equal(result.status, 'complete');
  assert.equal(result.applied, 4);
  assert.deepEqual(f.calls.map(c => c.p_operation.kind), ['replace', 'append', 'canvas', 'remove']);
  assert.deepEqual(f.calls[0].p_operation.expected, a);
  assert.equal(f.journals[0].pending.length, 4);
  assert.equal(f.journals.at(-1).pending.length, 0);
  assert.ok(f.calls.every(c => c.name === 'apply_chat_session_operation' && c.p_session_id === sessionId));
});

test('lost response retains exact UUID/payload across reload and receipt replay', async () => {
  let saved, first;
  const f = fixture({
    persistOutbox: async s => { saved = structuredClone(s); },
    client: { rpc: async (_, args) => { first = structuredClone(args); throw Error('response lost after commit'); } },
  });
  f.adapter.enqueue(snap(), snap(message('a')));
  assert.equal((await f.adapter.flush()).status, 'uncertain');
  const recovered = fixture({ restored: saved, client: { rpc: async (_, args) => {
    assert.deepEqual(args, first);
    return { data: { operation_id: args.p_operation_id, session_revision: 10, replayed: true }, error: null };
  } } });
  assert.equal((await recovered.adapter.flush()).status, 'complete');
});

test('conflict stops partial batch and later enqueues, never retries or rebases', async () => {
  let count = 0;
  const f = fixture({ client: { rpc: async (_, args) => ++count === 1
    ? { data: { operation_id: args.p_operation_id, session_revision: 1, replayed: false }, error: null }
    : { data: null, error: { code: '40001' } } } });
  f.adapter.enqueue(snap(), snap(message('a'), message('b'), message('c')));
  const result = await f.adapter.flush();
  assert.equal(result.status, 'conflict');
  assert.equal(result.applied, 1);
  f.adapter.enqueue(snap(), snap(message('d')));
  assert.equal((await f.adapter.flush()).status, 'conflict');
  assert.equal(count, 2);
  assert.equal(f.adapter.snapshot().pending.length, 3);
});

test('concurrent flushes share one flight and preserve appended intents', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ currentOwnerId: async () => { await gate; return ownerId; } });
  f.adapter.enqueue(snap(), snap(message('a')));
  const first = f.adapter.flush();
  assert.equal(f.adapter.flush(), first);
  f.adapter.enqueue(snap(message('a')), snap(message('a'), message('b')));
  release();
  assert.equal((await first).applied, 2);
  assert.equal(f.calls.length, 2);
});

test('wrong owner never sends or journals; mismatched restored owner rejects', async () => {
  const f = fixture({ currentOwnerId: async () => sessionId });
  f.adapter.enqueue(snap(), snap(message('a')));
  assert.equal((await f.adapter.flush()).status, 'owner-mismatch');
  assert.equal(f.calls.length, 0);
  assert.equal(f.journals.length, 0);
  assert.throws(() => fixture({ restored: { ownerId: sessionId, sessionId, pending: [] } }), /mismatch/);
});

test('journal failure prevents fetch and preserves operation IDs for retry', async () => {
  let fail = true;
  const f = fixture({ persistOutbox: async () => { if (fail) throw Error('disk full'); } });
  const ids = f.adapter.enqueue(snap(), snap(message('a')));
  await assert.rejects(f.adapter.flush(), /disk full/);
  assert.equal(f.calls.length, 0);
  fail = false;
  await f.adapter.flush();
  assert.equal(f.calls[0].p_operation_id, ids[0]);
});

for (const code of ['23505', '42501', '22023', '']) {
  test(`RPC error ${code || 'transport'} is explicit, never false success`, async () => {
    const f = fixture({ client: { rpc: async () => ({ data: null, error: { code } }) } });
    f.adapter.enqueue(snap(), snap(message('a')));
    assert.equal((await f.adapter.flush()).status, code === '23505' ? 'conflict' : code ? 'rejected' : 'uncertain');
    assert.equal(f.adapter.snapshot().pending.length, 1);
  });
}

test('malformed acknowledgement stays uncertain and detached snapshots cannot alter retry', async () => {
  const f = fixture({ client: { rpc: async () => ({ data: {}, error: null }) } });
  const local = snap(message('a'));
  f.adapter.enqueue(snap(), local);
  local.messages[0].content = 'mutated';
  f.adapter.snapshot().pending[0].operation.message.content = 'also mutated';
  assert.equal((await f.adapter.flush()).status, 'uncertain');
  assert.equal(f.adapter.snapshot().pending[0].operation.message.content, 'a');
});

test('invalid local intent and duplicate UUIDs enqueue nothing', () => {
  const f = fixture({ randomUUID: () => ownerId });
  assert.throws(() => f.adapter.enqueue(snap(), snap(message('a'), message('b'))), /duplicate/);
  assert.equal(f.adapter.snapshot().pending.length, 0);
  assert.throws(() => f.adapter.enqueue(snap(message('a')), snap(message('b'), message('a'))), /Insertion/);
});
