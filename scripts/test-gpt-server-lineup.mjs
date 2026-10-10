// Offline execution of the actual handlers, authorization, routing, usage ledger
// adapter, accounting, completion helpers and provider wire adapters. Only the database, provider
// transports and unrelated chat integrations are fixtures. No external I/O.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const LUNA = 'gpt-6-luna', SOL = 'gpt-6.1-sol', ASTRA = 'gpt-6-astra';
const owner = { id: 'verified-owner' };
const tests = [];
const test = (name, run) => tests.push({ name, run });
const compiled = new Map();
function compile(file) {
  file = resolve(file);
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(
    readFileSync(file, 'utf8').replaceAll('import.meta.main', 'false'), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
  return compiled.get(file);
}
const realHelpers = new Set(['arcModelRouting.ts', 'arcModelAccess.ts', 'arcModelUsage.ts',
  'arcTextCompletion.ts', 'arcUsageLedger.ts', 'arcUsageAccounting.ts', 'arcModelCatalog.ts',
  'arcModelAccess_test.ts', 'cloudAgentsProvider.ts', 'cloudRunEngine.ts',
  'boundedResponsesProvider.ts', 'boundedResponseStream.ts', 'cloudRunProvider.ts', 'chatArtifactStream.ts', 'ordinaryChatResponse.ts']);

function loadEndpoint(endpoint, options = {}) {
  const { user = owner, admin = false, adminId = admin ? user?.id : null, boost = false,
    adminError = null, boostError = null, ledgerError = null, deniedModels = [],
    malformedReservation, replayed = false, providerStatus = 200, providerThrow = false,
    authError = user ? null : 'invalid', throwAdmin = false, throwBoost = false, reservationNanos,
    enforcementEnabled = true, configured = true, inputTokens = 12,
    preflightStatus = 200, responsePollThrow = false, recordError = null,
  } = options;
  let handler;
  const calls = [], providerCalls = [], logs = [], modules = new Map();
  const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 };
  const db = {
    auth: { getUser: async token => {
      calls.push(['getUser', token]); return { data: { user }, error: authError };
    } },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'user_has_boost') {
        assert.deepEqual(args, { check_user_id: user.id });
        if (throwBoost) throw Error('Boost lookup interrupted');
        return { data: boost, error: boostError };
      }
      if (name === 'reserve_arc_usage') {
        assert.equal(args.target_user_id, user.id);
        if (ledgerError) return { data: null, error: ledgerError };
        if (malformedReservation !== undefined) return { data: malformedReservation, error: null };
        const allowed = !deniedModels.includes(args.model_name);
        return { data: { allowed, enforcementEnabled, configured,
          tier: admin ? 'admin' : boost === true ? 'boost' : 'free',
          pool: args.pool_name, adminUncapped: admin, replayed,
          reservationId: allowed ? `reservation:${args.model_name}` : null,
          reservedNanos: allowed ? reservationNanos ?? args.requested_nanos : 0, cumulativeCostNanos: 0,
        }, error: null };
      }
      if (name === 'record_arc_usage') {
        assert.equal(args.target_user_id, user.id);
        if (recordError) return { data: null, error: recordError };
        return { data: { revision: 1, cumulativeCostNanos: args.cumulative_nanos,
          replayed: false, enforcementEnabled: true }, error: null };
      }
      throw Error(`Unexpected database RPC: ${name}`);
    },
    from(table) {
      calls.push(['from', table]);
      assert.ok(['admin_users', 'admin_settings', 'memory_summaries', 'generated_files'].includes(table),
        `Unexpected database table: ${table}`);
      const filters = [];
      const result = async () => {
        if (table === 'admin_users') {
          assert.deepEqual(filters, [['user_id', user.id]]);
          if (throwAdmin) throw Error('admin lookup interrupted');
          return { data: adminId ? { user_id: adminId } : null, error: adminError };
        }
        return { data: table === 'admin_settings' ? [] : null, error: null };
      };
      const chain = {
        select(columns) { if (table === 'admin_users') assert.equal(columns, 'user_id'); return chain; },
        eq(column, value) { filters.push([column, value]); return chain; },
        in() { return chain; }, maybeSingle: result,
        insert(row) { calls.push(['insert', { table, row }]); return chain; },
        then(onFulfilled, onRejected) { return result().then(onFulfilled, onRejected); },
      };
      return chain;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'generated-files');
      return {
        async upload(path, bytes) {
          calls.push(['upload-fixture', { path, bytes: bytes.byteLength }]);
          return { data: { path }, error: null };
        },
        getPublicUrl(path) { return { data: { publicUrl: `https://fixture.example/files/${path}` } }; },
      };
    } },
  };
  const completion = { id: 'fixture-completion', choices: [{ message: { role: 'assistant', content: 'Fixture response.' },
    finish_reason: 'stop' }], usage };
  const recordProvider = (transport, payload) => {
    const call = { transport, payload }; providerCalls.push(call); calls.push(['provider', call]);
  };
  let agentSpendControl, responseMetadata;
  let responsePolls = 0;
  const fetchMock = async (url, init = {}) => {
    const responseRoot = 'https://api.openai.com/v1/responses';
    if (String(url).startsWith(responseRoot)) {
      const path = String(url).slice(responseRoot.length);
      const payload = init.body ? JSON.parse(init.body) : undefined;
      calls.push(['responses-http', { path, method: init.method ?? 'GET', payload }]);
      if (path === '/input_tokens' && init.method === 'POST') {
        return Response.json(preflightStatus === 200 ? { input_tokens: inputTokens }
          : { error: { code: 'fixture_count_rejection' } }, { status: preflightStatus });
      }
      if (path === '' && init.method === 'POST') {
        recordProvider('responses', payload);
        responseMetadata = payload.metadata;
        if (providerThrow) throw Error('Provider transport interrupted');
        return Response.json(providerStatus === 200 ? { id: 'resp_fixture', status: 'queued', metadata: responseMetadata }
          : { error: { code: 'fixture_rejection' } }, { status: providerStatus });
      }
      if (path === '/resp_fixture' && (init.method ?? 'GET') === 'GET') {
        if (responsePollThrow && responsePolls++ === 0) throw Error('Provider poll interrupted');
        if (responsePollThrow) return Response.json({ id: 'resp_fixture', status: 'in_progress', metadata: responseMetadata });
        return Response.json({ id: 'resp_fixture', status: 'completed', usage, metadata: responseMetadata,
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixture response.' }] }] });
      }
      if (path === '/resp_fixture/cancel' && init.method === 'POST') {
        return Response.json({ id: 'resp_fixture', status: 'cancelled', usage, metadata: responseMetadata });
      }
      throw Error(`Unexpected Responses fixture request: ${init.method} ${path}`);
    }
    const agentRoot = 'https://api.openai.com/v1/agents';
    if (String(url).startsWith(agentRoot)) {
      const path = String(url).slice(agentRoot.length);
      calls.push(['agents-http', { path, method: init.method ?? 'GET' }]);
      if (path === '/sessions' && init.method === 'POST') {
        const payload = JSON.parse(init.body);
        recordProvider('agents', payload);
        agentSpendControl = payload.spend_control;
        if (providerThrow) throw Error('Provider transport interrupted');
        return Response.json(providerStatus === 200 ? { id: 'sess_fixture' }
          : { error: { code: 'fixture_rejection' } }, { status: providerStatus });
      }
      if (path === '/sessions/sess_fixture' && init.method === 'GET') {
        return Response.json({ id: 'sess_fixture', status: 'idle', usage, spend_control: agentSpendControl });
      }
      if (path === '/sessions/sess_fixture/turns?order=desc&limit=1') {
        return Response.json({ data: [{ id: 'turn_fixture', status: 'completed' }] });
      }
      if (path === '/sessions/sess_fixture/items?order=desc&limit=100') {
        return Response.json({ data: [{ type: 'assistant_message', turn_id: 'turn_fixture', phase: 'final_answer',
          content: [{ type: 'output_text', text: 'Fixture response.' }] }] });
      }
      if (path === '/sessions/sess_fixture/turns/turn_fixture') {
        return Response.json({ id: 'turn_fixture', status: 'completed', usage });
      }
      if (path === '/sessions/sess_fixture/events' && init.method === 'POST') return Response.json({});
      throw Error(`Unexpected Agents fixture request: ${init.method} ${path}`);
    }
    assert.equal(String(url), 'https://api.openai.com/v1/chat/completions', 'Never access a real network');
    const payload = JSON.parse(init.body);
    recordProvider('completion', payload);
    if (providerThrow) throw Error('Provider transport interrupted');
    if (payload.stream && providerStatus === 200) {
      const encoder = new TextEncoder();
      const events = [
        { id: completion.id, choices: [{ delta: { content: 'Fixture response.' }, finish_reason: null }] },
        { id: completion.id, choices: [{ delta: {}, finish_reason: 'stop' }], usage },
      ];
      return new Response(new ReadableStream({ start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify(providerStatus === 200 ? completion : { error: 'fixture rejection' }),
      { status: providerStatus, headers: { 'Content-Type': 'application/json' } });
  };
  const mocks = {
    serve: value => { handler = value; }, createClient: () => db,
    ordinaryChatIntake: options => options.handle(options.req),
    liveBrowserEnabled: () => false, createBrowserProvider: () => ({}),
    browserPreflightIntent: () => null, isMultiPageBuildRequest: () => false,
    streamAgentAnswer: async () => undefined,
  };
  const env = { SUPABASE_URL: 'https://fixture.example', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    OPENAI_API_KEY: 'fixture', CHAT_AGENT_ANSWER_STREAM_ENABLED: 'false' };
  function load(file) {
    file = resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const requireMock = name => {
      if (name.startsWith('node:')) return nodeRequire(name);
      if (realHelpers.has(basename(name))) return load(resolve(dirname(file), name));
      return new Proxy(mocks, { get: (target, key) => key === 'then' ? undefined
        : key in target ? target[key] : (() => undefined) });
    };
    new Function('exports', 'require', 'Deno', 'console', 'fetch', compile(file))(
      exports, requireMock, { env: { get: name => env[name] }, serve: mocks.serve, test },
      { log() {}, warn() {}, error(...args) { logs.push(args); } }, fetchMock);
    return exports;
  }
  if (endpoint) load(`supabase/functions/${endpoint}/index.ts`);
  return {
    load, calls, providerCalls, logs,
    invoke: (body, { authorization = 'Bearer fixture' } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (authorization) headers.Authorization = authorization;
      return handler(new Request(`https://fixture.example/${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      }));
    },
  };
}

// The same authorization cases also run natively through Deno when available.
loadEndpoint().load('supabase/functions/_shared/arcModelAccess_test.ts');
const bodies = {
  chat: { messages: [{ role: 'user', content: 'Hi' }], streamEvents: false, arcMode: 'chat' },
  'analyze-image': { messages: [{ role: 'user', content: 'Describe' }], image: 'data:image/png;base64,fixture', modelSelection: 'auto' },
  // Extracted documents contain text; native inline PDF/non-image data URLs get
  // their own truthful Luna fallback regression below.
  'analyze-document': { messages: [{ role: 'user', content: 'Summarize' }], fileBase64: 'Extracted document fixture.',
    fileName: 'fixture.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  'generate-file': { fileType: 'txt', prompt: 'Write a short report' },
};
const spoof = { isAdmin: true, hasBoost: true, userId: 'admin', user_id: 'admin',
  profile: { isAdmin: true, hasBoost: true }, user_metadata: { role: 'admin' },
  app_metadata: { role: 'admin' }, reasoningEffort: 'high' };
const ledgerCalls = f => f.calls.filter(([name]) => name === 'reserve_arc_usage' || name === 'record_arc_usage');
const reservations = f => f.calls.filter(([name]) => name === 'reserve_arc_usage').map(([, args]) => args);
async function responseJson(response) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  const events = (await response.text()).split('\n').filter(line => line.startsWith('data: '))
    .map(line => line.slice(6)).filter(text => text !== '[DONE]').map(text => JSON.parse(text));
  const failure = events.find(event => event.type === 'error');
  assert.equal(failure, undefined, `SSE failed: ${JSON.stringify(failure)}`);
  const done = events.findLast(event => event.type === 'done');
  assert.ok(done, `No done metadata in SSE: ${JSON.stringify(events)}`);
  return done.result ?? done;
}
function assertProvider(fixture, model, effort) {
  assert.equal(fixture.providerCalls.length, 1, JSON.stringify(fixture.logs));
  const { payload } = fixture.providerCalls[0];
  assert.equal(payload.agent?.model ?? payload.model, model);
  if (effort) assert.equal(payload.agent?.reasoning.effort ?? payload.reasoning?.effort ?? payload.reasoning_effort, effort);
}
const providerEffort = fixture => fixture.providerCalls[0].payload.agent?.reasoning.effort
  ?? fixture.providerCalls[0].payload.reasoning?.effort ?? fixture.providerCalls[0].payload.reasoning_effort;
function assertMeteredBeforeProvider(fixture, model) {
  const providerIndex = fixture.calls.findIndex(([name]) => name === 'provider');
  const reservationIndex = fixture.calls.findIndex(([name, args]) => name === 'reserve_arc_usage' && args.model_name === model);
  assert.ok(reservationIndex >= 0 && reservationIndex < providerIndex, `${model} must reserve before provider`);
}

for (const [endpoint, body] of Object.entries(bodies)) {
  test(`${endpoint}: Free Astra rejection and independent entitlement failures precede any provider`, async () => {
    // Raw model hints apply everywhere except the deliberately isolated legacy camera path.
    const hints = ['analyze-image', 'generate-file'].includes(endpoint) ? [{ modelSelection: ASTRA }]
      : [{ modelSelection: ASTRA }, { model: ASTRA }, { reasoningSelection: ASTRA }];
    for (const hint of hints) {
      for (const options of [{}, { adminError: 'unavailable' }, { boostError: 'unavailable' },
        { adminId: owner.id, adminError: 'unavailable' }, { boost: true, boostError: 'unavailable' },
        { adminId: 'another-owner' }]) {
        const f = loadEndpoint(endpoint, options);
        const response = await f.invoke({ ...body, ...spoof, ...hint });
        const expected = options.adminError || options.boostError ? 503 : 403;
        assert.equal(response.status, expected, `${endpoint}: ${JSON.stringify(options)}`);
        assert.match((await response.json()).error, expected === 503 ? /could not be verified/i : /requires ArcAI Boost/);
        assert.equal(f.providerCalls.length, 0); assert.equal(reservations(f).length, 0);
      }
    }
  });

  test(`${endpoint}: verified Boost and admin Astra reach the provider with bounded effort`, async () => {
    for (const options of [{ boost: true }, { admin: true }]) {
      const f = loadEndpoint(endpoint, options);
      const response = await f.invoke({ ...body, ...spoof, modelSelection: ASTRA });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data));
      assertProvider(f, ASTRA, 'low'); assertMeteredBeforeProvider(f, ASTRA);
      assert.equal(data.model_used, ASTRA); assert.equal(data.reasoning_effort_used, 'low');
      assert.equal(data.model_switch_notice, undefined);
    }
  });

  test(`${endpoint}: explicit Sol remains selectable for Free and Boost`, async () => {
    for (const boost of [false, true]) {
      const f = loadEndpoint(endpoint, { boost });
      const response = await f.invoke({ ...body, modelSelection: SOL, reasoningEffort: 'none' });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, SOL, 'low');
      assertMeteredBeforeProvider(f, SOL);
      assert.equal(data.model_used, SOL); assert.equal(data.reasoning_effort_used, 'low');
      assert.ok(ledgerCalls(f).some(([name]) => name === 'record_arc_usage'), 'provider usage must settle');
    }
  });

  test(`${endpoint}: exhausted premium allowance sends only Luna and actual fallback notice`, async () => {
    for (const modelSelection of [SOL, ASTRA]) {
      const f = loadEndpoint(endpoint, { boost: true, deniedModels: [modelSelection] });
      const response = await f.invoke({ ...body, modelSelection, reasoningEffort: 'high' });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA);
      assert.equal(data.model_used, LUNA);
      assert.equal(data.reasoning_effort_used, providerEffort(f));
      assert.match(data.model_switch_notice, /allowance.*used up.*GPT 6 Luna/i);
      assert.deepEqual(reservations(f).map(args => args.model_name), [modelSelection, LUNA]);
      assertMeteredBeforeProvider(f, LUNA);
    }
  });

  test(`${endpoint}: staged premium policy uses Luna while administrators stay metered`, async () => {
    for (const modelSelection of [SOL, ASTRA]) {
      for (const policy of [{ enforcementEnabled: false }, { configured: false }]) {
        const f = loadEndpoint(endpoint, { boost: true, ...policy });
        const response = await f.invoke({ ...body, modelSelection });
        const data = await responseJson(response);
        assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA);
        assert.equal(data.model_used, LUNA); assert.match(data.model_switch_notice, /being updated.*GPT 6 Luna/);
        const firstReceipt = f.calls.find(([name]) => name === 'record_arc_usage')[1];
        assert.equal(firstReceipt.cumulative_nanos, 0);
        assert.equal(firstReceipt.usage_detail.reason, 'premium-policy-not-active');
      }
      const admin = loadEndpoint(endpoint, { admin: true, enforcementEnabled: false });
      const response = await admin.invoke({ ...body, modelSelection });
      assert.equal(response.status, 200, JSON.stringify(await responseJson(response)));
      assertProvider(admin, modelSelection); assertMeteredBeforeProvider(admin, modelSelection);
    }
  });

  test(`${endpoint}: premium metering failure stops before provider; Luna remains available`, async () => {
    for (const modelSelection of [SOL, ASTRA]) {
      for (const options of [{ ledgerError: 'database unavailable' }, { malformedReservation: {} },
        { malformedReservation: { allowed: true, enforcementEnabled: true, reservedNanos: -1, reservationId: 'fake' } }]) {
        const f = loadEndpoint(endpoint, { boost: true, ...options });
        const response = await f.invoke({ ...body, modelSelection });
        assert.equal(response.status, 503, JSON.stringify(await response.clone().json()));
        assert.equal(f.providerCalls.length, 0);
        assert.match((await response.json()).error, /Premium usage could not be checked/i);
      }
    }
    const f = loadEndpoint(endpoint, { ledgerError: 'database unavailable' });
    const response = await f.invoke({ ...body, modelSelection: LUNA });
    const data = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA);
    assert.equal(data.model_used, LUNA);
  });

  test(`${endpoint}: anonymous cannot elevate to Astra with spoofed flags`, async () => {
    const f = loadEndpoint(endpoint, { user: { ...owner, is_anonymous: true }, admin: true, boost: true });
    const response = await f.invoke({ ...body, ...spoof, modelSelection: ASTRA });
    assert.equal(response.status, 403); assert.equal(f.providerCalls.length, 0);
    assert.equal(reservations(f).length, 0);
    assert.ok(!f.calls.some(([name, value]) => name === 'from' && value === 'admin_users'));
  });

  test(`${endpoint}: missing or invalid identity cannot issue a paid request`, async () => {
    for (const authorization of [null, 'Bearer invalid']) {
      const f = loadEndpoint(endpoint, { user: null });
      const response = await f.invoke({ ...body, ...spoof, modelSelection: ASTRA }, { authorization });
      assert.ok(response.status >= 400); assert.equal(f.providerCalls.length, 0);
      assert.equal(reservations(f).length, 0);
    }
  });

  test(`${endpoint}: replayed premium reservation cannot start another provider call`, async () => {
    const f = loadEndpoint(endpoint, { boost: true, replayed: true });
    const response = await f.invoke({ ...body, modelSelection: ASTRA });
    assert.equal(response.status, 409, JSON.stringify(await response.clone().json()));
    assert.equal(f.providerCalls.length, 0);
    assert.equal(f.calls.filter(([name]) => name === 'record_arc_usage').length, 0,
      'A replay cannot refund or settle the original live attempt');
  });

  test(`${endpoint}: interrupted entitlement lookups fail closed`, async () => {
    for (const options of [{ throwAdmin: true }, { throwBoost: true }]) {
      const f = loadEndpoint(endpoint, options);
      const response = await f.invoke({ ...body, ...spoof, modelSelection: ASTRA });
      assert.ok(response.status >= 500); assert.equal(f.providerCalls.length, 0);
      assert.equal(reservations(f).length, 0);
    }
  });

  test(`${endpoint}: actual complex effort ignores spoofed none/high`, async () => {
    const complex = { ...body, messages: [{ role: 'user', content: `Analyze this exhaustive multi-step problem. ${'x'.repeat(2100)}` }],
      prompt: `Write an exhaustive report. ${'x'.repeat(2100)}` };
    for (const [modelSelection, effort] of [[SOL, 'high'], [ASTRA, 'medium']]) {
      const f = loadEndpoint(endpoint, { boost: true });
      const response = await f.invoke({ ...complex, modelSelection, reasoningEffort: 'none' });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, modelSelection, effort);
      assert.equal(data.reasoning_effort_used, effort);
    }
  });
}

test('Untagged legacy camera requests ignore raw premium hints and preserve Luna/effort contract without ledger', async () => {
  const { modelSelection: _unused, ...legacy } = bodies['analyze-image'];
  for (const model of [undefined, SOL, ASTRA]) {
    for (const [requested, actual] of [['low', 'low'], ['medium', 'medium'], ['high', 'high'], [undefined, 'medium'], ['none', 'medium']]) {
      const f = loadEndpoint('analyze-image', { adminError: 'unused', boostError: 'unused', ledgerError: 'unused' });
      const response = await f.invoke({ ...legacy, ...spoof, model, reasoningSelection: ASTRA, reasoningEffort: requested });
      assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
      assertProvider(f, LUNA, actual); assert.equal(ledgerCalls(f).length, 0);
      assert.equal(f.providerCalls[0].transport, 'completion', 'The camera transport remains unchanged');
      assert.ok(!f.calls.some(([name, value]) => name === 'from' && value === 'admin_users'));
      assert.ok(!f.calls.some(([name]) => name === 'user_has_boost'));
    }
  }
});

test('Premium remote vision carries every image and a provider-enforced ceiling within its reservation', async () => {
  // URL length says nothing about remote image resolution, provider token count
  // or dollar cost. Verify exact-input counting and bounded Responses output.
  const images = Array.from({ length: 16 }, (_, i) => `https://img.example/${i}`);
  for (const entitlement of [
    { modelSelection: SOL, boost: false }, { modelSelection: SOL, boost: true },
    { modelSelection: ASTRA, boost: true }, { modelSelection: ASTRA, admin: true },
  ]) {
    for (const reservationNanos of [10_000_000, 19_999_999, 50_000_000]) {
      const f = loadEndpoint('analyze-image', { ...entitlement, reservationNanos });
      const response = await f.invoke({ ...bodies['analyze-image'], image: undefined, images,
        modelSelection: entitlement.modelSelection, reasoningEffort: 'high' });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data));
      assertProvider(f, entitlement.modelSelection, 'low');
      const [{ transport, payload }] = f.providerCalls;
      assert.equal(transport, 'responses', 'Premium vision must use bounded Responses');
      assert.ok(Number.isSafeInteger(payload.max_output_tokens) && payload.max_output_tokens >= 128);
      assert.ok(payload.max_output_tokens <= 16_384);
      assert.equal(payload.background, true);
      assert.deepEqual(payload.tools, []);
      assert.equal(payload.spend_control, undefined);
      const counts = f.calls.filter(([name, request]) => name === 'responses-http' && request.path === '/input_tokens');
      assert.equal(counts.length, 1);
      assert.deepEqual(counts[0][1].payload.input, payload.input);
      assert.equal(counts[0][1].payload.model, payload.model);
      assert.equal(counts[0][1].payload.instructions, payload.instructions);
      assert.deepEqual(counts[0][1].payload.tools, payload.tools);
      const { priceArcTokenUsage } = f.load('supabase/functions/_shared/arcUsageAccounting.ts');
      const ceiling = priceArcTokenUsage(entitlement.modelSelection, {
        inputTokens: 12, cachedInputTokens: 0, cacheWriteTokens: 12, outputTokens: payload.max_output_tokens,
      }).costNanos;
      assert.ok(ceiling <= reservationNanos, 'Counted input plus worst-case output must fit the existing reservation');
      assert.ok(!f.calls.some(([name]) => name === 'agents-http'));
      const attached = payload.input.flatMap(message => message.content)
        .filter(part => part.type === 'input_image').map(part => part.image_url);
      assert.deepEqual(attached, images, 'No input image may be dropped or silently replaced');
      assertMeteredBeforeProvider(f, entitlement.modelSelection);
      assert.ok(ledgerCalls(f).some(([name, args]) => name === 'record_arc_usage'
        && args.is_final === true && args.cumulative_nanos > 0), 'Provider response usage must settle');
      assert.equal(data.model_used, entitlement.modelSelection);
      assert.equal(data.reasoning_effort_used, 'low'); assert.equal(data.model_switch_notice, undefined);
    }
  }
});

test('Premium vision unknown generation outcomes keep the hold and never fall back or restart', async () => {
  for (const options of [{ providerThrow: true }, { providerStatus: 408 }, { providerStatus: 409 }, { providerStatus: 500 }]) {
    const f = loadEndpoint('analyze-image', options);
    const response = await f.invoke({ ...bodies['analyze-image'], modelSelection: SOL });
    assert.ok(response.status >= 400); assertProvider(f, SOL);
    assert.equal(f.providerCalls[0].transport, 'responses');
    assert.equal(f.calls.filter(([name]) => name === 'record_arc_usage').length, 0);
    assert.deepEqual(reservations(f).map(args => args.model_name), [SOL]);
    assert.equal(f.calls.filter(([name, args]) => name === 'responses-http' && args.path.endsWith('/cancel')).length, 0);
  }
});

test('Premium vision input-count failure stops before generation and releases its untouched hold', async () => {
  for (const options of [{ preflightStatus: 400 }, { inputTokens: 'unknown' }]) {
    const f = loadEndpoint('analyze-image', options);
    const response = await f.invoke({ ...bodies['analyze-image'], modelSelection: SOL });
    assert.ok(response.status >= 400); assert.equal(f.providerCalls.length, 0);
    assert.deepEqual(reservations(f).map(args => args.model_name), [SOL]);
    const receipts = f.calls.filter(([name]) => name === 'record_arc_usage');
    assert.equal(receipts.length, 1); assert.equal(receipts[0][1].cumulative_nanos, 0);
    assert.equal(receipts[0][1].is_final, true);
  }
});

test('Premium vision input-fit failure releases only the unused premium hold and uses bounded Luna with an honest notice', async () => {
  const images = ['https://example.com/first.png', 'https://example.com/second.png'];
  const f = loadEndpoint('analyze-image', { inputTokens: 10_000, reservationNanos: 10_000_000 });
  const response = await f.invoke({ ...bodies['analyze-image'], image: undefined, images, modelSelection: SOL });
  const data = await responseJson(response);
  assert.equal(response.status, 200, JSON.stringify(data));
  assertProvider(f, LUNA); assert.equal(f.providerCalls[0].transport, 'responses');
  assert.equal(data.model_used, LUNA); assert.equal(data.reasoning_effort_used, providerEffort(f));
  assert.match(data.model_switch_notice, /too large.*premium allowance.*GPT 6 Luna/);
  assert.deepEqual(reservations(f).map(args => args.model_name), [SOL, LUNA]);
  const counts = f.calls.filter(([name, args]) => name === 'responses-http' && args.path === '/input_tokens');
  assert.deepEqual(counts.map(([, args]) => args.payload.model), [SOL, LUNA]);
  const attached = f.providerCalls[0].payload.input.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(part => part.type === 'input_image').map(part => part.image_url);
  assert.deepEqual(attached, images);
  const releasedIndex = f.calls.findIndex(([name, args]) => name === 'record_arc_usage'
    && args.reservation_id === `reservation:${SOL}` && args.cumulative_nanos === 0 && args.is_final === true);
  const generationIndex = f.calls.findIndex(([name]) => name === 'provider');
  assert.ok(releasedIndex >= 0 && releasedIndex < generationIndex);
  assert.ok(!f.calls.some(([name]) => name === 'agents-http'));
});

test('Premium vision cannot fall back when releasing the initial hold fails or a too-large request is replayed', async () => {
  for (const options of [{ recordError: 'Fixture release failed' }, { replayed: true }]) {
    const f = loadEndpoint('analyze-image', { ...options, inputTokens: 10_000, reservationNanos: 10_000_000 });
    const response = await f.invoke({ ...bodies['analyze-image'], modelSelection: SOL });
    assert.ok(response.status >= 400);
    assert.equal(f.providerCalls.length, 0);
    assert.deepEqual(reservations(f).map(args => args.model_name), [SOL]);
    if (options.replayed) {
      assert.equal(response.status, 409);
      assert.equal(f.calls.filter(([name]) => name === 'record_arc_usage').length, 0);
      assert.ok(!f.calls.some(([name]) => name === 'responses-http'));
    }
  }
});

test('Premium vision poll failure cancels the known Response without another generation', async () => {
  const f = loadEndpoint('analyze-image', { responsePollThrow: true });
  const response = await f.invoke({ ...bodies['analyze-image'], modelSelection: SOL });
  assert.ok(response.status >= 400); assertProvider(f, SOL);
  assert.equal(f.providerCalls[0].transport, 'responses');
  assert.equal(f.calls.filter(([name, args]) => name === 'responses-http' && args.path === '/resp_fixture/cancel').length, 1);
  assert.deepEqual(reservations(f).map(args => args.model_name), [SOL]);
});

test('Inline PDF and non-image data documents truthfully use Luna before any premium provider call', async () => {
  for (const mimeType of ['application/pdf', 'text/plain', 'application/json']) {
    for (const modelSelection of [SOL, ASTRA]) {
      const f = loadEndpoint('analyze-document', { boost: true });
      const fileBase64 = 'JVBERi0xLjQKZml4dHVyZQ==';
      const response = await f.invoke({ ...bodies['analyze-document'], fileName: 'fixture.pdf',
        fileBase64, mimeType, modelSelection });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA, 'low');
      const [{ transport, payload }] = f.providerCalls;
      assert.equal(transport, 'completion');
      assert.equal(payload.messages.at(-1).content[1].image_url.url, `data:${mimeType};base64,${fileBase64}`);
      assert.equal(data.model_used, LUNA); assert.equal(data.reasoning_effort_used, 'low');
      assert.match(data.model_switch_notice, /document uses GPT 6 Luna.*not available for this file format/i);
      assert.deepEqual(reservations(f).map(args => args.model_name), [modelSelection, LUNA]);
      const releasedIndex = f.calls.findIndex(([name, args]) => name === 'record_arc_usage'
        && args.reservation_id === `reservation:${modelSelection}`
        && args.cumulative_nanos === 0 && args.is_final === true
        && args.usage_detail.reason === 'document-transport-requires-luna');
      const providerIndex = f.calls.findIndex(([name]) => name === 'provider');
      assert.ok(releasedIndex >= 0 && releasedIndex < providerIndex, 'Unused premium hold releases before Luna starts');
      assertMeteredBeforeProvider(f, LUNA);
    }
  }
});

test('Extracted document text retains premium transport with bounded output', async () => {
  for (const modelSelection of [SOL, ASTRA]) {
    const f = loadEndpoint('analyze-document', { boost: true });
    const response = await f.invoke({ ...bodies['analyze-document'], modelSelection });
    const data = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, modelSelection, 'low');
    assert.equal(f.providerCalls[0].transport, 'completion');
    assert.ok(f.providerCalls[0].payload.max_completion_tokens > 0);
    assert.ok(f.providerCalls[0].payload.max_completion_tokens <= 16_384);
    assert.equal(data.model_used, modelSelection); assert.equal(data.model_switch_notice, undefined);
  }
});

test('Replayed premium PDF or oversized input cannot refund a live reservation or start another model', async () => {
  for (const modelSelection of [SOL, ASTRA]) {
    for (const extra of [
      { mimeType: 'application/pdf', fileBase64: 'JVBERi0xLjQKZml4dHVyZQ==' },
      { fileBase64: 'Oversized extracted text. '.repeat(1000) },
    ]) {
      const f = loadEndpoint('analyze-document', { boost: true, replayed: true, reservationNanos: 10_000_000 });
      const response = await f.invoke({ ...bodies['analyze-document'], ...extra, modelSelection,
        submissionId: '00000000-0000-4000-8000-000000000001' });
      assert.equal(response.status, 409, JSON.stringify(await response.clone().json()));
      assert.equal(f.providerCalls.length, 0);
      assert.deepEqual(reservations(f).map(args => args.model_name), [modelSelection]);
      assert.equal(f.calls.filter(([name]) => name === 'record_arc_usage').length, 0,
        'A changed replay cannot claim the original premium provider spent zero');
    }
  }
});

test('Replay fingerprints cover changed image and document contents', async () => {
  for (const [endpoint, variants] of [
    ['analyze-image', [{ image: 'https://img.example/a' }, { image: 'https://img.example/b' }]],
    ['analyze-image', [{ images: ['https://img.example/a'] }, { images: ['https://img.example/a', 'https://img.example/b'] }]],
    ['analyze-document', [{ mimeType: 'application/pdf', fileBase64: 'first-document' },
      { mimeType: 'application/pdf', fileBase64: 'changed-document' }]],
    ['analyze-document', [{ fileBase64: 'first extracted text' }, { fileBase64: 'changed extracted text' }]],
  ]) {
    const f = loadEndpoint(endpoint, { replayed: true });
    for (const extra of variants) {
      const response = await f.invoke({ ...bodies[endpoint], ...extra, modelSelection: SOL,
        submissionId: '00000000-0000-4000-8000-000000000002' });
      assert.equal(response.status, 409); assert.equal(f.providerCalls.length, 0);
    }
    const requests = reservations(f);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].request_key, requests[1].request_key);
    assert.notEqual(requests[0].request_fingerprint, requests[1].request_fingerprint,
      'The SQL ledger must be able to detect same-key changed media');
    assert.equal(f.calls.filter(([name]) => name === 'record_arc_usage').length, 0);
  }
});

test('Untagged legacy file generation ignores raw premium hints without contacting new ledger', async () => {
  for (const model of [undefined, SOL, ASTRA]) {
    const f = loadEndpoint('generate-file', { adminError: 'unused', boostError: 'unused', ledgerError: 'unused' });
    const response = await f.invoke({ ...bodies['generate-file'], ...spoof, model,
      reasoningSelection: ASTRA, reasoningEffort: 'low' });
    assert.equal(response.status, 200); assertProvider(f, LUNA, 'low');
    assert.equal(f.providerCalls[0].transport, 'completion'); assert.equal(ledgerCalls(f).length, 0);
    assert.ok(!f.calls.some(([name, value]) => name === 'from' && value === 'admin_users'));
  }
});

test('Shared chat voice compatibility narrows stale selections to Luna/low and bypasses ledger', async () => {
  for (const hint of [{ modelSelection: SOL }, { modelSelection: ASTRA }, { model: ASTRA }, { reasoningSelection: ASTRA }, {}]) {
    const f = loadEndpoint('chat', { ledgerError: 'must never be read', adminError: 'unused' });
    const response = await f.invoke({ ...bodies.chat, ...spoof, ...hint, compatibilityMode: 'voice' });
    const data = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA, 'low');
    assert.equal(data.model_used, LUNA); assert.equal(data.reasoning_effort_used, 'low');
    assert.equal(ledgerCalls(f).length, 0);
    assert.ok(!f.calls.some(([name, table]) => name === 'from' && table === 'admin_users'));
  }
});

