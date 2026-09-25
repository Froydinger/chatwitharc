import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const workspace = await readFile(new URL('../components/app-builder/AppBuilderWorkspace.tsx', import.meta.url), 'utf8');
const projectService = await readFile(new URL('./appBuilderProject.ts', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('./cloudAppProjectClient.ts', import.meta.url), 'utf8');
test('replacement builder keeps owner-scoped project reads and revision-safe persistence', () => {
  assert.match(projectService, /eq\('id', projectId\)\.eq\('user_id', user\.id\)/);
  assert.match(projectService, /eq\('id', projectId\)\.eq\('user_id', ownerId\)/);
  assert.match(projectService, /cloudAppProjectClient\(user\.id, projectId, record\.cloud_revision\)/);
  assert.match(projectService, /cloud_revision\)/);
  assert.match(projectService, /saved\.status !== 'saved'/);
  assert.doesNotMatch(projectService, /\.upsert\(/);
  assert.match(workspace, /projectPersistenceRef\.current/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /createCloudAppRuns\(/);
  assert.doesNotMatch(workspace, /IDECanvasPanel|components\/ide\//);
});
test('completion callback uses returned projectId, ignores noncompleted runs and aborted scope', async () => {
  const calls = [];
  globalThis.__appTest = { calls };
  const source = clientSource.replace(/import .*?;\n/g, '')
    .replace('const clients = new Map', 'const supabase = {}; const clients = new Map')
    .replace('const key = cloudAppJournalKey(ownerId, projectId);', `return {
      flush: async () => { globalThis.__appTest.calls.push(['flush', ownerId, projectId]); return {status:'saved'}; },
      reload: async () => ({status:'stale'}),
    }; const key = ownerId + projectId;`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { reconcileCloudAppRun } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  await reconcileCloudAppRun('owner', { status: 'running', projectId: 'wrong' });
  await reconcileCloudAppRun('owner', { status: 'completed' });
  assert.equal(calls.length, 0);
  await reconcileCloudAppRun('owner', { status: 'completed', projectId: 'background-project' });
  assert.deepEqual(calls, [['flush', 'owner', 'background-project']]);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(reconcileCloudAppRun('owner', {status:'completed',projectId:'other'}, abort.signal));
  assert.equal(calls.length, 1);
  delete globalThis.__appTest;
});
