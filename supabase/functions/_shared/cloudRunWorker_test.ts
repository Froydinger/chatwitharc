import { deepStrictEqual, equal, notEqual, ok, rejects } from 'node:assert/strict';
import { CLOUD_LIMITS, type EngineState, initialEngineState, type ModelTurn, type ToolCall } from './cloudRunEngine.ts';
import {
  type ClaimedCloudRun,
  cloudCallHash,
  type CloudWorkerStore,
  type CloudWorkerContext,
  processCloudRun,
  type RegisteredCloudTool,
} from './cloudRunWorker.ts';

// Pure worker tests. All storage and provider ports are in memory. Run without
// --allow-net/--allow-env; no browser, database, credential, or SDK is required.
// Store fakes enforce the declared fence contract; they do not prove real RLS,
// SQL atomicity, scheduler behavior, or concurrent database transactions.
const NOW = Date.parse('2026-09-12T12:00:00Z');
const copy = <T>(value: T): T => structuredClone(value);
const action = (): ToolCall => ({
  id: 'call-send', name: 'send_message', arguments: '{"to":"fixture","text":"hello"}',
});
const finalTurn = (text = 'Finished.'): ModelTurn => ({ calls: [], text, tokens: 10 });
type Checkpoint = ClaimedCloudRun['checkpoint'];
type ToolContext = { run: ClaimedCloudRun; call: ToolCall };
type ToolExecution = ToolContext & { key: string };

class WorkerFixture {
  run: ClaimedCloudRun = {
    id: 'fixture-run', user_id: 'fixture-owner', session_id: 'fixture-session',
    mode: 'ask', lease_token: '', created_at: new Date(NOW - 1000).toISOString(),
    request: { messages: [{ role: 'user', content: 'Synthetic task' }] },
    checkpoint: { unrelatedState: { preserved: true } },
  };
  clock = NOW;
  status = 'queued';
  reason?: string;
  claimAllowed = true;
  writesAllowed = true;
  completeAllowed = true;
  currentLease = '';
  claims: string[] = [];
  writes: { run: ClaimedCloudRun; checkpoint: Checkpoint; status: string; accepted: boolean }[] = [];
  completions: { run: ClaimedCloudRun; result: unknown; message: unknown; accepted: boolean }[] = [];
  authorizations: ToolContext[] = [];
  executions: ToolExecution[] = [];
  starts: { transcript: unknown[]; key: string; maxTokens: number }[] = [];
  polls: string[] = [];
  cancellations: string[] = [];
  modelTurns: ModelTurn[] = [];
  tools: Record<string, RegisteredCloudTool> = {};
  decisions: boolean[] = [];
  entitled = true;
  output: (execution: ToolExecution) => Promise<string> = () => Promise.resolve('Synthetic receipt');
  events: string[] = [];
  store: CloudWorkerStore;
  provider: CloudWorkerContext['provider'];

  constructor() {
    this.store = {
      claim: (id) => {
        this.claims.push(id);
        if (!this.claimAllowed || id !== this.run.id || this.status !== 'queued') return Promise.resolve(null);
        this.currentLease = `synthetic-lease-${this.claims.length}`;
        this.run.lease_token = this.currentLease;
        this.status = 'running';
        this.events.push('claim');
        return Promise.resolve(copy(this.run));
      },
      checkpoint: (run, checkpoint, status, reason) => {
        const accepted = this.writesAllowed && run.lease_token === this.currentLease;
        this.writes.push({ run: copy(run), checkpoint: copy(checkpoint), status, accepted });
        this.events.push(`save:${status}:${accepted}`);
        if (accepted) {
          this.run.checkpoint = copy(checkpoint);
          this.status = status;
          this.reason = reason;
        }
        return Promise.resolve(accepted);
      },
      complete: (run, result, message) => {
        const accepted = this.writesAllowed && this.completeAllowed &&
          run.lease_token === this.currentLease && this.status !== 'completed';
        this.completions.push({ run: copy(run), result: copy(result), message: copy(message), accepted });
        if (accepted) this.status = 'completed';
        return Promise.resolve(accepted);
      },
    };
    this.provider = {
      startModel: (transcript, key, maxTokens) => {
        this.starts.push({ transcript: copy(transcript), key, maxTokens });
        return Promise.resolve(`synthetic-response-${this.starts.length}`);
      },
      pollModel: (id) => {
        this.polls.push(id);
        const turn = this.modelTurns.shift();
        if (!turn) throw new Error('Unexpected synthetic provider poll');
        return Promise.resolve(copy(turn));
      },
      cancelModel: (id) => {
        this.cancellations.push(id);
        return Promise.resolve();
      },
    };
  }