test('Shared chat voice compatibility still bypasses ledger with a caller-supplied enhance marker', async () => {
  const f = loadEndpoint('chat', { ledgerError: 'must never be read' });
  const response = await f.invoke({ ...bodies.chat, compatibilityMode: 'voice', modelSelection: ASTRA,
    messages: [{ role: 'system', content: '[ENHANCE_MODE] Rewrite this prompt.' },
      { role: 'user', content: 'Hi' }] });
  const data = await responseJson(response);
  assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA, 'low');
  assert.equal(ledgerCalls(f).length, 0, 'Every voice compatibility branch must bypass new metering');
});

test('Omitting modelSelection never opens an unmetered premium path', async () => {
  for (const endpoint of ['chat', 'analyze-document', 'generate-file']) {
    for (const hint of [{ model: SOL }, { model: ASTRA }, { reasoningSelection: SOL }, {}]) {
      const f = loadEndpoint(endpoint, { boost: true, ledgerError: 'unavailable' });
      const body = { ...bodies[endpoint], ...hint };
      if (!Object.keys(hint).length && endpoint === 'chat') body.messages = [{ role: 'user', content: 'Draft a short email' }];
      const response = await f.invoke(body);
      if (endpoint === 'generate-file' || ['chat', 'analyze-document'].includes(endpoint) && !Object.keys(hint).length) {
        assert.equal(response.status, 200); assertProvider(f, LUNA);
        if (endpoint === 'generate-file') assert.equal(ledgerCalls(f).length, 0);
      } else {
        assert.equal(response.status, 503, `${endpoint}: ${JSON.stringify(hint)}`);
        assert.equal(f.providerCalls.length, 0);
      }
    }
  }
});

