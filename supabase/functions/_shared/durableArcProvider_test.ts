import { deepStrictEqual, equal, ok, rejects, throws } from 'node:assert/strict';
import { ARC_ASTRA, ARC_LUNA, type ArcModelRoute } from './arcModelRouting.ts';
import { prepareDurableArcModelUsage } from './arcModelUsage.ts';
import { durableArcProvider } from './durableArcProvider.ts';
import { CLOUD_APP_LIMITS, CLOUD_LIMITS, initialEngineState } from './cloudRunEngine.ts';
import { processCloudRun, type ClaimedCloudRun, type CloudWorkerStore } from './cloudRunWorker.ts';

const NOW = Date.parse('2026-10-10T19:00:00Z');
const route: ArcModelRoute = { model: ARC_ASTRA, selection: ARC_ASTRA, effort: 'medium', task: 'code' };
const definition = { type: 'function' as const, name: 'write_fixture', description: 'Write a fixture.',
  parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true };

function fixture(source: 'work' | 'app' = 'work') {
  let status = 'queued', cumulative = 0, reserved = false, nextId = 0, executions = 0;
  let requestedRoute = route;
  let responseFailure = false, failCheckpoint = false;
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const http: Array<{ path: string; method: string; payload?: Record<string, unknown> }> = [];
  const recorded = new Map<string, Record<string, unknown>>();
  const metadata = new Map<string, unknown>();
  const limits = source === 'app' ? CLOUD_APP_LIMITS : CLOUD_LIMITS;
  const run: ClaimedCloudRun = { id: `fixture-${source}`, user_id: 'owner', session_id: 'chat', mode: 'ask',
    lease_token: 'lease', created_at: new Date(NOW).toISOString(), request: {
      messages: [{ role: 'user', content: 'Write this fixture.' }],
    }, checkpoint: {} };
  const db = { async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    if (name === 'reserve_arc_usage') {
      const replayed = reserved; reserved = true;
      return { error: null, data: { allowed: true, reservationId: 'same-reservation', replayed,
        enforcementEnabled: true, configured: true, adminUncapped: false,
        cumulativeCostNanos: cumulative, reservedNanos: 20_000_000, state: 'reserved' } };
    }
    equal(name, 'record_arc_usage');
    const previous = recorded.get(String(args.receipt_key));
    if (!previous) {
      cumulative = Number(args.cumulative_nanos);
      recorded.set(String(args.receipt_key), args);
    }
    return { error: null, data: { revision: recorded.size, cumulativeCostNanos: cumulative,
      replayed: !!previous, enforcementEnabled: true } };
  } };
  const usage = { input_tokens: 100, output_tokens: 100, total_tokens: 200 };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://api.openai.com/v1', '');
    const method = init?.method ?? 'GET';
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    http.push({ path, method, payload });
    if (path === '/responses/input_tokens') return Response.json({ input_tokens: 100 });
    if (path === '/responses' && method === 'POST') {
      if (responseFailure) throw new Error('Fixture lost model acknowledgement');
      const id = `resp_${++nextId}`; metadata.set(id, payload.metadata);
      return Response.json({ id, status: 'queued', metadata: payload.metadata });
    }
    if (path === '/responses/resp_1') return Response.json({ id: 'resp_1', status: 'completed', usage, metadata: metadata.get('resp_1'), output: [
      { type: 'reasoning', id: 'reasoning_1', summary: [{ type: 'summary_text', text: 'Ready to write.' }] },
      { type: 'function_call', call_id: 'call_write', name: definition.name, arguments: '{}' },
    ] });
    if (path === '/responses/resp_existing' || path === '/responses/resp_2') {
      const id = path.split('/').at(-1)!;
      return Response.json({ id, status: 'completed', usage,
        metadata: metadata.get(id) ?? { arc_usage_prior_nanos: '0', arc_usage_reservation_id: 'same-reservation' }, output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] },
      ] });
    }
    if (path.endsWith('/cancel')) {
      const id = path.split('/').at(-2)!;
      return Response.json({ id, status: 'cancelled', usage, metadata: metadata.get(id) });
    }
    if (path === '/agents/sessions/sess_existing') {
      return Response.json({ id: 'sess_existing', status: 'in_progress', usage, spend_control: { limit: 2 } });
    }
    throw new Error(`Unexpected offline fixture request: ${method} ${path}`);
  }) as typeof fetch;
  const store: CloudWorkerStore = {
    claim: async () => structuredClone(run),
    checkpoint: async (_run, checkpoint, next) => {
      if (failCheckpoint && (checkpoint.engine as { phase?: string }).phase === 'tools') return false;
      run.checkpoint = structuredClone(checkpoint); status = next; return true;
    },
    complete: async (_run, result) => {
      equal((result as { model_used: string }).model_used, ARC_ASTRA);
      equal((result as { reasoning_effort_used: string }).reasoning_effort_used, 'medium');
      status = 'completed'; return true;
    },
  };
  const advance = () => processCloudRun(run.id, { store, now: () => NOW + 1, limits,
    prepare: async claimed => {
      const usage = await prepareDurableArcModelUsage({ db, user: { id: claimed.user_id },
        run: claimed, route: requestedRoute, source, maxTotalTokens: limits.tokens });
      return { modelUsed: usage.route.model, reasoningEffortUsed: usage.route.effort,
        provider: durableArcProvider(claimed.checkpoint.engine, { apiKey: 'fixture', instructions: 'Fixture instructions.',
          model: usage.route.model, reasoningEffort: usage.route.effort, ticket: usage.ticket,
          tools: [definition], firstTool: definition.name, fetcher, maxTotalTokens: limits.tokens }),
        tools: { [definition.name]: { approval: 'always', replaySafe: true,
          authorize: async () => true, execute: async () => { executions++; return 'Saved fixture.'; } } },
      };
    },
  });
  return { run, advance, rpcCalls, http, recorded, status: () => status, executions: () => executions,
    changeRequestedRoute: () => { requestedRoute = { ...route, model: ARC_LUNA, effort: 'none' }; },
    losePost: () => { responseFailure = true; },
    loseCheckpoint: (lost: boolean) => { failCheckpoint = lost; },
  };
}

