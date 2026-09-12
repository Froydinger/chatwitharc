import { deepStrictEqual, rejects, equal } from 'node:assert/strict';
import { cloudRunDispatch } from './cloudRunDispatch.ts';

Deno.test('dispatcher selects exactly one adapter before claim', async () => {
  for (const kind of ['chat', 'app']) {
    const calls: string[] = [];
    const dispatch = cloudRunDispatch({
      kind: async id => { calls.push(`read:${id}`); return kind; },
      chat: async id => { calls.push(`chat:${id}`); return true; },
      app: async id => { calls.push(`app:${id}`); return true; }, appEnabled: true,
    });
    equal(await dispatch('run'), true);
    deepStrictEqual(calls, ['read:run', `${kind}:run`]);
  }
});

Deno.test('disabled app and missing runs never fall back to chat or claim', async () => {
  for (const kind of ['app', null]) {
    const unexpected = () => { throw new Error('Adapter must not run'); };
    equal(await cloudRunDispatch({ kind: async () => kind, chat: unexpected,
      app: unexpected, appEnabled: false })('run'), false);
  }
});

Deno.test('invalid kind or failed lookup never starts a provider', async () => {
  const unexpected = () => { throw new Error('Adapter must not run'); };
  await rejects(cloudRunDispatch({ kind: async () => 'invented', chat: unexpected,
    app: unexpected, appEnabled: true })('run'), /Unsupported persisted/);
  await rejects(cloudRunDispatch({ kind: async () => { throw new Error('lookup failed'); },
    chat: unexpected, app: unexpected, appEnabled: true })('run'), /lookup failed/);
});