test('Legacy installed reminders and retired selectors use Luna without a new accounting dependency', async () => {
  for (const reasoningSelection of [undefined, 'auto', 'none', 'low', 'medium', 'high', 'flash', 'flynn', 'think']) {
    const f = loadEndpoint('chat', { ledgerError: 'must never be read' });
    const response = await f.invoke({ ...bodies.chat, model: reasoningSelection === undefined ? LUNA : ASTRA,
      reasoningSelection, reasoningEffort: 'low', messages: [{ role: 'user', content: 'Create a reminder for tomorrow' }] });
    const data = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, LUNA, 'low');
    assert.equal(data.model_used, LUNA); assert.equal(ledgerCalls(f).length, 0);
    assert.ok(!f.calls.some(([name, table]) => name === 'from' && table === 'admin_users'));
  }
  for (const reasoningSelection of [[SOL], { model: ASTRA }, 42, null]) {
    const f = loadEndpoint('chat', { ledgerError: 'premium must stop' });
    const response = await f.invoke({ ...bodies.chat, model: ASTRA, reasoningSelection,
      messages: [{ role: 'user', content: 'Draft a short email' }] });
    assert.equal(response.status, 503); assert.equal(f.providerCalls.length, 0);
  }
  const typed = loadEndpoint('chat', { ledgerError: 'premium must stop' });
  const response = await typed.invoke({ ...bodies.chat, modelSelection: SOL, reasoningSelection: 'low' });
  assert.equal(response.status, 503); assert.equal(typed.providerCalls.length, 0);
});