for (const source of ['work', 'app'] as const) {
  Deno.test(`${source}: reconstructed leases use bounded Responses with pinned route, receipts and approvals`, async () => {
    const f = fixture(source);
    await f.advance();
    equal(f.run.checkpoint.engine?.modelProvider, 'responses');
    f.changeRequestedRoute();
    await f.advance(); // Provider tool result is durable before the tool can run.
    await f.advance(); // Approval gate.
    equal(f.status(), 'awaiting_input'); equal(f.executions(), 0);
    const pending = f.run.checkpoint.pendingApproval as { callId: string; argumentsHash: string };
    f.run.checkpoint.inputResponse = { decision: 'approve', callId: pending.callId, argumentsHash: pending.argumentsHash };
    for (let i = 0; i < 5 && f.status() !== 'completed'; i++) await f.advance();
    equal(f.status(), 'completed'); equal(f.executions(), 1);
    const posts = f.http.filter(call => call.path === '/responses' && call.method === 'POST');
    equal(posts.length, 2);
    ok(f.http.every(call => !call.path.startsWith('/agents')));
    for (const { payload } of posts) {
      equal(payload!.model, ARC_ASTRA);
      deepStrictEqual(payload!.reasoning, { effort: 'medium', summary: 'auto' });
      equal(payload!.instructions, 'Fixture instructions.');
      ok(Number.isSafeInteger(payload!.max_output_tokens));
    }
    ok(Number(posts[1].payload!.max_output_tokens) < Number(posts[0].payload!.max_output_tokens));
    deepStrictEqual(posts[0].payload!.tool_choice, { type: 'function', name: definition.name });
    equal(posts[1].payload!.tool_choice, 'auto');
    const resumedInput = posts[1].payload!.input as Array<Record<string, unknown>>;
    ok(resumedInput.some(item => item.type === 'reasoning' && item.id === 'reasoning_1'));
    ok(resumedInput.some(item => item.type === 'function_call_output' && item.call_id === 'call_write' && item.output === 'Saved fixture.'));
    const receipts = [...f.recorded.values()];
    deepStrictEqual(receipts.map(receipt => receipt.is_final), [false, true]);
    deepStrictEqual(receipts.map(receipt => receipt.cumulative_nanos), [6_000_000, 12_000_000]);
    ok(receipts.every(receipt => receipt.reservation_id === 'same-reservation'));
    ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').every(call => call.args.model_name === ARC_ASTRA));
    equal(f.run.checkpoint.engine?.tokens, 400);
  });
}