  get engine(): EngineState { return this.run.checkpoint.engine!; }
  key(call: ToolCall): string { return `${this.run.id}:turn:${this.engine.turns}:tool:${call.id}`; }
  tick(): Promise<boolean> {
    return processCloudRun(this.run.id, { store: this.store, provider: this.provider, tools: this.tools, now: () => this.clock });
  }
  seedTools(calls: ToolCall[] = [action()]): void {
    this.run.checkpoint.engine = {
      ...initialEngineState(this.run.request.messages, Date.parse(this.run.created_at)),
      phase: 'tools', turns: 1, calls: copy(calls),
    };
  }
  register(name = 'send_message', approval: RegisteredCloudTool['approval'] = 'ask-mode', replaySafe = false): void {
    this.tools[name] = {
      approval, replaySafe,
      authorize: (run, call) => {
        this.authorizations.push({ run: copy(run), call: copy(call) });
        this.events.push('authorize');
        return Promise.resolve(this.decisions.length ? this.decisions.shift()! : this.entitled);
      },
      execute: (run, call, key) => {
        const execution = { run: copy(run), call: copy(call), key };
        this.executions.push(execution);
        this.events.push('execute');
        return this.output(execution);
      },
    };
  }
  async decision(call: ToolCall, decision = 'approve'): Promise<void> {
    const argumentsHash = await cloudCallHash(call);
    this.run.checkpoint.pendingApproval = { callId: call.id, argumentsHash, name: call.name, arguments: call.arguments };
    this.run.checkpoint.inputResponse = { callId: call.id, argumentsHash, decision };
    this.status = 'queued'; // The endpoint/DB resume step is outside this test.
  }
}

Deno.test('cloud worker: hash binds exact tool name and raw arguments, separately from call ID', async () => {
  const call = action();
  const hash = await cloudCallHash(call);
  equal(hash, '09233eda4403cb5365943bb6df804fb7a229e818ce705c531abaeeabef095a0d');
  equal(await cloudCallHash({ ...call, id: 'another-call-id' }), hash);
  notEqual(await cloudCallHash({ ...call, name: 'another_tool' }), hash);
  notEqual(await cloudCallHash({ ...call, arguments: '{"to":"other","text":"hello"}' }), hash);
  notEqual(await cloudCallHash({ ...call, arguments: '{ "to": "fixture", "text": "hello" }' }), hash);
});

Deno.test('cloud worker: prepares fresh owner context only after a successful claim', async () => {
  const fixture = new WorkerFixture();
  let prepared = 0;
  await processCloudRun(fixture.run.id, {
    store: fixture.store, now: () => NOW,
    prepare: async run => {
      prepared++;
      equal(fixture.status, 'running');
      equal(run.user_id, fixture.run.user_id);
      equal(run.lease_token, fixture.currentLease);
      return { provider: fixture.provider, tools: fixture.tools };
    },
  });
  equal(prepared, 1);
  equal(fixture.starts.length, 1);
  fixture.claimAllowed = false;
  await processCloudRun(fixture.run.id, {
    store: fixture.store,
    prepare: () => { throw new Error('must not resolve credentials for an unclaimed run'); },
  });
});

Deno.test('cloud worker: failed owner context preparation never submits to the provider', async () => {
  const fixture = new WorkerFixture();
  await rejects(() => processCloudRun(fixture.run.id, {
    store: fixture.store,
    prepare: () => Promise.reject(new Error('owner no longer authorized')),
  }), /owner no longer authorized/);
  equal(fixture.starts.length, 0);
  equal(fixture.executions.length, 0);
});

Deno.test('cloud worker: unclaimed run invokes neither provider nor tools nor persistence', async () => {
  const fake = new WorkerFixture();
  fake.claimAllowed = false;
  fake.register();
  fake.seedTools();
  equal(await fake.tick(), false);
  equal(fake.starts.length + fake.polls.length + fake.authorizations.length + fake.executions.length + fake.writes.length, 0);
});

