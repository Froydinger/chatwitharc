import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./cloudAppRuns.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const { CloudAppRuns } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('restoring a remembered queued app run reconnects status observation', async () => {
  const runId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const entry = {
    id: runId, sessionId, kind: 'app', mode: 'ask', connection: 'detached',
    run: { id: runId, sessionId, kind: 'app', mode: 'ask', projectId: 'project-a', status: 'queued' },
  };
  const calls = [];
  const lifecycle = {
    restoreRun: async id => { calls.push(['restoreRun', id]); return entry; },
    get: id => id === runId ? entry : undefined,
    reconnect: async id => { calls.push(['reconnect', id]); return entry.run; },
    restore: async () => { calls.push(['list']); return { runs: [], nextCursor: null }; },
    detachAll: () => {},
  };
  const runs = new CloudAppRuns('owner-a', 'project-a', true, {
    ownerId: async () => 'owner-a',
    lifecycle: async () => lifecycle,
    rememberedRun: () => ({ runId, sessionId }),
    prepareProject: async () => {}, prepareSession: async () => ({ id: sessionId, revision: 0 }),
    reconcile: async () => {}, remember: () => {},
  }, () => {});

  const page = await runs.restore();
  await Promise.resolve();
  assert.equal(runs.snapshot().entry.run.status, 'queued');
  assert.equal(page.runs[0].id, runId);
  assert.deepEqual(calls, [['restoreRun', runId], ['reconnect', runId]]);
  runs.close();
});