Deno.test('durable existing Agents session stays on Agents with no new provider submission', async () => {
  const f = fixture();
  f.run.checkpoint.engine = { ...initialEngineState(f.run.request.messages, NOW),
    agentSessionId: 'sess_existing', modelProvider: 'agents', modelIntent: 'existing:0' };
  await f.advance();
  equal(f.status(), 'queued');
  deepStrictEqual(f.http.map(call => [call.method, call.path]), [['GET', '/agents/sessions/sess_existing']]);
  equal(f.run.checkpoint.engine.agentSessionId, 'sess_existing');
});

Deno.test('durable existing Response ID is polled without an Agents session or new POST', async () => {
  const f = fixture();
  f.run.checkpoint.engine = { ...initialEngineState(f.run.request.messages, NOW),
    responseId: 'resp_existing', modelProvider: 'responses', modelIntent: 'existing:0' };
  await f.advance();
  equal(f.status(), 'completed');
  deepStrictEqual(f.http.map(call => [call.method, call.path]), [['GET', '/responses/resp_existing']]);
});

Deno.test('durable unknown provider intent pauses without counting, submitting or changing model', async () => {
  const f = fixture();
  f.run.checkpoint.engine = { ...initialEngineState(f.run.request.messages, NOW), modelIntent: 'existing:0' };
  await f.advance();
  equal(f.status(), 'awaiting_input'); equal(f.http.length, 0); equal(f.recorded.size, 0);
});

Deno.test('durable lost Response POST acknowledgement keeps its intent and never retries generation', async () => {
  const f = fixture(); f.losePost();
  await rejects(f.advance(), /lost model acknowledgement/);
  ok(f.run.checkpoint.engine?.modelIntent);
  await f.advance();
  equal(f.status(), 'awaiting_input');
  equal(f.http.filter(call => call.path === '/responses').length, 1);
  equal(f.recorded.size, 0);
});

Deno.test('durable repeated terminal response receipt after a lost checkpoint never double charges', async () => {
  const f = fixture(); await f.advance();
  f.loseCheckpoint(true); await f.advance();
  equal(f.recorded.size, 1);
  equal(f.run.checkpoint.engine?.responseId, 'resp_1');
  f.loseCheckpoint(false); await f.advance();
  equal(f.run.checkpoint.engine?.phase, 'tools'); equal(f.recorded.size, 1);
  const records = f.rpcCalls.filter(call => call.name === 'record_arc_usage');
  equal(records.length, 2);
  equal(records[0].args.receipt_key, records[1].args.receipt_key);
  equal(records[0].args.cumulative_nanos, records[1].args.cumulative_nanos);
});

Deno.test('durable null ticket is allowed only for Luna, with Responses output still capped', async () => {
  let outputLimit = 0;
  const options: Parameters<typeof durableArcProvider>[1] = { apiKey: 'fixture', instructions: '', model: ARC_LUNA, reasoningEffort: 'none',
    tools: [], ticket: null, maxTotalTokens: 1_000,
    fetcher: (async (url, init) => {
      if (String(url).endsWith('/input_tokens')) return Response.json({ input_tokens: 100 });
      equal(String(url), 'https://api.openai.com/v1/responses');
      outputLimit = JSON.parse(String(init?.body)).max_output_tokens;
      return Response.json({ id: 'resp_luna_bounded', status: 'queued' });
    }) as typeof fetch,
  };
  const provider = durableArcProvider(undefined, options);
  equal(provider.startAgentSession, undefined);
  ok(provider.startModel); ok(provider.pollModel); ok(provider.cancelModel);
  await provider.startModel([{ role: 'user', content: 'Hi.' }], 'luna:0', 8_000);
  ok(outputLimit >= 128 && outputLimit < 1_000);
  throws(() => durableArcProvider(undefined, { ...options, model: ARC_ASTRA }), /must be reserved/);
});

Deno.test('durable premium done-state retries only final persistence without a new ticket or provider', async () => {
  const f = fixture();
  f.run.checkpoint.modelRoute = route;
  f.run.checkpoint.engine = { ...initialEngineState(f.run.request.messages, NOW), phase: 'done', finalText: 'Already done.' };
  await f.advance();
  equal(f.status(), 'completed'); equal(f.rpcCalls.length, 0); equal(f.http.length, 0);
});

