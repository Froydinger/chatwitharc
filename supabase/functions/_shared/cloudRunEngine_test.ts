import { deepStrictEqual, equal, ok, rejects } from 'node:assert/strict';
import {
  CLOUD_LIMITS,
  CloudToolContinuation,
  type EnginePorts,
  type EngineState,
  initialEngineState,
  type ModelTurn,
  tickCloudRun,
  type ToolCall,
} from './cloudRunEngine.ts';

// No network, credentials, database, timers, or provider SDKs. Each tick starts
// from a clone of the last ACCEPTED save, not the prior tick's working memory.
// These test the engine/port contract; real fencing and transaction guarantees
// belong to DB/adapter tests. Ask/Auto policy is injected: the engine has no mode.
const RUN = 'synthetic-run';
const START = 1_000;
type Status = Parameters<EnginePorts['save']>[1];
type Policy = ReturnType<EnginePorts['toolPolicy']>;
type Poll = ModelTurn | null;
const clone = <T>(value: T): T => structuredClone(value);
const tool = (id = 'call-1', name = 'lookup'): ToolCall => ({ id, name, arguments: '{"query":"fixture"}' });
const turn = (calls: ToolCall[] = [], text = 'Finished.', tokens = 10): ModelTurn => ({ calls, text, tokens });
const receiptKey = (state: EngineState, call: ToolCall) => `${RUN}:turn:${state.turns}:tool:${call.id}`;

class FakePorts {
  clock = START;
  durable = initialEngineState([{ role: 'user', content: 'Synthetic request' }], START);
  status: Status | 'completed' = 'queued';
  reason?: string;
  cancelled = false;
  leaseLost = false;
  rejectSave: (state: EngineState, status: Status) => boolean = () => false;
  policy: (call: ToolCall) => Policy = () => ({ allowed: true, needsApproval: false, replaySafe: true });
  approved: (call: ToolCall) => boolean = () => false;
  output: (call: ToolCall, key: string) => Promise<string> = (call) => Promise.resolve(`output:${call.id}`);
  onPoll: () => void = () => {};
  onStart: () => void = () => {};
  events: string[] = [];
  saves: { state: EngineState; status: Status; reason?: string; accepted: boolean }[] = [];
  starts: { transcript: unknown[]; key: string; maxTokens: number }[] = [];
  polls: string[] = [];
  executions: { call: ToolCall; key: string }[] = [];
  completions: { text: string; state: EngineState; accepted: boolean }[] = [];
  plans: Poll[][];
  responses = new Map<string, Poll[]>();
  ports: EnginePorts;

  constructor(plans: Poll[][] = []) {
    this.plans = clone(plans);
    this.ports = {
      now: () => this.clock,
      save: (state, status, reason) => {
        const accepted = !this.cancelled && !this.leaseLost && !this.rejectSave(state, status);
        this.events.push(`save:${status}:${accepted}`);
        this.saves.push({ state: clone(state), status, reason, accepted });
        if (accepted) {
          this.durable = clone(state);
          this.status = status;
          this.reason = reason;
        }
        return Promise.resolve(accepted);
      },
      startModel: (transcript, key, maxTokens) => {
        this.events.push('startModel');
        this.starts.push({ transcript: clone(transcript), key, maxTokens });
        this.onStart();
        const plan = this.plans.shift();
        if (!plan) throw new Error('Unexpected model submission');
        const id = `response-${this.starts.length}`;
        this.responses.set(id, plan);
        return Promise.resolve(id);
      },
      pollModel: (id) => {
        this.events.push('pollModel');
        this.polls.push(id);
        this.onPoll();
        const plan = this.responses.get(id);
        if (!plan?.length) throw new Error(`Unexpected poll: ${id}`);
        return Promise.resolve(clone(plan.shift()!));
      },
      complete: (text, state) => {
        const accepted = !this.cancelled && !this.leaseLost && this.status !== 'completed';
        this.events.push(`complete:${accepted}`);
        this.completions.push({ text, state: clone(state), accepted });
        if (accepted) {
          this.durable = clone(state);
          this.status = 'completed';
        }
        return Promise.resolve(accepted);
      },
      toolPolicy: (call) => this.policy(call),
      approved: (call) => this.approved(call),
      executeTool: (call, key) => {
        this.events.push('executeTool');
        this.executions.push({ call: clone(call), key });
        return this.output(call, key);
      },
    };
  }

