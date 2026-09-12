import { equal, deepStrictEqual, rejects } from 'node:assert/strict';
import { cloudMemorySynthesis } from './cloudMemoryProvider.ts';
import type { MemorySynthesis } from './cloudMemoryTool.ts';
const request: MemorySynthesis = { system: 'memory instructions', input: 'user fact', model: 'gpt-5.6-luna', reasoningEffort: 'low', maxOutputTokens: 4000 };
Deno.test('memory provider preserves Luna contract and confines credentials to headers', async () => {
  const synthesize = cloudMemorySynthesis('test-secret', (async (url, init) => {
    equal(url, 'https://api.openai.com/v1/chat/completions');
    equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
    deepStrictEqual(JSON.parse(String(init?.body)), { model: request.model, reasoning_effort: 'low', max_completion_tokens: 4000,
      messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.input }] });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Updated memory' } }] });
  }) as typeof fetch);
  equal(await synthesize(request), 'Updated memory');
});
Deno.test('memory provider makes one attempt and never exposes provider errors', async () => {
  let calls = 0;
  const synthesize = cloudMemorySynthesis('test-secret', (async () => {
    calls++; return new Response('private provider payload test-secret', { status: 503 });
  }) as typeof fetch);
  await rejects(synthesize(request), /^Error: Memory synthesis request failed$/); equal(calls, 1);
});
Deno.test('partial, refused and malformed memory rewrites cannot commit', async () => {
  for (const choice of [{ finish_reason: 'length', message: { content: 'partial' } },
    { finish_reason: 'stop', message: { refusal: 'no', content: 'not memory' } },
    { finish_reason: 'stop', message: {} }]) {
    const synthesize = cloudMemorySynthesis('test-secret', (async () => Response.json({ choices: [choice] })) as typeof fetch);
    await rejects(synthesize(request), /did not complete/);
  }
});