for (const source of ['work', 'app'] as const) {
  Deno.test(`${source}: tools-phase timeout in a later lease settles only confirmed prior model spend`, async () => {
    const f = fixture(source);
    await f.advance(); await f.advance();
    equal(f.run.checkpoint.engine?.phase, 'tools');
    equal(f.run.checkpoint.engine?.responseId, undefined);
    equal(f.run.checkpoint.engine?.lastResponseId, 'resp_1');
    f.run.checkpoint.engine!.deadline = NOW;
    await f.advance();
    equal(f.status(), 'failed'); equal(f.executions(), 0);
    equal(f.http.filter(call => call.path === '/responses' && call.method === 'POST').length, 1);
    const receipts = [...f.recorded.values()];
    deepStrictEqual(receipts.map(receipt => receipt.is_final), [false, true]);
    ok(receipts.every(receipt => receipt.cumulative_nanos === 6_000_000));
  });
}

Deno.test('durable 16-turn stop settles the last completed Response without starting a seventeenth turn', async () => {
  const f = fixture();
  await f.advance(); await f.advance();
  const engine = f.run.checkpoint.engine!;
  engine.phase = 'model'; engine.calls = []; engine.turns = CLOUD_LIMITS.turns;
  await f.advance();
  equal(f.status(), 'failed'); equal(CLOUD_LIMITS.turns, 16);
  equal(f.http.filter(call => call.path === '/responses' && call.method === 'POST').length, 1);
  const receipts = [...f.recorded.values()];
  equal(receipts.at(-1)!.is_final, true); equal(receipts.at(-1)!.cumulative_nanos, 6_000_000);
});

Deno.test('durable stopped unknown newer POST never finalizes the older completed Response hold', async () => {
  const f = fixture();
  await f.advance(); await f.advance();
  const before = f.http.length;
  const engine = f.run.checkpoint.engine!;
  engine.phase = 'model'; engine.calls = []; engine.modelIntent = 'ambiguous-new-step'; engine.deadline = NOW;
  await f.advance();
  equal(f.status(), 'failed'); equal(f.http.length, before);
  equal(f.recorded.size, 1); equal([...f.recorded.values()][0].is_final, false);
});

Deno.test('durable rollback uses Agents only for fresh runs and keeps saved Responses resumable', () => {
  const options: Parameters<typeof durableArcProvider>[1] = { apiKey: 'fixture', instructions: '',
    model: ARC_LUNA, reasoningEffort: 'none', tools: [], ticket: null };
  ok(durableArcProvider(undefined, options, false).startAgentSession);
  for (const saved of [
    { modelProvider: 'responses' as const }, { responseId: 'resp_existing' }, { lastResponseId: 'resp_prior' },
  ]) {
    const engine = { ...initialEngineState([], NOW), ...saved };
    const provider = durableArcProvider(engine, options, false);
    equal(provider.startAgentSession, undefined);
    equal(provider.retainCompletedResponseId, true);
  }
  const savedAgent = { ...initialEngineState([], NOW), agentSessionId: 'sess_existing' };
  ok(durableArcProvider(savedAgent, options, true).startAgentSession);
});