  async tick(): Promise<void> {
    const previous = clone(this.durable);
    const before = clone(previous);
    try { await tickCloudRun(RUN, previous, this.ports); }
    finally { deepStrictEqual(previous, before, 'a tick must not mutate its input checkpoint'); }
  }

  async finish(maxTicks = 80): Promise<void> {
    for (let i = 0; i < maxTicks; i++) {
      if (['completed', 'failed', 'awaiting_input'].includes(this.status)) return;
      await this.tick();
    }
    throw new Error('Engine did not settle within the test tick budget');
  }

  tools(calls: ToolCall[] = [tool()]): void {
    this.durable.phase = 'tools';
    this.durable.turns = 1;
    this.durable.calls = clone(calls);
  }
}

Deno.test('cloud engine: initial state establishes durable budgets', () => {
  const state = initialEngineState([{ role: 'user', content: 'hello' }], START);
  equal(state.version, 1);
  equal(state.phase, 'model');
  equal(state.deadline, START + CLOUD_LIMITS.durationMs);
  equal(state.turns, 0);
  equal(state.tokens, 0);
  deepStrictEqual(state.calls, []);
  deepStrictEqual(state.receipts, {});
});

Deno.test('cloud engine: pending continuation requeues with started receipt and stable key', async () => {
  const fake = new FakePorts(); fake.tools();
  fake.output = async () => { throw new CloudToolContinuation('pending'); };
  await fake.tick();
  equal(fake.status, 'queued');
  const key = receiptKey(fake.durable, fake.durable.calls[0]);
  deepStrictEqual(fake.durable.receipts[key], { state: 'started' });
  equal(fake.durable.transcript.length, 1);
  fake.output = async () => 'recovered output';
  await fake.tick();
  equal(fake.durable.receipts[key].state, 'done');
  deepStrictEqual(fake.executions.map(e => e.key), [key, key]);
});

Deno.test('cloud engine: recovery continuation pauses without a tool result', async () => {
  const fake = new FakePorts(); fake.tools();
  fake.output = async () => { throw new CloudToolContinuation('recovery_required'); };
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(Object.values(fake.durable.receipts)[0].state, 'started');
  equal(fake.durable.transcript.length, 1);
  equal(fake.completions.length, 0);
});

Deno.test('cloud engine: non-replay-safe continuation never automatically requeues', async () => {
  const fake = new FakePorts(); fake.tools();
  fake.policy = () => ({ allowed: true, needsApproval: false, replaySafe: false });
  fake.output = async () => { throw new CloudToolContinuation('pending'); };
  await fake.tick(); equal(fake.status, 'awaiting_input');
  await fake.tick(); equal(fake.executions.length, 1);
});

Deno.test('cloud engine: multiple tool rounds reconstruct transcript and complete once', async () => {
  const first = tool('a');
  const second = tool('b');
  // Reusing a provider call ID in a later turn must not reuse an old receipt.
  const third = tool('a', 'summarize');
  const fake = new FakePorts([
    [turn([first, second], 'Looking up.', 11)],
    [turn([third], 'Comparing.', 13)],
    [turn([], 'Final answer.', 17)],
  ]);
  await fake.finish();
  equal(fake.status, 'completed');
  equal(fake.durable.turns, 3);
  equal(fake.durable.tokens, 41);
  equal(fake.durable.phase, 'done');
  deepStrictEqual(fake.starts.map((start) => start.key), [`${RUN}:model:0`, `${RUN}:model:1`, `${RUN}:model:2`]);
  deepStrictEqual(fake.executions.map((execution) => execution.key), [
    `${RUN}:turn:1:tool:a`, `${RUN}:turn:1:tool:b`, `${RUN}:turn:2:tool:a`,
  ]);
  deepStrictEqual(fake.starts[2].transcript, [
    { role: 'user', content: 'Synthetic request' },
    { role: 'assistant', content: 'Looking up.', tool_calls: [first, second] },
    { role: 'tool', tool_call_id: 'a', content: 'output:a' },
    { role: 'tool', tool_call_id: 'b', content: 'output:b' },
    { role: 'assistant', content: 'Comparing.', tool_calls: [third] },
    { role: 'tool', tool_call_id: 'a', content: 'output:a' },
  ]);
  equal(fake.completions.filter((entry) => entry.accepted).length, 1);
  equal(fake.completions[0].text, 'Final answer.');
  for (const [index, event] of fake.events.entries()) {
    if (event === 'startModel' || event === 'executeTool') {
      equal(fake.events[index - 1], 'save:running:true', 'effects require a saved intent');
    }
  }
});

