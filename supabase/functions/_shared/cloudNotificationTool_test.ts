import { equal, deepStrictEqual, rejects } from 'node:assert/strict';
import { cloudNotificationTool, cloudNotificationDispatch } from './cloudNotificationTool.ts';
import type { ClaimedCloudRun } from './cloudRunWorker.ts';
const run = { user_id: '11111111-1111-4111-8111-111111111111' } as ClaimedCloudRun;
const args = { title: 'Reminder', body: 'Take a break', url: '/dashboard' };
const call = (value = args) => ({ id: 'send', name: 'send_notification', arguments: JSON.stringify(value) });
const output = (value: string | { output: string }) => JSON.parse(typeof value === 'string' ? value : value.output);
Deno.test('notification owner cannot be supplied by tool args; Ask approval and unsafe replay policy retained', async () => {
  let payload: unknown;
  const tool = cloudNotificationTool({ authorizeOwner: async () => true, dispatch: async p => { payload = p; return { sent: 1, failed: 0, total: 1 }; } });
  equal(tool.approval, 'ask-mode'); equal(tool.replaySafe, false);
  const response = await tool.execute(run, call(), 'stable-key');
  const result = output(response);
  equal(typeof response, 'object');
  equal(result.sent, 1); equal(result.seenByUser, 'not confirmed');
  deepStrictEqual((payload as { user_ids: string[] }).user_ids, [run.user_id]);
});
Deno.test('notification rejects recipient overrides, external links and owner revocation before dispatch', async () => {
  let calls = 0;
  const tool = cloudNotificationTool({ authorizeOwner: async () => true, dispatch: async () => { calls++; return {}; } });
  for (const value of [{ ...args, user_ids: ['other'] }, { ...args, url: '//evil.example' },
    { ...args, url: '/\\evil.example' }, { ...args, url: 'https://evil.example' }]) {
    equal(JSON.parse(await tool.execute(run, call(value), 'key') as string).performed, false);
  }
  const denied = cloudNotificationTool({ authorizeOwner: async () => false, dispatch: async () => { calls++; return {}; } });
  equal(JSON.parse(await denied.execute(run, call(), 'key') as string).performed, false);
  equal(calls, 0);
});
Deno.test('notification failure preserves ambiguity without retry or provider body disclosure', async () => {
  let calls = 0;
  const dispatch = cloudNotificationDispatch('https://example.test', 'test-secret', (async (_url, init) => {
    calls++; equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
    return new Response('private details test-secret', { status: 503 });
  }) as typeof fetch);
  const tool = cloudNotificationTool({ authorizeOwner: async () => true, dispatch });
  await rejects(tool.execute(run, call(), 'key'), /^Error: Notification outcome unknown$/);
  equal(calls, 1);
});
Deno.test('zero subscriptions and partial failures remain explicit, malformed counts are ambiguous', async () => {
  for (const counts of [{ sent: 0, failed: 0, total: 0 }, { sent: 1, failed: 2, total: 3 }]) {
    const tool = cloudNotificationTool({ authorizeOwner: async () => true, dispatch: async () => counts });
    const response = await tool.execute(run, call(), 'key');
    const result = output(response);
    equal(typeof response, counts.sent ? 'object' : 'string');
    equal(result.sent, counts.sent); equal(result.failed, counts.failed);
  }
  const invalid = cloudNotificationTool({ authorizeOwner: async () => true, dispatch: async () => ({ sent: 1, failed: 0, total: 0 }) });
  await rejects(invalid.execute(run, call(), 'key'), /outcome unknown/);
});