/** Separate stable per-attempt fixture for the pre-generation route transition. */
function inputFitFixture(options: {
  releaseFailure?: boolean; rejectMarker?: boolean; crashAfterMarker?: boolean; toolRound?: boolean; loseSecondPost?: boolean;
} = {}) {
  let inputTokens = options.toolRound ? 100 : 1_000;
  let status = 'queued', premiumReserve = options.toolRound ? 20_000_000 : 10_000_000, crashed = false;
  let completed: Record<string, unknown> | undefined;
  const run: ClaimedCloudRun = { id: 'input-fit', user_id: 'owner', session_id: 'session', mode: 'auto',
    lease_token: 'lease', created_at: new Date(NOW).toISOString(),
    request: { messages: [{ role: 'user', content: 'Write a complete fixture.' }] }, checkpoint: {} };
  const reservations = new Map<string, { id: string; cost: number; state: string }>();
  const records = new Map<string, Record<string, unknown>>();
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const http: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const generations = new Map<string, Record<string, unknown>>();
  const db = { async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    if (name === 'reserve_arc_usage') {
      const key = String(args.attempt_key), previous = reservations.get(key);
      const current = previous ?? { id: `reserve-${key}`, cost: 0, state: 'reserved' };
      reservations.set(key, current);
      return { error: null, data: { allowed: true, reservationId: current.id, replayed: !!previous,
        enforcementEnabled: true, configured: true, adminUncapped: false,
        cumulativeCostNanos: current.cost, reservedNanos: args.model_name === ARC_ASTRA ? premiumReserve : 10_000_000,
        state: current.state } };
    }
    equal(name, 'record_arc_usage');
    if (options.releaseFailure && (args.usage_detail as { basis?: string }).basis === 'confirmed-zero') {
      return { error: 'Fixture release failed', data: null };
    }
    const reservation = [...reservations.values()].find(item => item.id === args.reservation_id)!;
    const key = String(args.receipt_key), previous = records.get(key);
    if (!previous) {
      records.set(key, args); reservation.cost = Number(args.cumulative_nanos);
      if (args.is_final) reservation.state = 'settled';
    }
    return { error: null, data: { revision: records.size, cumulativeCostNanos: reservation.cost,
      replayed: !!previous, enforcementEnabled: true } };
  } };
  const fetcher = (async (url, init) => {
    const path = String(url).replace('https://api.openai.com/v1', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    http.push({ path, body });
    if (path === '/responses/input_tokens') return Response.json({ input_tokens: inputTokens });
    if (path === '/responses') {
      const id = `resp_fit_${generations.size + 1}`; generations.set(id, body);
      if (options.loseSecondPost && generations.size === 2) throw new Error('Fixture accepted second POST with unknown acknowledgement');
      return Response.json({ id, status: 'queued', metadata: body.metadata });
    }
    const id = path.split('/').at(-1)!, generation = generations.get(id);
    if (generation) return Response.json({ id, status: 'completed', metadata: generation.metadata,
      model: generation.model, usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      output: options.toolRound && id === 'resp_fit_1'
        ? [{ type: 'function_call', call_id: 'call_fit', name: definition.name, arguments: '{}' }]
        : [{ type: 'message', content: [{ type: 'output_text', text: 'Completed safely.' }] }],
    });
    throw new Error(`Unexpected fixture request: ${path}`);
  }) as typeof fetch;
  const store: CloudWorkerStore = {
    claim: async () => structuredClone(run),
    checkpoint: async (_run, checkpoint, next) => {
      const marker = (checkpoint.engine as { initialInputBudgetExceeded?: boolean; modelIntent?: string });
      const isMarker = marker.initialInputBudgetExceeded === true && !marker.modelIntent;
      if (options.rejectMarker && isMarker) return false;
      run.checkpoint = structuredClone(checkpoint); status = next;
      if (options.crashAfterMarker && isMarker && !crashed) {
        crashed = true; throw new Error('Fixture crashed after accepted fallback marker');
      }
      return true;
    },
    complete: async (_run, result) => { completed = result as Record<string, unknown>; status = 'completed'; return true; },
  };
  const advance = () => processCloudRun(run.id, { store, now: () => NOW + 1,
    prepare: async claimed => {
      const usage = await prepareDurableArcModelUsage({ db, user: { id: claimed.user_id }, run: claimed,
        route, source: 'work', maxTotalTokens: CLOUD_LIMITS.tokens });
      return { modelUsed: usage.route.model, reasoningEffortUsed: usage.route.effort, modelSwitchNotice: usage.notice,
        provider: durableArcProvider(claimed.checkpoint.engine, { apiKey: 'fixture', instructions: 'Fixture.',
          model: usage.route.model, reasoningEffort: usage.route.effort, ticket: usage.ticket, tools: [definition], fetcher }),
        tools: { [definition.name]: { approval: 'never', replaySafe: true, authorize: async () => true,
          execute: async () => 'Fixture saved.' } },
      };
    },
  });
  return { run, advance, rpcCalls, http, generations, records, status: () => status, completed: () => completed,
    refillPremium: () => { premiumReserve = 500_000_000; },
    exceedNextInput: () => { inputTokens = 1_000; },
  };
}

Deno.test('durable initial input-fit release failure retains the original intent with no fallback marker', async () => {
  const f = inputFitFixture({ releaseFailure: true });
  await rejects(f.advance(), /usage could not be verified/);
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, undefined);
  ok(f.run.checkpoint.engine?.modelIntent);
  equal(f.generations.size, 0); equal(f.records.size, 0);
  await f.advance();
  equal(f.status(), 'awaiting_input'); equal(f.generations.size, 0);
  ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').every(call => call.args.model_name === ARC_ASTRA));
});

Deno.test('durable rejected fallback-marker checkpoint leaves the saved submission intent fenced', async () => {
  const f = inputFitFixture({ rejectMarker: true });
  await f.advance();
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, undefined);
  ok(f.run.checkpoint.engine?.modelIntent); equal(f.generations.size, 0);
  equal([...f.records.values()][0].cumulative_nanos, 0);
  await f.advance();
  equal(f.status(), 'awaiting_input'); equal(f.generations.size, 0);
  equal(f.http.filter(call => call.path === '/responses/input_tokens').length, 1);
  ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').every(call => call.args.attempt_key === 'work:primary'));
});

