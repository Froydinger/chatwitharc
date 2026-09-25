import { cloudAgentsProvider } from './cloudAgentsProvider.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}

Deno.test('Agents API provider opens a Luna session without an execution sandbox', async () => {
  let requestBody: Record<string, unknown> | undefined;
  let requestHeaders: HeadersInit | undefined;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'Arc instructions', reasoningEffort: 'medium',
    tools: [
      { type: 'function', name: 'read_value', description: 'Read a value', parameters: { type: 'object' }, strict: true },
      { type: 'function', name: 'optional_value', description: 'Read optional input', parameters: { type: 'object' }, strict: false },
    ],
    firstTool: 'read_value',
    fetcher: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      requestHeaders = init?.headers;
      return Response.json({ id: 'sess_test' });
    }) as typeof fetch,
  });
  const id = await provider.startAgentSession!([
    { role: 'system', content: 'Trusted system context' },
    { role: 'user', content: 'Read the value.' },
  ], 'run:model:0', 4000);
  assert(id === 'sess_test');
  const agent = requestBody?.agent as Record<string, unknown>;
  assert(agent.model === 'gpt-6-luna');
  const tools = agent.tools as Array<Record<string, unknown>>;
  assert(tools[0].strict === true);
  assert(!Object.hasOwn(tools[1], 'strict'));
  assert((requestBody?.environment as Record<string, unknown>).type === 'none');
  assert((agent.reasoning as Record<string, unknown>).effort === 'medium');
  assert((agent.instructions as string).includes('Trusted system context'));
  assert((agent.instructions as string).includes('first action'));
  assert((requestBody?.input as Array<Record<string, unknown>>)[0].role === 'user');
  const headers = new Headers(requestHeaders);
  assert(headers.get('OpenAI-Beta') === 'agents=v1');
});

Deno.test('Agents API required actions keep call and turn IDs for approval-safe execution', async () => {
  let call = 0;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async () => {
      call++;
      return Response.json({ status: 'requires_action', required_actions: [
        { type: 'function_call', turn_id: 'turn_test', call_id: 'call_test', name: 'read_value', arguments: { key: 'a' } },
      ] });
    }) as typeof fetch,
  });
  const turn = await provider.pollAgentSession!('sess_test');
  assert(call === 1);
  assert(turn?.calls[0].id === 'call_test' && turn.calls[0].turnId === 'turn_test');
  assert(turn?.calls[0].arguments === '{"key":"a"}');
});

Deno.test('Agents API tool results use the durable idempotency key and verified action IDs', async () => {
  let body: Record<string, unknown> | undefined;
  let headers: HeadersInit | undefined;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async (_url, init) => {
      body = JSON.parse(String(init?.body));
      headers = init?.headers;
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });
  await provider.submitAgentToolResults!('sess_test', [{
    callId: 'call_test', turnId: 'turn_test', success: true, output: '{"value":42}',
  }], 'run:agent-results:1');
  const event = (body?.events as Array<Record<string, unknown>>)[0];
  assert(event.type === 'agent.session.input.tool_result');
  assert(event.call_id === 'call_test' && event.turn_id === 'turn_test');
  assert(event.success === true && event.output === '{"value":42}');
  assert(new Headers(headers).get('Idempotency-Key') === 'run:agent-results:1');
});

Deno.test('Agents API rejection reports bounded endpoint diagnostics without echoing request data', async () => {
  const provider = cloudAgentsProvider({
    apiKey: 'do-not-return-this-key', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async () => Response.json({ error: {
      message: 'private input must not be echoed', type: 'invalid_request_error',
      code: 'invalid_type', param: 'events[0].output',
    } }, { status: 400 })) as typeof fetch,
  });
  let message = '';
  try {
    await provider.submitAgentToolResults!('sess_private-session-id', [{
      callId: 'call_test', turnId: 'turn_test', success: true, output: 'private tool output',
    }], 'run:agent-results:1');
  } catch (error) {
    message = error instanceof Error ? error.message : '';
  }
  assert(message.includes('Agents API HTTP 400'));
  assert(message.includes('/sessions/{session_id}/events'));
  assert(message.includes('invalid_type'));
  assert(message.includes('param=events[0].output'));
  assert(!message.includes('private-session-id') && !message.includes('private input'));
  assert(!message.includes('private tool output') && !message.includes('do-not-return-this-key'));
});

Deno.test('Agents API only returns final text after a confirmed completed turn', async () => {
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async (url) => {
      const path = String(url);
      if (path.endsWith('/sessions/sess_test')) return Response.json({ status: 'idle', usage: { total_tokens: 22 } });
      if (path.endsWith('/turns?order=desc&limit=1')) return Response.json({ data: [{ id: 'turn_test', status: 'completed' }] });
      if (path.endsWith('/turns/turn_test/items?order=asc&limit=100')) return Response.json({ data: [
        { type: 'assistant_message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'The answer is 42.' }] },
      ] });
      if (path.endsWith('/turns/turn_test')) return Response.json({ usage: { total_tokens: 18 } });
      throw new Error('Unexpected provider request');
    }) as typeof fetch,
  });
  const turn = await provider.pollAgentSession!('sess_test');
  assert(turn?.text === 'The answer is 42.');
  assert(turn?.tokens === 18);
});