Deno.test('cloud worker: Ask pause records exact action and clears untrusted prior response', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  fake.run.checkpoint.inputResponse = { decision: 'approve', callId: 'wrong', argumentsHash: 'wrong' };
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  deepStrictEqual(fake.run.checkpoint.pendingApproval, {
    callId: action().id, name: action().name, arguments: action().arguments, argumentsHash: await cloudCallHash(action()),
  });
  equal(fake.run.checkpoint.inputResponse, null);
  deepStrictEqual(fake.run.checkpoint.unrelatedState, { preserved: true });
  equal(fake.executions.length, 0);
});

Deno.test('cloud worker: exact approved action executes once, then consumes approval with its receipt', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action());
  await fake.tick();
  equal(fake.executions.length, 1);
  equal(fake.authorizations.length, 2, 'authorization is checked before policy and immediately before execution');
  deepStrictEqual(fake.events, ['claim', 'authorize', 'save:running:true', 'authorize', 'execute', 'save:queued:true']);
  const intent = fake.writes[0].checkpoint;
  ok(intent.pendingApproval, 'approval must survive the saved started intent');
  ok(intent.inputResponse);
  equal(fake.engine.receipts[fake.key(action())].state, 'done');
  equal(fake.run.checkpoint.pendingApproval, null);
  equal(fake.run.checkpoint.inputResponse, null);
  await fake.tick();
  equal(fake.executions.length, 1, 'a later worker uses the saved receipt');
  equal(fake.engine.phase, 'model');
});

const staleCases: { name: string; change: (fake: WorkerFixture) => void }[] = [
  { name: 'changed arguments', change: (fake) => { fake.engine.calls[0].arguments = '{"to":"other","text":"hello"}'; } },
  { name: 'reformatted arguments', change: (fake) => { fake.engine.calls[0].arguments = '{ "to":"fixture", "text":"hello" }'; } },
  { name: 'different tool name', change: (fake) => { fake.register('other_tool'); fake.engine.calls[0].name = 'other_tool'; } },
  { name: 'different call ID', change: (fake) => { fake.engine.calls[0].id = 'another-call'; } },
  { name: 'wrong pending hash', change: (fake) => { (fake.run.checkpoint.pendingApproval as Record<string, unknown>).argumentsHash = 'wrong'; } },
  { name: 'wrong response hash', change: (fake) => { (fake.run.checkpoint.inputResponse as Record<string, unknown>).argumentsHash = 'wrong'; } },
  { name: 'wrong pending call ID', change: (fake) => { (fake.run.checkpoint.pendingApproval as Record<string, unknown>).callId = 'wrong'; } },
  { name: 'wrong response call ID', change: (fake) => { (fake.run.checkpoint.inputResponse as Record<string, unknown>).callId = 'wrong'; } },
  { name: 'missing pending action', change: (fake) => { fake.run.checkpoint.pendingApproval = null; } },
  { name: 'missing response', change: (fake) => { fake.run.checkpoint.inputResponse = null; } },
  { name: 'nonexact decision', change: (fake) => { (fake.run.checkpoint.inputResponse as Record<string, unknown>).decision = 'APPROVE'; } },
];
for (const scenario of staleCases) {
  Deno.test(`cloud worker: ${scenario.name} cannot authorize an action`, async () => {
    const fake = new WorkerFixture();
    fake.register();
    fake.seedTools();
    await fake.decision(action());
    scenario.change(fake);
    await fake.tick();
    equal(fake.executions.length, 0);
    equal(fake.status, 'awaiting_input');
    const current = fake.engine.calls[0];
    deepStrictEqual(fake.run.checkpoint.pendingApproval, {
      callId: current.id, name: current.name, arguments: current.arguments, argumentsHash: await cloudCallHash(current),
    });
    equal(fake.run.checkpoint.inputResponse, null);
  });
}

Deno.test('cloud worker: exact denial becomes a durable receipt and is not proposed again', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action(), 'deny');
  await fake.tick();
  equal(fake.status, 'queued');
  equal(fake.executions.length, 0);
  const receipt = fake.engine.receipts[fake.key(action())];
  equal(receipt.state, 'done');
  deepStrictEqual(JSON.parse(receipt.output!), { error: 'User declined this action. Do not repeat it.' });
  equal(fake.run.checkpoint.pendingApproval, null);
  equal(fake.run.checkpoint.inputResponse, null);
  equal(fake.engine.phase, 'model');
  deepStrictEqual(fake.engine.transcript.at(-1), { role: 'tool', tool_call_id: action().id, content: receipt.output });
});