test('Chat Auto writing, code and search choose metered Sol, then use Luna when exhausted', async () => {
  for (const content of ['Draft a short email', 'Debug my app', 'Search the web for news']) {
    for (const exhausted of [false, true]) {
      const f = loadEndpoint('chat', { deniedModels: exhausted ? [SOL] : [] });
      const response = await f.invoke({ ...bodies.chat, modelSelection: 'auto', messages: [{ role: 'user', content }] });
      const data = await responseJson(response);
      assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, exhausted ? LUNA : SOL);
      assertMeteredBeforeProvider(f, exhausted ? LUNA : SOL);
      assert.equal(data.model_used, exhausted ? LUNA : SOL);
      if (exhausted) assert.match(data.model_switch_notice, /GPT 6 Luna/);
    }
  }
});

test('Enhance short-circuit uses actual metered route and fallback metadata', async () => {
  const messages = [{ role: 'system', content: '[ENHANCE_MODE] Rewrite the supplied prompt.' },
    { role: 'user', content: 'Write a short email' }];
  for (const exhausted of [false, true]) {
    const f = loadEndpoint('chat', { deniedModels: exhausted ? [SOL] : [] });
    const response = await f.invoke({ ...bodies.chat, modelSelection: SOL, reasoningEffort: 'high', messages });
    const data = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(data)); assertProvider(f, exhausted ? LUNA : SOL, 'low');
    assertMeteredBeforeProvider(f, exhausted ? LUNA : SOL);
    assert.equal(data.model_used, exhausted ? LUNA : SOL); assert.equal(data.reasoning_effort_used, 'low');
  }
});

