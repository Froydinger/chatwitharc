import { CloudAgentsApiRequestError, cloudAgentsProvider } from './cloudAgentsProvider.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}

Deno.test('provider admission precedes creation and uses the reserved whole-cent ceiling', async () => {
  const order: string[] = [];
  const provider = cloudAgentsProvider({ apiKey: 'test', instructions: '', reasoningEffort: 'low',
    model: 'gpt-6.1-sol', tools: [], spendLimitCents: 5,
    expandInput: async transcript => { order.push('input'); return transcript; },
    beforeStart: () => { order.push('admission'); },
    fetcher: (async (_url, init) => {
      order.push('post');
      const body = JSON.parse(String(init?.body));
      assert(body.spend_control.limit === 5 && body.agent.max_output_tokens === undefined);
      return Response.json({ id: 'sess_capped' });
    }) as typeof fetch });
  await provider.startAgentSession!([{ role: 'user', content: 'hi' }], 'request', 4000);
  assert(order.join(',') === 'input,admission,post');
});

Deno.test('legacy resumed session receives its absolute reserved ceiling before tool continuation', async () => {
  const paths: string[] = [];
  const provider = cloudAgentsProvider({ apiKey: 'test', instructions: '', reasoningEffort: 'low',
    tools: [], spendLimitCents: 5,
    fetcher: (async (url, init) => {
      paths.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        assert(body.spend_control.limit === 5 && Object.keys(body).length === 1);
        return Response.json({ status: 'in_progress', usage: { total_tokens: 10 }, spend_control: { limit: 5, consumed: 1 } });
      }
      return Response.json({ status: 'in_progress', usage: { total_tokens: 10 } });
    }) as typeof fetch });
  const turn = await provider.pollAgentSession!('sess_legacy');
  assert(turn?.progressOnly === true);
  assert(paths.length === 2 && paths[1] === 'POST https://api.openai.com/v1/agents/sessions/sess_legacy');
});

Deno.test('input preparation failure never claims a provider POST happened', async () => {
  let admitted = false, fetched = false;
  const provider = cloudAgentsProvider({ apiKey: 'test', instructions: '', reasoningEffort: 'low', tools: [],
    expandInput: async () => { throw new Error('media temporarily unavailable'); },
    beforeStart: () => { admitted = true; },
    fetcher: (async () => { fetched = true; return Response.json({}); }) as typeof fetch });
  let failed = false;
  try { await provider.startAgentSession!([], 'request', 4000); } catch { failed = true; }
  assert(failed && !admitted && !fetched);
});

Deno.test('ambiguous Agents session POST statuses retain usage holds', async () => {
  for (const status of [408, 409, 418, 499]) {
    let rejectedCalls = 0;
    const provider = cloudAgentsProvider({
      apiKey: 'test',
      instructions: '',
      reasoningEffort: 'none',
      model: 'gpt-6-luna',
      tools: [],
      spendLimitCents: 5,
      onRejected: async () => {
        rejectedCalls++;
      },
      fetcher: (async () => Response.json({ error: {
        type: 'invalid_request_error',
        code: 'invalid_request_error',
        param: 'spend_control',
        message: 'This feature is not yet enabled for your organization',
      } }, { status })) as typeof fetch,
    });
    let caught: unknown;
    try {
      await provider.startAgentSession!([{ role: 'user', content: 'Hi' }], 'ambiguous', 65_536);
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof CloudAgentsApiRequestError);
    assert(!caught.confirmedZero, `status ${status} must retain the hold`);
    assert(rejectedCalls === 0, `status ${status} must not call zero settlement`);
  }
});