Deno.test('cloud worker: stale denial cannot suppress a changed action', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action(), 'deny');
  fake.engine.calls[0].arguments = '{"to":"new-recipient","text":"hello"}';
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  deepStrictEqual(fake.engine.receipts, {});
  equal(fake.executions.length, 0);
});

Deno.test('cloud worker: approval for one call never approves a second action', async () => {
  const fake = new WorkerFixture();
  fake.register();
  const next = { ...action(), id: 'second-call', arguments: '{"to":"second","text":"hello"}' };
  fake.seedTools([action(), next]);
  await fake.decision(action());
  await fake.tick();
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  deepStrictEqual(fake.executions.map((entry) => entry.call.id), [action().id]);
  equal((fake.run.checkpoint.pendingApproval as { callId: string }).callId, next.id);
});

Deno.test('cloud worker: Auto permits ask-mode tools only while currently authorized', async () => {
  for (const entitled of [true, false]) {
    const fake = new WorkerFixture();
    fake.run.mode = 'auto';
    fake.entitled = entitled;
    fake.register();
    fake.seedTools();
    await fake.tick();
    equal(fake.status, 'queued');
    equal(fake.executions.length, entitled ? 1 : 0);
    if (!entitled) deepStrictEqual(JSON.parse(fake.engine.receipts[fake.key(action())].output!), { error: 'Tool not authorized' });
  }
});

Deno.test('cloud worker: always-approval registration still pauses Auto', async () => {
  const fake = new WorkerFixture();
  fake.run.mode = 'auto';
  fake.register('send_message', 'always');
  fake.seedTools();
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  equal(fake.executions.length, 0);
});

for (const name of ['unregistered_tool', 'constructor', 'toString', '__proto__']) {
  Deno.test(`cloud worker: unregistered ${name} gets a denial receipt without executing`, async () => {
    const fake = new WorkerFixture();
    fake.run.mode = 'auto';
    const call = { ...action(), name };
    fake.seedTools([call]);
    await fake.tick();
    equal(fake.status, 'queued');
    equal(fake.authorizations.length + fake.executions.length, 0);
    deepStrictEqual(JSON.parse(fake.engine.receipts[fake.key(call)].output!), { error: 'Tool not authorized' });
  });
}

Deno.test('cloud worker: revocation after approval is rechecked on resume', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  await fake.decision(action());
  fake.entitled = false;
  await fake.tick();
  equal(fake.executions.length, 0);
  equal(fake.run.checkpoint.inputResponse, null);
  deepStrictEqual(JSON.parse(fake.engine.receipts[fake.key(action())].output!), { error: 'Tool not authorized' });
});

Deno.test('cloud worker: revocation between checkpoint and execution prevents the side effect', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action());
  fake.decisions = [true, false];
  await rejects(() => fake.tick(), /Tool authorization changed/);
  equal(fake.authorizations.length, 2);
  equal(fake.executions.length, 0);
  equal(fake.engine.receipts[fake.key(action())].state, 'started');
  ok(fake.run.checkpoint.pendingApproval, 'the rejected execute must not consume its approval');
});

Deno.test('cloud worker: interrupted approved side effect preserves approval but never blindly repeats', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action());
  fake.output = () => Promise.reject(new Error('Synthetic unknown delivery outcome'));
  await rejects(() => fake.tick(), /Synthetic unknown delivery outcome/);
  equal(fake.engine.receipts[fake.key(action())].state, 'started');
  ok(fake.run.checkpoint.pendingApproval);
  ok(fake.run.checkpoint.inputResponse);
  fake.status = 'queued'; // Simulate expiry/reclaim of the interrupted lease.
  await fake.tick();
  equal(fake.status, 'awaiting_input');
  ok(fake.reason?.includes('outcome unknown'));
  equal(fake.executions.length, 1);
});

Deno.test('cloud worker: rejected checkpoint prevents execution and does not consume approval', async () => {
  const fake = new WorkerFixture();
  fake.register();
  fake.seedTools();
  await fake.decision(action());
  const before = copy(fake.run.checkpoint);
  fake.writesAllowed = false;
  await fake.tick();
  equal(fake.executions.length, 0);
  equal(fake.writes[0].accepted, false);
  deepStrictEqual(fake.run.checkpoint, before);
});