test('SSE done event reports actual Luna fallback and server effort', async () => {
  const f = loadEndpoint('chat', { deniedModels: [SOL] });
  const response = await f.invoke({ ...bodies.chat, modelSelection: SOL, reasoningEffort: 'high', streamEvents: true });
  const data = await responseJson(response);
  assertProvider(f, LUNA, 'none'); assert.equal(data.model_used, LUNA);
  assert.equal(data.reasoning_effort_used, 'none'); assert.match(data.model_switch_notice, /GPT 6 Luna/);
});

test('Canonical Luna stream uses bounded Responses, settles usage and reports actual none effort', async () => {
  const f = loadEndpoint('chat');
  const response = await f.invoke({ ...bodies.chat, modelSelection: LUNA, reasoningEffort: 'high', stream: true });
  const data = await responseJson(response);
  assertProvider(f, LUNA, 'none'); assert.equal(data.model_used, LUNA);
  assert.equal(f.providerCalls[0].transport, 'responses');
  assert.equal(f.providerCalls[0].payload.stream, true);
  assert.equal(data.reasoning_effort_used, 'none'); assert.equal(data.content, 'Fixture response.');
  assertMeteredBeforeProvider(f, LUNA);
  assert.ok(ledgerCalls(f).some(([name]) => name === 'record_arc_usage'));
});