Deno.test('cloud engine: a persisted tool receipt prevents duplicate execution after restart', async () => {
  const fake = new FakePorts();
  const call = tool();
  fake.tools([call]);
  fake.durable.receipts[receiptKey(fake.durable, call)] = { state: 'done', output: 'saved receipt' };
  fake.policy = () => { throw new Error('A completed receipt should not need policy or execution'); };
  await fake.tick();
  equal(fake.executions.length, 0);
  equal(fake.durable.phase, 'model');
  deepStrictEqual(fake.durable.transcript.at(-1), { role: 'tool', tool_call_id: call.id, content: 'saved receipt' });
});

Deno.test('cloud engine: native provider reasoning and call items survive the next tool round', async () => {
  const call = tool('native-call');
  const outputItems = [
    { type: 'reasoning', id: 'synthetic-reasoning', summary: [{ type: 'summary_text', text: 'Need a lookup.' }] },
    { type: 'function_call', id: 'synthetic-item', call_id: call.id, name: call.name, arguments: call.arguments },
  ];
  const fake = new FakePorts([
    [{ ...turn([call]), outputItems, reasoningSummary: 'Need a lookup.' }],
    [turn([], 'Answer with preserved context')],
  ]);
  await fake.finish();
  equal(fake.status, 'completed');
  equal(fake.durable.reasoningSummary, 'Need a lookup.');
  deepStrictEqual(fake.starts[1].transcript, [
    { role: 'user', content: 'Synthetic request' },
    ...outputItems,
    { role: 'tool', tool_call_id: call.id, content: `output:${call.id}` },
  ]);
});

for (const reason of ['cancelled', 'leaseLost'] as const) {
  Deno.test(`cloud engine: ${reason} rejects model intent before provider submission`, async () => {
    const fake = new FakePorts();
    fake[reason] = true;
    const before = clone(fake.durable);
    await fake.tick();
    equal(fake.starts.length, 0);
    equal(fake.saves.length, 1);
    equal(fake.saves[0].accepted, false);
    deepStrictEqual(fake.durable, before);
  });

  Deno.test(`cloud engine: ${reason} rejects tool intent before side effect`, async () => {
    const fake = new FakePorts();
    fake.tools();
    fake[reason] = true;
    await fake.tick();
    equal(fake.executions.length, 0);
    deepStrictEqual(fake.durable.receipts, {});
    equal(fake.saves[0].accepted, false);
  });
}

Deno.test('cloud engine: failed final checkpoint must not invoke completion', async () => {
  const fake = new FakePorts([[turn()]]);
  await fake.tick();
  fake.rejectSave = (state) => state.phase === 'done';
  const before = clone(fake.durable);
  await fake.tick();
  equal(fake.completions.length, 0);
  deepStrictEqual(fake.durable, before);
});

Deno.test('cloud engine: saved final state retries only fenced completion', async () => {
  const fake = new FakePorts([[turn([], 'Durable final')]]);
  await fake.tick();
  const originalComplete = fake.ports.complete;
  fake.ports.complete = (text, state) => {
    fake.leaseLost = true;
    return originalComplete(text, state);
  };
  await fake.tick();
  equal(fake.durable.phase, 'done');
  equal(fake.completions[0].accepted, false);
  fake.leaseLost = false;
  fake.ports.complete = originalComplete;
  await fake.tick();
  equal(fake.status, 'completed');
  equal(fake.starts.length, 1);
  equal(fake.polls.length, 1);
  equal(fake.completions.filter((entry) => entry.accepted).length, 1);
});

Deno.test('cloud engine: ambiguous non-replay-safe side effect pauses without executing', async () => {
  const fake = new FakePorts();
  const call = tool('send', 'send_message');
  fake.tools([call]);
  fake.durable.receipts[receiptKey(fake.durable, call)] = { state: 'started' };
  fake.policy = () => ({ allowed: true, needsApproval: false, replaySafe: false });
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  ok(fake.reason?.includes('outcome unknown'));
  equal(fake.executions.length, 0);
});

