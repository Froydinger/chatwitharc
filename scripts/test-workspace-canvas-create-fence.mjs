import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/workspace/workspaceCanvasCreation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { WorkspaceCanvasCreationCoordinator } = exports;

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const context = {
    routeKey: 'dashboard-1', pathname: '/dashboard', search: '?tab=canvases',
    ownerId: 'owner-a', currentSessionId: 'prior-chat', authOwnerId: 'owner-a',
  };
  const events = { opens: [], paths: [], persists: [], creates: 0 };
  const pendingSave = deferred();
  const coordinator = new WorkspaceCanvasCreationCoordinator();
  const dependencies = {
    readContext: () => ({
      routeKey: context.routeKey, pathname: context.pathname, search: context.search,
      ownerId: context.ownerId, currentSessionId: context.currentSessionId,
    }),
    getAuthenticatedOwnerId: async () => context.authOwnerId,
    createSession: () => {
      events.creates += 1;
      context.currentSessionId = 'canvas-session';
      return 'canvas-session';
    },
    persistCanvas: (sessionId, ownerId) => {
      events.persists.push({ sessionId, ownerId });
      return pendingSave.promise;
    },
    openCanvas: sessionId => events.opens.push(sessionId),
    navigate: path => events.paths.push(path),
  };
  return { context, events, pendingSave, coordinator, dependencies };
}

for (const [name, mutate] of [
  ['navigation away', f => { f.context.routeKey = 'settings-2'; f.context.pathname = '/settings'; }],
  ['account switch', f => { f.context.ownerId = 'owner-b'; f.context.authOwnerId = 'owner-b'; }],
]) {
  test(name, async () => {
    const f = fixture();
    const request = f.coordinator.create(f.dependencies);
    await tick();
    assert.equal(f.events.persists.length, 1, 'document save began');
    mutate(f);
    f.pendingSave.resolve('canvas-artifact');
    const result = await request;
    assert.equal(result.status, 'stale');
    assert.equal(result.sessionId, 'canvas-session');
    assert.deepEqual(f.events.opens, [], 'stale completion does not apply an open intent');
    assert.deepEqual(f.events.paths, [], 'stale completion does not steal the route');
    assert.deepEqual(f.events.persists, [{ sessionId: 'canvas-session', ownerId: 'owner-a' }], 'the completed save stays bound to the initiating owner');
  });
}

test('a repeated create while the first save is pending is ignored', async () => {
  const f = fixture();
  const first = f.coordinator.create(f.dependencies);
  await tick();
  const second = await f.coordinator.create(f.dependencies);
  assert.equal(second.status, 'busy');
  assert.equal(f.events.creates, 1);
  assert.equal(f.events.persists.length, 1);
  f.pendingSave.resolve('canvas-artifact');
  const result = await first;
  assert.equal(result.status, 'opened');
  assert.deepEqual(f.events.opens, ['canvas-session']);
  assert.deepEqual(f.events.paths, ['/chat/canvas-session']);
});

test('unmount invalidation prevents a delayed create from dispatching', async () => {
  const f = fixture();
  const request = f.coordinator.create(f.dependencies);
  await tick();
  f.coordinator.invalidate();
  f.pendingSave.resolve('canvas-artifact');
  assert.equal((await request).status, 'stale');
  assert.deepEqual(f.events.opens, []);
  assert.deepEqual(f.events.paths, []);
});

console.log('Workspace canvas create fencing passed: delayed route/account changes, duplicate clicks and unmount.');