test('Paid completion failures never retry an ambiguous provider attempt', async () => {
  for (const options of [{ providerThrow: true }, { providerStatus: 408 }, { providerStatus: 409 }, { providerStatus: 500 }, { providerStatus: 429 }]) {
    const f = loadEndpoint('analyze-document', options);
    const response = await f.invoke({ ...bodies['analyze-document'], modelSelection: SOL });
    assert.ok(response.status >= 400); assertProvider(f, SOL);
    const receipts = f.calls.filter(([name]) => name === 'record_arc_usage');
    assert.equal(receipts.length, options.providerStatus === 429 ? 1 : 0,
      'Only a definite no-generation rejection may release a paid reservation');
    if (receipts.length) assert.equal(receipts[0][1].cumulative_nanos, 0);
  }
});

test('Retired Gemini dispatch stays absent and persisted metadata uses server results', () => {
  const source = readFileSync('supabase/functions/chat/index.ts', 'utf8');
  assert.ok(!source.includes('flynnChatSession') && !source.includes('GEMINI_API_KEY') && !source.includes('shouldAutoUseFlash'));
  assert.match(source, /model: selectedModel,/);
  assert.match(source, /reasoning_effort_used: modelReasoningEffort/);
  assert.match(source, /stream && lunaCompatibility && selectedModel === LUNA_MODEL && modelReasoningEffort === 'none'/);
  assert.match(source, /if \(stream && !lunaCompatibility\)/);
  assert.match(source, /useAgentsApi = !lunaCompatibility/);
  const ordinary = readFileSync('supabase/functions/_shared/ordinaryChatIntake.ts', 'utf8');
  assert.ok(!ordinary.includes('reasoning_effort_used:body.reasoningEffort'), 'saved metadata must not overwrite actual server effort');
  assert.ok(ordinary.includes('modelSelection:body.modelSelection'), 'replay identity covers captured model');
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) {
    failures++;
    console.error(`FAIL ${name}\n${error.stack || error}`);
  }
}
console.log(`${tests.length - failures}/${tests.length} GPT server lineup regression groups passed; all providers and database calls mocked.`);
process.exitCode = failures ? 1 : 0;