Deno.test('metered cancellation settles only after a confirmed terminal turn', async () => {
  for (const active of [false, true]) {
    const observed: Array<{ final: boolean; usage: unknown }> = [];
    const provider = cloudAgentsProvider({ apiKey: 'test', instructions: '', reasoningEffort: 'low', tools: [],
      onUsage: async (usage, final) => { observed.push({ usage, final }); },
      fetcher: (async (url, init) => {
        if (init?.method === 'POST') return Response.json({});
        if (String(url).includes('/turns?')) return Response.json({ data: [{ status: 'cancelled' }] });
        return Response.json({ status: active ? 'in_progress' : 'idle', usage: { total_tokens: 25 } });
      }) as typeof fetch });
    await provider.cancelAgentSession!('sess_cancel', 'cancel-key');
    assert(observed.length === 1 && observed[0].final === !active);
    assert((observed[0].usage as { total_tokens: number }).total_tokens === 25);
  }
});

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
  // Agents API schemas currently reject the Responses-style strict property.
  assert(!Object.hasOwn(tools[0], 'strict'));
  assert(!Object.hasOwn(tools[1], 'strict'));
  assert((requestBody?.environment as Record<string, unknown>).type === 'none');
  assert((agent.reasoning as Record<string, unknown>).effort === 'medium');
  assert((agent.instructions as string).includes('Trusted system context'));
  assert((agent.instructions as string).includes('first action'));
  assert((requestBody?.input as Array<Record<string, unknown>>)[0].role === 'user');
  const headers = new Headers(requestHeaders);
  assert(headers.get('OpenAI-Beta') === 'agents=v1');
});

Deno.test('Agents API defaults to Luna even when callers request high reasoning', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'Arc instructions', reasoningEffort: 'high', tools: [],
    fetcher: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ id: 'sess_test' });
    }) as typeof fetch,
  });
  await provider.startAgentSession!([{ role: 'user', content: 'Reason carefully.' }], 'run:model:high', 4000);
  const agent = requestBody?.agent as Record<string, unknown>;
  assert(agent.model === 'gpt-6-luna');
  assert((agent.reasoning as Record<string, unknown>).effort === 'high');
});

Deno.test('River Agents sessions use the explicitly selected Sol 6.1 and low reasoning', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'Arc instructions', model: 'gpt-6.1-sol', reasoningEffort: 'low', tools: [],
    fetcher: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ id: 'sess_test' });
    }) as typeof fetch,
  });
  await provider.startAgentSession!([{ role: 'user', content: 'Reason carefully.' }], 'run:river', 4000);
  const agent = requestBody?.agent as Record<string, unknown>;
  assert(agent.model === 'gpt-6.1-sol');
  assert((agent.reasoning as Record<string, unknown>).effort === 'low');
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
  assert(turn?.providerActive === true);
});

Deno.test('Agents API reports usage while a session is in progress without presenting a final answer', async () => {
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async () => Response.json({ status: 'in_progress', usage: { total_tokens: 1_250 } })) as typeof fetch,
  });
  const turn = await provider.pollAgentSession!('sess_test', 1_000);
  assert(turn?.progressOnly === true && turn.providerActive === true);
  assert(turn.tokens === 250 && turn.text === '' && turn.calls.length === 0);
});