Deno.test('cloud engine: lost receipt save after a side effect pauses the next worker', async () => {
  const fake = new FakePorts();
  const call = tool('send', 'send_message');
  fake.tools([call]);
  fake.policy = () => ({ allowed: true, needsApproval: false, replaySafe: false });
  const key = receiptKey(fake.durable, call);
  fake.rejectSave = (state) => state.receipts[key]?.state === 'done';
  await fake.tick();
  equal(fake.executions.length, 1);
  equal(fake.durable.receipts[key].state, 'started');
  fake.rejectSave = () => false;
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(fake.executions.length, 1, 'unknown outcome must not repeat the side effect');
});

Deno.test('cloud engine: thrown side effect retains intent and pauses recovery', async () => {
  const fake = new FakePorts();
  fake.tools();
  fake.policy = () => ({ allowed: true, needsApproval: false, replaySafe: false });
  fake.output = () => Promise.reject(new Error('Synthetic connection lost after submission'));
  await rejects(() => fake.tick(), /Synthetic connection lost/);
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(fake.executions.length, 1);
});

Deno.test('cloud engine: replay-safe receipt recovery reuses the same idempotency key', async () => {
  const fake = new FakePorts();
  const call = tool();
  fake.tools([call]);
  const key = receiptKey(fake.durable, call);
  fake.durable.receipts[key] = { state: 'started' };
  await fake.tick();
  deepStrictEqual(fake.executions.map((entry) => entry.key), [key]);
  equal(fake.durable.receipts[key].state, 'done');
  await fake.tick();
  equal(fake.executions.length, 1);
});

Deno.test('cloud engine: Ask approval pause survives restart and proceeds only after approval', async () => {
  const fake = new FakePorts();
  fake.tools([tool('send', 'send_message')]);
  fake.policy = () => ({ allowed: true, needsApproval: true, replaySafe: false });
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  ok(fake.reason?.includes('Approval required'));
  equal(fake.executions.length, 0);
  deepStrictEqual(fake.durable.receipts, {});
  await fake.tick();
  equal(fake.executions.length, 0);
  fake.approved = () => true;
  await fake.tick();
  equal(fake.status, 'queued');
  equal(fake.executions.length, 1);
});

Deno.test('cloud engine: Auto authorization comes from policy, not an approval bypass', async () => {
  const fake = new FakePorts();
  const allowed = tool('allowed');
  const denied = tool('denied');
  fake.tools([allowed, denied]);
  fake.policy = (call) => ({ allowed: call.id === allowed.id, needsApproval: false, replaySafe: true });
  fake.approved = () => true; // Approval must not override allowed:false.
  await fake.tick();
  await fake.tick();
  await fake.tick();
  deepStrictEqual(fake.executions.map((entry) => entry.call.id), ['allowed']);
  const deniedOutput = fake.durable.receipts[receiptKey(fake.durable, denied)].output!;
  deepStrictEqual(JSON.parse(deniedOutput), { error: 'Tool not authorized' });
  equal(fake.durable.phase, 'model');
  equal(fake.durable.transcript.filter((entry) => (entry as { role?: string }).role === 'tool').length, 2);
});

Deno.test('cloud engine: an explicit policy approval gate is honored even for Auto', async () => {
  const fake = new FakePorts();
  fake.tools();
  fake.policy = () => ({ allowed: true, needsApproval: true, replaySafe: true });
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(fake.executions.length, 0);
});

Deno.test('cloud engine: repeated provider polls retain response ID and do not resubmit or consume turns', async () => {
  const fake = new FakePorts([[...Array<Poll>(12).fill(null), turn([], 'Eventually ready', 7)]]);
  await fake.tick();
  const responseId = fake.durable.responseId;
  for (let i = 0; i < 12; i++) {
    await fake.tick();
    equal(fake.status, 'queued');
    equal(fake.durable.responseId, responseId);
    equal(fake.durable.turns, 0);
    equal(fake.durable.tokens, 0);
  }
  await fake.tick();
  equal(fake.status, 'completed');
  equal(fake.starts.length, 1);
  equal(fake.polls.length, 13);
  ok(fake.polls.every((id) => id === responseId));
  equal(fake.durable.turns, 1);
});

