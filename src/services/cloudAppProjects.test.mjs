import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('./cloudAppProjects.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { CloudAppProjectPersistence: Adapter, normalizeAppProjectSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const owner = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const snap = (text = 'hello') => ({ files: { 'src/App.tsx': { content: text } }, messages: [{ id: 'm', role: 'user', content: text, timestamp: 100 }] });
function fixture(overrides = {}) {
  let n = 0;
  const calls = [], journals = [];
  const ports = {
    ownerId: async () => owner,
    read: async (id, user) => ({ ...snap('remote'), id, user_id: user, cloud_revision: 3, cloud_managed: true }),
    persist: value => journals.push(structuredClone(value)),
    uuid: () => `33333333-3333-4333-8333-${String(++n).padStart(12, '0')}`,
    save: async args => { calls.push(structuredClone(args)); return { data: { operationId: args.p_operation_id, revision: args.p_expected_revision + 1, replayed: false }, error: null }; },
    ...overrides,
  };
  return { ports, calls, journals, adapter: new Adapter(owner, project, 0, ports) };
}
test('sequential snapshots use acknowledged revision and are immutable', async () => {
  const f = fixture(); const a = snap('a'); f.adapter.capture(a); a.files['src/App.tsx'].content = 'mutated';
  f.adapter.capture(snap('b')); assert.equal(f.calls.length, 0);
  assert.equal((await f.adapter.flush()).status, 'saved');
  assert.deepEqual(f.calls.map(c => [c.p_expected_revision, c.p_files['src/App.tsx'].content]), [[0, 'a'], [1, 'b']]);
  assert.equal(f.journals[0].pending.length, 1);
});
test('transport uncertainty survives refresh with identical UUID and payload', async () => {
  const f = fixture({ save: async () => { throw Error('lost response'); } }); f.adapter.capture(snap());
  assert.equal((await f.adapter.flush()).status, 'uncertain');
  const journal = f.adapter.snapshot(); let retry;
  const restored = new Adapter(owner, project, 9, { ...f.ports, save: async args => { retry = args; return { data: { operationId: args.p_operation_id, revision: 1, replayed: true }, error: null }; } }, journal);
  assert.equal((await restored.flush()).status, 'saved');
  assert.equal(retry.p_operation_id, journal.pending[0].operationId); assert.equal(retry.p_expected_revision, 0);
});
test('conflict retains edits and cannot silently rebase', async () => {
  let calls = 0; const f = fixture({ save: async () => { calls++; return { data: null, error: { code: '40001' } }; } });
  f.adapter.capture(snap()); assert.equal((await f.adapter.flush()).status, 'conflict');
  assert.equal((await f.adapter.flush()).status, 'conflict'); assert.equal(calls, 1);
  assert.equal((await f.adapter.reload()).status, 'pending');
});
test('pending outbox prevents remote overwrite', async () => {
  const f = fixture({ read: async () => { throw Error('must not read'); } }); f.adapter.capture(snap('local'));
  assert.equal((await f.adapter.reload()).snapshot.files['src/App.tsx'].content, 'local');
});
test('abort during read prevents application and journal advancement', async () => {
  const abort = new AbortController(); const f = fixture({ read: async () => { abort.abort(); return {}; } });
  await assert.rejects(f.adapter.reload(abort.signal)); assert.equal(f.journals.length, 0);
});
test('owner switch and wrong project row fail closed', async () => {
  const f = fixture({ ownerId: async () => 'another' }); f.adapter.capture(snap());
  await assert.rejects(f.adapter.flush(), /owner changed/); assert.equal(f.calls.length, 0);
  const g = fixture({ read: async () => ({ ...snap(), id: owner, user_id: owner, cloud_revision: 4 }) });
  await assert.rejects(g.adapter.reload(), /owner mismatch/);
});
test('edits captured while reading win over returned server snapshot', async () => {
  const f = fixture({ read: async () => { f.adapter.capture(snap('new')); return {}; } });
  assert.equal((await f.adapter.reload()).snapshot.files['src/App.tsx'].content, 'new');
});
test('old revisions do not apply; ISO history normalizes to numeric timestamp', async () => {
  const f = fixture(); assert.equal((await f.adapter.reload(undefined, 4)).status, 'stale');
  const value = snap(); value.messages[0].timestamp = '2026-01-01T00:00:00.000Z';
  assert.equal(normalizeAppProjectSnapshot(value).messages[0].timestamp, Date.parse(value.messages[0].timestamp));
});
test('storage failure prevents network and leaves recoverable in-memory intent', async () => {
  const f = fixture({ persist: () => { throw Error('storage full'); } });
  assert.throws(() => f.adapter.capture(snap()), /storage full/);
  await assert.rejects(f.adapter.flush(), /storage full/); assert.equal(f.calls.length, 0); assert.equal(f.adapter.snapshot().pending.length, 1);
});
test('invalid receipt is uncertainty, never success', async () => {
  const f = fixture({ save: async () => ({ data: {}, error: null }) }); f.adapter.capture(snap());
  assert.equal((await f.adapter.flush()).status, 'uncertain'); assert.equal(f.adapter.snapshot().pending.length, 1);
});