Deno.test('durable crash after the accepted fallback marker resumes only a newly reserved Luna attempt', async () => {
  const f = inputFitFixture({ crashAfterMarker: true });
  await rejects(f.advance(), /crashed after accepted fallback marker/);
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, true);
  equal(f.run.checkpoint.engine?.modelIntent, undefined); equal(f.generations.size, 0);
  await f.advance(); await f.advance();
  equal(f.status(), 'completed'); equal(f.generations.size, 1);
  equal([...f.generations.values()][0].model, ARC_LUNA);
  equal(f.run.checkpoint.modelUsageAttempt, 'work:input-fit-luna');
  equal(f.completed()?.model_used, ARC_LUNA);
  ok(String(f.completed()?.model_switch_notice).includes('could not cover the full prompt'));
  deepStrictEqual(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').map(call => call.args.model_name),
    [ARC_ASTRA, ARC_LUNA, ARC_LUNA]);
});

Deno.test('durable premium refill cannot undo the persisted initial input-fit Luna choice', async () => {
  const f = inputFitFixture(); await f.advance();
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, true); equal(f.generations.size, 0);
  f.refillPremium();
  await f.advance(); await f.advance();
  equal(f.status(), 'completed');
  equal([...f.generations.values()][0].model, ARC_LUNA);
  equal((f.run.checkpoint.modelRoute as ArcModelRoute).model, ARC_LUNA);
  equal(f.run.checkpoint.modelUsageAttempt, 'work:input-fit-luna');
  ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').slice(1).every(call => call.args.model_name === ARC_LUNA));
});

Deno.test('durable later-turn known input budget failure settles prior exact cost without rerouting', async () => {
  const f = inputFitFixture({ toolRound: true });
  await f.advance(); await f.advance(); await f.advance(); await f.advance();
  equal(f.run.checkpoint.engine?.phase, 'model'); equal(f.run.checkpoint.engine?.turns, 1);
  f.exceedNextInput();
  await f.advance();
  equal(f.status(), 'failed');
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, undefined);
  equal(f.run.checkpoint.engine?.modelIntent, undefined); equal(f.generations.size, 1);
  equal(f.run.checkpoint.engine?.lastResponseId, 'resp_fit_1');
  equal((f.run.checkpoint.modelRoute as ArcModelRoute).model, ARC_ASTRA);
  const receipts = [...f.records.values()];
  deepStrictEqual(receipts.map(receipt => receipt.is_final), [false, true]);
  ok(receipts.every(receipt => receipt.cumulative_nanos === 6_000_000));
  equal(f.http.filter(call => call.path === '/responses/input_tokens').length, 2);
  equal(f.http.filter(call => call.path === '/responses').length, 1);
  ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').every(call => call.args.model_name === ARC_ASTRA));
});

Deno.test('durable later-turn unknown POST retains its new intent and hold without cancelling the old Response', async () => {
  const f = inputFitFixture({ toolRound: true, loseSecondPost: true });
  await f.advance(); await f.advance(); await f.advance(); await f.advance();
  equal(f.run.checkpoint.engine?.phase, 'model'); equal(f.run.checkpoint.engine?.turns, 1);
  await rejects(f.advance(), /accepted second POST with unknown acknowledgement/);
  equal(f.run.checkpoint.engine?.initialInputBudgetExceeded, undefined);
  equal(f.run.checkpoint.engine?.modelIntent, 'input-fit:model:1');
  equal(f.run.checkpoint.engine?.responseId, undefined);
  equal(f.run.checkpoint.engine?.lastResponseId, 'resp_fit_1');
  equal(f.generations.size, 2);
  equal([...f.records.values()].filter(receipt => receipt.is_final).length, 0);
  const before = f.http.length;
  await f.advance();
  equal(f.status(), 'awaiting_input'); equal(f.http.length, before); equal(f.generations.size, 2);
  f.run.checkpoint.engine!.deadline = NOW;
  await f.advance();
  equal(f.status(), 'failed'); equal(f.http.length, before);
  equal([...f.records.values()].filter(receipt => receipt.is_final).length, 0);
  equal((f.run.checkpoint.modelRoute as ArcModelRoute).model, ARC_ASTRA);
  ok(f.rpcCalls.filter(call => call.name === 'reserve_arc_usage').every(call => call.args.model_name === ARC_ASTRA));
});