Deno.test('cloud engine: an accepted model request with an unsaved ID pauses without another paid submission', async () => {
  const fake = new FakePorts([[turn()]]);
  fake.rejectSave = (state) => !!state.responseId;
  await fake.tick();
  ok(fake.durable.modelIntent);
  equal(fake.durable.responseId, undefined);
  fake.rejectSave = () => false;
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  ok(fake.reason?.includes('submission outcome unknown'));
  equal(fake.starts.length, 1);
  equal(fake.polls.length, 0);
});

Deno.test('cloud engine: a thrown model submission keeps durable intent for ambiguity recovery', async () => {
  const fake = new FakePorts();
  fake.onStart = () => { throw new Error('Synthetic submission disconnect'); };
  await rejects(() => fake.tick(), /Synthetic submission disconnect/);
  ok(fake.durable.modelIntent);
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(fake.starts.length, 1);
});

for (const phase of ['model', 'tools'] as const) {
  for (const budget of ['time', 'tokens'] as const) {
    Deno.test(`cloud engine: exhausted ${budget} budget blocks ${phase} work`, async () => {
      const fake = new FakePorts();
      if (phase === 'tools') fake.tools();
      if (budget === 'time') fake.clock = fake.durable.deadline;
      else fake.durable.tokens = CLOUD_LIMITS.tokens;
      await fake.tick();
      equal(fake.status, 'failed');
      equal(fake.starts.length + fake.polls.length + fake.executions.length + fake.completions.length, 0);
    });
  }
}

Deno.test('cloud engine: turn limit blocks the next model submission', async () => {
  const fake = new FakePorts();
  fake.durable.turns = CLOUD_LIMITS.turns;
  await fake.tick();
  equal(fake.status, 'failed');
  ok(fake.reason?.includes('step limit'));
  equal(fake.starts.length, 0);
});

Deno.test('cloud engine: output allowance is clamped to remaining token budget', async () => {
  for (const remaining of [123, CLOUD_LIMITS.tokens]) {
    const fake = new FakePorts([[turn()]]);
    fake.durable.tokens = CLOUD_LIMITS.tokens - remaining;
    await fake.tick();
    equal(fake.starts[0].maxTokens, Math.min(remaining, CLOUD_LIMITS.outputPerTurn));
  }
});

for (const tokens of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
  Deno.test(`cloud engine: invalid provider usage ${tokens} cannot be checkpointed or completed`, async () => {
    const fake = new FakePorts([[turn([], 'Invalid usage', tokens)]]);
    await fake.tick();
    const before = clone(fake.durable);
    await rejects(() => fake.tick(), /Invalid model usage/);
    deepStrictEqual(fake.durable, before);
    equal(fake.completions.length, 0);
  });
}

Deno.test('cloud engine: duplicate call IDs in one provider turn cannot execute', async () => {
  const fake = new FakePorts([[turn([tool('same'), tool('same', 'another_tool')])]]);
  await fake.tick();
  const before = clone(fake.durable);
  await rejects(() => fake.tick(), /Duplicate tool call IDs/);
  deepStrictEqual(fake.durable, before);
  equal(fake.executions.length, 0);
});

// These assertions intentionally specify the bounded-execution contract rather
// than accepting a successful final answer that bypasses the budget checks.
Deno.test('cloud engine: final provider result cannot complete over the total token limit', async () => {
  const fake = new FakePorts([[turn([], 'Over-budget final', 11)]]);
  fake.durable.tokens = CLOUD_LIMITS.tokens - 10;
  await fake.tick();
  await fake.tick();
  equal(fake.completions.length, 0, 'an over-budget final must not be committed as success');
  equal(fake.status, 'failed');
});

Deno.test('cloud engine: deadline crossed during provider polling cannot complete successfully', async () => {
  const fake = new FakePorts([[turn([], 'Too late')]]);
  await fake.tick();
  fake.onPoll = () => { fake.clock = fake.durable.deadline + 1; };
  await fake.tick();
  equal(fake.completions.length, 0, 'the deadline must be rechecked after the provider await');
  equal(fake.status, 'failed');
});