Deno.test('cloud worker: unknown browser state is unnecessary for start, polling and stable completion', async () => {
  const fake = new WorkerFixture();
  fake.modelTurns = [finalTurn('Durable answer')];
  await fake.tick();
  equal(fake.engine.deadline, Date.parse(fake.run.created_at) + CLOUD_LIMITS.durationMs);
  equal(fake.engine.responseId, 'synthetic-response-1');
  await fake.tick();
  equal(fake.status, 'completed');
  equal(fake.starts.length, 1);
  equal(fake.polls.length, 1);
  const completed = fake.completions[0];
  equal(completed.run.user_id, 'fixture-owner');
  equal(completed.run.session_id, 'fixture-session');
  equal(completed.run.lease_token, 'synthetic-lease-2');
  deepStrictEqual(completed.result, {
    choices: [{ message: { role: 'assistant', content: 'Durable answer' } }],
    model_used: 'gpt-5.6-luna', cloud_run_id: fake.run.id,
  });
  deepStrictEqual(completed.message, {
    id: `cloud-${fake.run.id}`, role: 'assistant', content: 'Durable answer', timestamp: fake.run.created_at,
    type: 'text', sourceModel: 'cloud-chat', modelUsed: 'gpt-5.6-luna',
    metadata: { cloudRunId: fake.run.id, modelTurns: 1 },
  });
  deepStrictEqual(fake.run.checkpoint.unrelatedState, { preserved: true });
});

Deno.test('cloud worker: completion retry changes only lease, never owner, session or assistant identity', async () => {
  const fake = new WorkerFixture();
  fake.run.checkpoint.engine = {
    ...initialEngineState(fake.run.request.messages, NOW), phase: 'done', finalText: 'Previously saved final', turns: 2,
  };
  fake.completeAllowed = false;
  await fake.tick();
  equal(fake.completions[0].accepted, false);
  fake.status = 'queued'; // Simulate lease expiry before a fresh worker retries.
  fake.completeAllowed = true;
  await fake.tick();
  equal(fake.completions[1].accepted, true);
  deepStrictEqual(fake.completions[0].message, fake.completions[1].message);
  deepStrictEqual(fake.completions[0].result, fake.completions[1].result);
  notEqual(fake.completions[0].run.lease_token, fake.completions[1].run.lease_token);
  for (const completion of fake.completions) {
    equal(completion.run.user_id, 'fixture-owner');
    equal(completion.run.session_id, 'fixture-session');
  }
  equal(fake.starts.length + fake.polls.length + fake.executions.length, 0);
});

Deno.test('cloud worker: two owners complete independently without shared browser or auth state', async () => {
  const first = new WorkerFixture();
  const second = new WorkerFixture();
  second.run.id = 'second-run';
  second.run.user_id = 'second-owner';
  second.run.session_id = 'second-session';
  for (const fake of [first, second]) {
    fake.run.checkpoint.engine = {
      ...initialEngineState([], NOW), phase: 'done', finalText: `Answer for ${fake.run.id}`,
    };
  }
  await Promise.all([first.tick(), second.tick()]);
  for (const fake of [first, second]) {
    const result = fake.completions[0];
    equal(result.run.user_id, fake.run.user_id);
    equal(result.run.session_id, fake.run.session_id);
    equal((result.message as { id: string }).id, `cloud-${fake.run.id}`);
  }
});

Deno.test('cloud worker: model arguments cannot replace the claimed owner or session', async () => {
  const fake = new WorkerFixture();
  const call = { ...action(), arguments: '{"user_id":"spoof-owner","session_id":"spoof-session"}' };
  fake.register('send_message', 'never');
  fake.seedTools([call]);
  await fake.tick();
  equal(fake.executions.length, 1);
  for (const context of [...fake.authorizations, ...fake.executions]) {
    equal(context.run.user_id, 'fixture-owner');
    equal(context.run.session_id, 'fixture-session');
    equal(context.call.arguments, call.arguments);
  }
  for (const write of fake.writes) {
    equal(write.run.user_id, 'fixture-owner');
    equal(write.run.session_id, 'fixture-session');
  }
});
