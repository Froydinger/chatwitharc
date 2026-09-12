import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const panel = await readFile(new URL('../components/ide/IDECanvasPanel.tsx', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('./cloudAppProjectClient.ts', import.meta.url), 'utf8');
test('panel contract: owner-scoped reads, abort cleanup, surfaced errors, no protected array update', () => {
  assert.match(panel, /eq\('user_id', user.id\)/);
  assert.match(panel, /return \(\) => scope.abort\(\)/);
  assert.match(panel, /role="alert"/);
  const protectedBranch = panel.slice(panel.indexOf('if (isProtected)'), panel.indexOf('const { data, error } = savedResult'));
  assert.match(protectedBranch, /client.flush\(\)/);
  assert.doesNotMatch(protectedBranch.split('} else {')[0], /files:|messages:|upsert/);
  assert.match(panel, /detail\?\.projectId !== projectIdRef.current/);
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