Deno.test('Agents API tool results use the durable idempotency key and verified action IDs', async () => {
  let body: Record<string, unknown> | undefined;
  let headers: HeadersInit | undefined;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async (_url, init) => {
      if (!init?.body) return Response.json({ status: 'requires_action', required_actions: [{ type: 'function_call', call_id: 'call_test', turn_id: 'turn_test' }] });
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

Deno.test('Agents API cancellation posts the documented cancel event with an idempotency key', async () => {
  let body: Record<string, unknown> | undefined;
  let headers: HeadersInit | undefined;
  let url = '';
  let method = '';
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async (input, init) => {
      url = String(input);
      method = String(init?.method);
      body = JSON.parse(String(init?.body));
      headers = init?.headers;
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });
  await provider.cancelAgentSession!('sess_test', 'run:agent-cancel');
  assert(url.endsWith('/sessions/sess_test/events'));
  assert(method === 'POST');
  assert((body?.events as Array<Record<string, unknown>>)[0].type === 'agent.session.input.cancel');
  assert(new Headers(headers).get('Idempotency-Key') === 'run:agent-cancel');
});

Deno.test('Agents API rejection reports bounded endpoint diagnostics without echoing request data', async () => {
  const provider = cloudAgentsProvider({
    apiKey: 'do-not-return-this-key', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async (_url, init) => !init?.body ? Response.json({ status: 'requires_action', required_actions: [{ type: 'function_call', call_id: 'call_test', turn_id: 'turn_test' }] }) : Response.json({ error: {
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
      if (path.endsWith('/sessions/sess_test/items?order=desc&limit=100')) return Response.json({ data: [
        { turn_id: 'turn_test', type: 'assistant_message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'The answer is 42.' }] },
        { turn_id: 'turn_test', type: 'assistant_message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'I will look it up first.' }] },
        { turn_id: 'turn_previous', type: 'assistant_message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'Stale answer must be ignored.' }] },
      ] });
      if (path.endsWith('/turns/turn_test')) return Response.json({ usage: { total_tokens: 18 } });
      throw new Error('Unexpected provider request');
    }) as typeof fetch,
  });
  const turn = await provider.pollAgentSession!('sess_test');
  assert(turn?.text === 'The answer is 42.');
  assert(turn?.tokens === 22, 'the cumulative session usage should be used consistently');
});

Deno.test('completed answer and usage reads begin concurrently after confirmed turn', async () => {
  let releaseItems!: () => void;
  const itemGate = new Promise<void>(resolve => { releaseItems = resolve; });
  let itemsStarted = false;
  const provider = cloudAgentsProvider({
    apiKey: 'test-only', instructions: 'test', reasoningEffort: 'low', tools: [],
    fetcher: (async url => {
      const path = String(url);
      if (path.endsWith('/sessions/sess_test')) return Response.json({ status: 'idle' });
      if (path.endsWith('/turns?order=desc&limit=1')) return Response.json({ data: [{ id: 'turn_test', status: 'completed' }] });
      if (path.includes('/items?')) {
        itemsStarted = true;
        await itemGate;
        return Response.json({ data: [{ turn_id: 'turn_test', type: 'assistant_message', phase: 'final_answer', content: [{ type: 'output_text', text: 'Hello.' }] }] });
      }
      if (path.endsWith('/turns/turn_test')) {
        assert(itemsStarted, 'items must already be requested');
        releaseItems();
        return Response.json({ usage: { total_tokens: 7 } });
      }
      throw new Error('Unexpected provider request');
    }) as typeof fetch,
  });
  const result = await provider.pollAgentSession!('sess_test');
  assert(result?.text === 'Hello.' && result.tokens === 7);
});

Deno.test('Luna accepts no reasoning without requesting a reasoning summary; Sol retains supported effort', async () => {
  for (const model of ['gpt-6-luna', 'gpt-6.1-sol'] as const) {
    let captured: Record<string, unknown> = {};
    const provider = cloudAgentsProvider({ apiKey: 'test-only', instructions: 'test', model, reasoningEffort: 'none', tools: [], fetcher: (async (_url, init) => { captured = JSON.parse(String(init?.body)); return Response.json({ id: 'sess_test' }); }) as typeof fetch });
    await provider.startAgentSession!([{ role: 'user', content: 'hi' }], 'test-none', 100);
    const reasoning = (captured.agent as Record<string, unknown>).reasoning as Record<string, unknown>;
    assert(reasoning.effort === (model === 'gpt-6-luna' ? 'none' : 'low'));
    assert(model === 'gpt-6-luna' ? !('summary' in reasoning) : reasoning.summary === 'concise');
  }
});

Deno.test('provider preserves Sol effort and enforces Astra effort ceiling', async () => {
  for (const [model, effort, expected] of [
    ['gpt-6.1-sol', 'medium', 'medium'], ['gpt-6.1-sol', 'high', 'high'],
    ['gpt-6-astra', 'none', 'low'], ['gpt-6-astra', 'high', 'medium'],
  ] as const) {
    const provider = cloudAgentsProvider({ apiKey: 'fixture', instructions: 'Fixture', model,
      reasoningEffort: effort, tools: [], fetcher: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert(body.agent.model === model); assert(body.agent.reasoning.effort === expected);
        return Response.json({ id: 'sess_fixture' });
      }) as typeof fetch });
    await provider.startAgentSession!([], 'run:model:0', 4000);
  }
});
