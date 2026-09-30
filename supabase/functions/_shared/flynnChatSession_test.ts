import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { flynnChatSession } from './flynnChatSession.ts';

const tool = { type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } };
const signed = { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' }, extra_content: { google: { thought_signature: 'fixture' } } }] };
const result = (message: unknown, tokens = 10, finish = 'stop') => Response.json({ choices: [{ message, finish_reason: finish }], usage: { total_tokens: tokens } });
const defaults = { user: { email: 'jakefroydinger@gmail.com' }, apiKey: 'fixture-key', tools: [tool], tokenLimit: 100, deadline: 1000, now: () => 0 };

Deno.test('Flynn Chat retains the complete assistant tool message and shares one token budget across rounds', async () => {
  const bodies: Record<string, unknown>[] = [];
  const session = flynnChatSession({ ...defaults, signal: new AbortController().signal, fetcher: (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(bodies.length === 1 ? result(signed, 30, 'tool_calls') : result({ role: 'assistant', content: 'Answer' }, 20));
  } });
  const first = await session.complete([{ role: 'user', content: 'Question' }], 'required');
  await session.complete([first.message, { role: 'tool', tool_call_id: 'call-1', content: 'Evidence' }]);
  deepStrictEqual((bodies[1].messages as unknown[])[0], signed);
  equal(bodies[0].max_completion_tokens, 100);
  equal(bodies[1].max_completion_tokens, 70);
  equal(session.tokens, 50);
});

Deno.test('Flynn Chat rejects unregistered, unfulfilled required, and over-budget actions before execution', async () => {
  for (const [message, tokens, choice] of [
    [{ ...signed, tool_calls: [{ ...signed.tool_calls[0], function: { name: 'not_registered', arguments: '{}' } }] }, 10, 'auto'],
    [{ role: 'assistant', content: 'No action' }, 10, 'required'],
    [signed, 100, 'auto'],
  ] as const) {
    const session = flynnChatSession({ ...defaults, signal: new AbortController().signal,
      fetcher: () => Promise.resolve(result(message, tokens, 'tool_calls' in message ? 'tool_calls' : 'stop')) });
    await rejects(session.complete([], choice));
  }
});

Deno.test('Flynn Chat bounds tool rounds and stops immediately on cancellation or deadline', async () => {
  let calls = 0;
  let clock = 0;
  const controller = new AbortController();
  const session = flynnChatSession({ ...defaults, tokenLimit: 1000, signal: controller.signal, now: () => clock,
    fetcher: () => { calls++; return Promise.resolve(result(signed, 1, 'tool_calls')); } });
  for (let round = 0; round < 8; round++) await session.complete([]);
  await rejects(session.complete([]), /safe request limit/);
  equal(calls, 8);
  clock = 1000;
  await rejects(session.complete([]), /in time/);
  controller.abort();
  await rejects(session.complete([]));
  equal(calls, 8);
});
