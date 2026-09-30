import { equal, throws, deepStrictEqual, rejects } from 'node:assert/strict';
import { flynnAllowedForUser, getFlynnEntitlement, requireFlynnAccess, requestFlynnCompletion, flynnModelTurn } from './flynnProvider.ts';

Deno.test('Flynn requires authenticated admitted identity and a configured provider key', () => {
  const user = { id: 'boost-user', email: 'member@example.com' };
  equal(flynnAllowedForUser(null, 'test-only', true), false);
  equal(flynnAllowedForUser(user, 'test-only', false), false);
  equal(flynnAllowedForUser({ ...user, is_anonymous: true }, 'test-only', true), false);
  equal(flynnAllowedForUser(user, undefined, true), false);
  equal(flynnAllowedForUser(user, '  ', true), false);
  equal(flynnAllowedForUser(user, 'test-only', true), true);
  throws(() => requireFlynnAccess(user, 'test-only'), /not been authorized/);
  equal(requireFlynnAccess(user, 'test-only', true), 'test-only');
});

Deno.test('Flynn maps into Arc tools while preserving full execution history and accounting', () => {
  const message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{}' }, extra_content: { google: { thought_signature: 'test-signature' } } }] };
  const turn = flynnModelTurn({ message, finishReason: 'tool_calls', usage: { total_tokens: 123 } });
  deepStrictEqual(turn.calls, [{ id: 'call_1', name: 'weather', arguments: '{}' }]);
  deepStrictEqual(turn.outputItems, [message]);
  equal(turn.tokens, 123);
  throws(() => flynnModelTurn({ message, finishReason: 'tool_calls', usage: undefined }), /usage/);
  throws(() => flynnModelTurn({ message: { ...message, tool_calls: [...message.tool_calls, ...message.tool_calls] }, finishReason: 'tool_calls', usage: { total_tokens: 123 } }), /Duplicate/);
  throws(() => flynnModelTurn({ message, finishReason: 'stop', usage: { total_tokens: 123 } }), /Inconsistent/);
  throws(() => flynnModelTurn({ message: { role: 'assistant', content: null }, finishReason: 'stop', usage: { total_tokens: 1 } }), /no final answer/);
});

Deno.test('Flynn aborts an active provider request on Stop and timeout', async () => {
  for (const timeout of [false, true]) {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let calls = 0;
    const pending = requestFlynnCompletion({
      user: { id: 'boost-user', email: 'member@example.com' }, accessGranted: true, apiKey: 'test-only', messages: [],
      signal: controller.signal, timeoutMs: timeout ? 10 : 60_000,
      fetcher: ((_url, init) => new Promise<Response>((_resolve, reject) => {
        calls++; started();
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      })) as typeof fetch,
    });
    const rejection = rejects(pending, timeout ? /timed out/ : /stopped/);
    await ready;
    if (!timeout) controller.abort(new Error('Response stopped'));
    await rejection;
    equal(calls, 1);
  }
});

Deno.test('compatible Flynn turns preserve signed tool-call metadata across rounds', async () => {
  const message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{}' }, extra_content: { google: { thought_signature: 'test-signature' } } }] };
  const bodies: Record<string, unknown>[] = [];
  const options = { user: { id: 'boost-user', email: 'member@example.com' }, accessGranted: true, apiKey: 'test-only', fetcher: ((url, init) => {
    equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(Response.json({ choices: [{ message, finish_reason: 'tool_calls' }] }));
  }) as typeof fetch };
  const result = await requestFlynnCompletion({ ...options, messages: [{ role: 'user', content: 'Weather?' }] });
  await requestFlynnCompletion({ ...options, messages: [result.message, { role: 'tool', tool_call_id: 'call_1', content: 'Sunny' }] });
  deepStrictEqual((bodies[1].messages as unknown[])[0], message);
  equal(bodies[0].model, 'gemini-3.8-flash');
  equal(bodies[0].reasoning_effort, 'low');
});

Deno.test('Flynn rejects unauthorized, cancelled, failed, and truncated requests without retry', async () => {
  let calls = 0;
  const options = { user: { id: 'boost-user', email: 'member@example.com' }, accessGranted: true, apiKey: 'test-only', messages: [], fetcher: (() => { calls++; return Promise.resolve(new Response('private upstream details', { status: 503 })); }) as typeof fetch };
  await rejects(requestFlynnCompletion({ ...options, user: null }), /not been authorized/);
  equal(calls, 0);
  const controller = new AbortController(); controller.abort();
  await rejects(requestFlynnCompletion({ ...options, signal: controller.signal }));
  equal(calls, 0);
  await rejects(requestFlynnCompletion(options), /^Error: Flynn provider HTTP 503\.$/);
  equal(calls, 1);
  await rejects(requestFlynnCompletion({ ...options, fetcher: (() => Promise.resolve(Response.json({ choices: [{ message: { role: 'assistant', content: 'Partial' }, finish_reason: 'length' }] }))) as typeof fetch }), /did not complete/);
});

Deno.test('Flynn entitlement uses authenticated account RPC and fails closed on missing/error access', async () => {
  const user = { id: 'authenticated-account', email: 'member@example.com' };
  let calls = 0;
  const client = { rpc: (name: string, args: Record<string, unknown>) => {
    calls++; equal(name, 'user_has_boost'); deepStrictEqual(args, { check_user_id: user.id });
    return Promise.resolve({ data: true as unknown, error: null as unknown });
  } };
  equal(await getFlynnEntitlement(client, user), true);
  equal(await getFlynnEntitlement(client, null), false);
  equal(await getFlynnEntitlement(client, { ...user, is_anonymous: true }), false);
  equal(calls, 1);
  for (const data of [false, null, 'true', 1]) equal(await getFlynnEntitlement({ rpc: () => Promise.resolve({ data, error: null }) }, user), false);
  await rejects(getFlynnEntitlement({ rpc: () => Promise.resolve({ data: true, error: Error('fixture') }) }, user), /could not be verified/);
});
