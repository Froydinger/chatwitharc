import { cloudResponseProvider, parseCloudResponse, responseInput } from './cloudRunProvider.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }

Deno.test('provider retains reasoning and function calls across tool rounds', () => {
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'I will check the weather.' }] };
  const result = parseCloudResponse({ status: 'completed', usage: { total_tokens: 42 }, output: [
    reasoning, { type: 'function_call', call_id: 'call_1', name: 'web_search', arguments: '{"query":"weather"}' },
  ] });
  assert(result?.tokens === 42);
  assert(result?.reasoningSummary === 'I will check the weather.');
  assert(result.calls[0].id === 'call_1');
  assert(result.outputItems?.[0] === reasoning);
  const input = responseInput([...result.outputItems!, { role: 'tool', tool_call_id: 'call_1', content: 'untrusted result' }]);
  assert(JSON.stringify(input[2]) === JSON.stringify({ type: 'function_call_output', call_id: 'call_1', output: 'untrusted result' }));
});

Deno.test('pending responses are not completion; failed and truncated responses fail', () => {
  assert(parseCloudResponse({ status: 'queued' }) === null);
  assert(parseCloudResponse({ status: 'in_progress' }) === null);
  for (const status of ['failed', 'cancelled', 'incomplete']) {
    let threw = false;
    try { parseCloudResponse({ status }); } catch { threw = true; }
    assert(threw, status);
  }
});

Deno.test('background adapter preserves Luna, bounds output, never retries a failed POST', async () => {
  let calls = 0;
  const provider = cloudResponseProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'medium', tools: [],
    fetcher: ((_url: unknown, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      assert(body.model === 'gpt-5.6-luna');
      assert(body.background === true && body.store === true);
      assert(body.max_output_tokens === 123);
      assert(body.reasoning?.summary === 'auto');
      assert(!('temperature' in body));
      return Promise.resolve(new Response('{}', { status: 503 }));
    }) as typeof fetch,
  });
  let failed = false;
  try { await provider.startModel([{ role: 'user', content: 'hey' }], 'stable-id', 123); } catch { failed = true; }
  assert(failed && calls === 1);
});

Deno.test('explicit search is forced only for the first durable model turn', async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = cloudResponseProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', firstTool: 'web_search',
    tools: [{ type: 'function', name: 'web_search', description: 'Search', strict: true, parameters: {} }],
    fetcher: (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'resp_test' });
    }) as typeof fetch,
  });
  await provider.startModel([], 'run:model:0', 100);
  await provider.startModel([], 'run:model:1', 100);
  assert(JSON.stringify(bodies[0].tool_choice) === JSON.stringify({ type: 'function', name: 'web_search' }));
  assert(!('tool_choice' in bodies[1]), 'Following rounds must be free to finish or use other tools');
});

Deno.test('unregistered initial tool fails before a provider request', () => {
  let threw = false;
  try { cloudResponseProvider({ apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', firstTool: 'invented', tools: [] }); }
  catch { threw = true; }
  assert(threw);
});
