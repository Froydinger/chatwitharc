// Offline execution of the actual chat handler, Responses adapter, model routing,
// accounting, browser-tool adapter and tool dispatch. Database, providers and tool
// services are fixtures. No provider request or external side effect is permitted.
// This is a transport/dispatch regression suite, not a live-model quality test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const LUNA = 'gpt-6-luna', SOL = 'gpt-6.1-sol', ASTRA = 'gpt-6-astra';
const OWNER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const HANDLE = 'fixture-browser-handle';
const weather = { location: 'Chicago, Illinois, US', temperature: 64, feelsLike: 62,
  condition: 'Mostly clear', code: 1, high: 68, low: 52, humidity: 50, wind: 8, isDay: true };
const toolCases = [
  { name: 'open_bug_report', args: {}, evidence: /bug report form is now open/ },
  { name: 'web_search', args: { query: 'fixture facts' }, body: { forceWebSearch: true }, evidence: /fixture\.invalid\/source/ },
  { name: 'search_past_chats', args: { query: 'fixture' }, evidence: /Fixture saved chat/ },
  { name: 'update_canvas', args: { content: 'Fixture draft content.', label: 'Fixture draft' }, body: { forceCanvas: true }, evidence: /Canvas updated successfully/ },
  { name: 'update_code', args: { code: 'console.log("fixture");', language: 'javascript', label: 'Fixture code' }, body: { forceCode: true }, evidence: /Code Canvas updated successfully/ },
  { name: 'generate_file', args: { fileType: 'txt', prompt: 'Fixture text file.' }, evidence: /fixture\.invalid\/files\/report\.txt/ },
  { name: 'save_memory', args: { memory: 'Fixture memory.', replaces: [] }, evidence: /Living memory updated/ },
  { name: 'get_weather', args: { location: 'Chicago, IL' }, body: { forceWebSearch: true }, prompt: 'weather near me', evidence: /Weather card displayed.*64/ },
  { name: 'send_notification', args: { title: 'Fixture note', body: 'Fixture notification.', channel: 'push' }, evidence: /push sent/ },
  { name: 'schedule_task', args: { title: 'Fixture reminder', prompt: 'Stretch.', when_iso: '2027-01-01T10:00:00.000Z', deliver_push: true, deliver_email: false }, prompt: 'Remind me to stretch.', evidence: /Scheduled task created/ },
  { name: 'update_scheduled_task', args: { task_id: TASK, title: 'Updated fixture reminder' }, prompt: 'Update that reminder.', evidence: /Scheduled task updated/ },
  { name: 'spawn_subagents', args: { prompt: 'Compare two fixture alternatives.', max_subagents: 2 }, evidence: /Temporary Luna helper pass completed/ },
  { name: 'git_search_repository', args: { repo: 'fixture/project', branch: 'main', query: 'App' }, body: { forceGit: true }, evidence: /src\/App\.tsx/ },
  { name: 'git_read_repository', args: { repo: 'fixture/project', branch: 'main', paths: ['src/App.tsx'] }, body: { forceGit: true }, evidence: /Fixture repository content/ },
  { name: 'git_apply_repository_changes', args: { repo: 'fixture/project', baseBranch: 'main', files: [{ path: 'src/App.tsx', content: 'Fixture changed content', delete: false }], commitMessage: 'Fixture update', pullRequestTitle: 'Fixture change', pullRequestBody: 'Fixture request.' }, body: { forceGit: true }, evidence: /github\.com\/fixture\/project\/pull\/1/ },
  { name: 'browserbase_open_live_site', args: { targetUrl: 'https://fixture.invalid/site' }, evidence: /Fixture public page/ },
  { name: 'browserbase_act', args: { sessionHandle: HANDLE, operation: { type: 'read_snapshot' } }, body: { browserbaseSessionHandle: HANDLE }, evidence: /Fixture public page/ },
  { name: 'browserbase_close_session', args: { sessionHandle: HANDLE }, body: { browserbaseSessionHandle: HANDLE }, evidence: /"status":"closed"/ },
];
const tests = [];
const test = (name, run) => tests.push({ name, run });
const compiled = new Map();
let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork++; throw Error('External network prohibited in bounded-chat suite'); };

function compile(file) {
  file = resolve(file);
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, 'utf8').replaceAll('import.meta.main', 'false'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText);
  return compiled.get(file);
}

function fixture(options = {}) {
  const { tool = toolCases[7], model = LUNA, providerTurns, actionFailure = false, replayed = false,
    queued = false, failGeneration = 0, generationStatus = 500, transportThrow = false,
    omitUsage = false, inputCountStatus = 200, countTokens = 100, browserEnabled = true,
    streamEvents = true, reservationNanos, ledgerFailAfter = 0, deniedModels = [], weatherPayload = weather,
  } = options;
  let handler, generations = 0, usageRecords = 0;
  const calls = [], posts = [], counts = [], outputs = [], events = [], errors = [], legacyCalls = [];
  const modules = new Map(), responseById = new Map();
  const user = { id: OWNER, email: 'owner@fixture.invalid' };
  let taskRow = { id: TASK, title: 'Fixture reminder', prompt: 'Stretch.', schedule_type: 'once', cron_expr: null,
    next_run_at: '2027-01-01T10:00:00.000Z', push_on_complete: true, notify_email: false, user_id: OWNER };
  const act = (name, args) => { calls.push([name, structuredClone(args)]); if (actionFailure) throw Error('Fixture tool service unavailable'); };
  const browserResult = (status = 'agent_running') => ({ available: true, sessionHandle: HANDLE,
    status, expiresAt: '2027-01-01T00:00:00.000Z', device: 'desktop', control: 'agent',
    liveViewUrl: 'https://fixture.invalid/private-live-view?token=fixture-only',
    pageSnapshot: { title: 'Fixture public page', url: 'https://fixture.invalid/site', text: 'Fixture visible page text.' } });
  const browserBackend = {
    create: async (...args) => { act('browser-create', args); return browserResult(); },
    view: async (...args) => { act('browser-view', args); return browserResult(); },
    act: async (...args) => { act('browser-act', args); return browserResult(); },
    close: async (...args) => { act('browser-close', args); return browserResult('closed'); },
  };
  const db = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    async rpc(name, args) {
      calls.push([name, structuredClone(args)]);
      if (name === 'user_has_boost') return { data: model === ASTRA, error: null };
      if (name === 'reserve_arc_usage') {
        assert.equal(args.target_user_id, OWNER);
        const allowed = !deniedModels.includes(args.model_name);
        return { data: { allowed, enforcementEnabled: true, configured: true,
          tier: model === ASTRA ? 'boost' : 'free', pool: args.pool_name, adminUncapped: false, replayed,
          reservationId: allowed ? `reservation:${args.model_name}` : null,
          reservedNanos: allowed ? reservationNanos ?? args.requested_nanos : 0, cumulativeCostNanos: 0 }, error: null };
      }
      if (name === 'record_arc_usage') {
        usageRecords++;
        if (ledgerFailAfter && usageRecords >= ledgerFailAfter) return { data: null, error: { message: 'Fixture ledger unavailable' } };
        return { data: { revision: usageRecords, cumulativeCostNanos: args.cumulative_nanos, replayed: false, enforcementEnabled: true }, error: null };
      }
      if (name === 'search_chat_sessions') {
        assert.equal(args.searching_user_id, OWNER);
        return { data: [{ id: 'fixture-past-chat', title: 'Fixture saved chat', updated_at: '2026-10-01T00:00:00Z',
          messages: [{ role: 'user', content: 'Fixture remembered conversation.' }] }], error: null };
      }
      throw Error(`Unexpected fixture RPC: ${name}`);
    },
    from(table) {
      assert.ok(['admin_users', 'admin_settings', 'memory_summaries', 'chat_sessions', 'git_connections', 'push_subscriptions', 'scheduled_tasks'].includes(table), `Unexpected table ${table}`);
      const filters = []; let mutation = null, row = null, single = false;
      const result = async () => {
        calls.push(['query', { table, filters, mutation, row }]);
        if (mutation) {
          act(`${table}:${mutation}`, row ?? filters);
          if (table === 'scheduled_tasks') taskRow = { ...taskRow, ...row };
        }
        const data = table === 'admin_settings' ? [] : table === 'admin_users' || table === 'memory_summaries' ? null
          : table === 'chat_sessions' ? { id: SESSION, user_id: OWNER, is_git: false, is_work: false }
          : table === 'git_connections' ? { selected_repo: 'fixture/project', selected_branch: 'main', repo_access_mode: 'selected', allowed_repos: ['fixture/project'] }
          : table === 'scheduled_tasks' ? single ? taskRow : [taskRow] : [];
        return { data, error: null, ...(table === 'push_subscriptions' ? { count: 1 } : {}) };
      };
      const chain = { select() { return chain; }, eq(k, v) { filters.push([k, v]); return chain; }, in() { return chain; }, order() { return chain; }, limit() { return chain; },
        insert(value) { mutation = 'insert'; row = value; return chain; }, update(value) { mutation = 'update'; row = value; return chain; }, delete() { mutation = 'delete'; return chain; },
        maybeSingle() { single = true; return result(); }, single() { single = true; return result(); }, then(a, b) { return result().then(a, b); } };
      return chain;
    },
    functions: { async invoke(name, args) {
      act(`invoke:${name}`, args);
      if (name === 'generate-file') return { data: { success: true, fileName: 'report.txt', fileUrl: 'https://fixture.invalid/files/report.txt' }, error: null };
      if (name === 'send-push-notification') return { data: { sent: 1, failed: 0, total: 1 }, error: null };
      throw Error(`Unexpected fixture function: ${name}`);
    } },
  };
  const usage = { input_tokens: countTokens, output_tokens: 20, total_tokens: countTokens + 20 };
  const reasoning = step => ({ type: 'reasoning', id: `rs_fixture_${step}`, summary: [{ type: 'summary_text', text: 'Fixture safe summary.' }], encrypted_content: `opaque_fixture_signature_${step}` });
  const call = (name, args, id = 'call_fixture') => ({ type: 'function_call', id: `fc_${id}`, call_id: id,
    name, arguments: typeof args === 'string' ? args : JSON.stringify(args), status: 'completed' });
  const final = text => ({ type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
  const fetchMock = async (url, init = {}) => {
    url = String(url); const payload = init.body ? JSON.parse(init.body) : undefined;
    if (url === 'https://api.openai.com/v1/responses/input_tokens') {
      counts.push(payload);
      return Response.json(inputCountStatus === 200 ? { input_tokens: countTokens } : { error: { message: 'Fixture count rejection' } }, { status: inputCountStatus });
    }
    if (url === 'https://api.openai.com/v1/responses') {
      const step = generations++; posts.push(payload);
      if (failGeneration === step + 1) {
        if (transportThrow) throw Error('Fixture ambiguous provider transport failure');
        return Response.json({ error: { message: 'Fixture provider rejected request' } }, { status: generationStatus });
      }
      const output = providerTurns ? providerTurns({ step, call, final, reasoning, payload })
        : step === 0 ? [reasoning(step), call(tool.name, tool.args)]
          : [reasoning(step), final(actionFailure ? 'The tool did not complete.' : `Fixture complete for ${tool.name}.`)];
      const id = `resp_fixture_${step}`;
      const response = { id, status: 'completed', model: payload.model, metadata: payload.metadata, ...(omitUsage ? {} : { usage }), output };
      outputs.push(output); responseById.set(id, response);
      return Response.json(queued ? { id, status: 'queued' } : response);
    }
    if (/^https:\/\/api\.openai\.com\/v1\/responses\/resp_fixture_\d+(?:\/cancel)?$/.test(url)) {
      const id = url.match(/resp_fixture_\d+/)[0];
      calls.push([url.endsWith('/cancel') ? 'cancel-response' : 'poll-response', { id }]);
      return Response.json({ ...responseById.get(id), ...(url.endsWith('/cancel') ? { status: 'cancelled' } : {}) });
    }
    if (url.startsWith('https://api.openai.com/')) {
      legacyCalls.push({ url, payload });
      throw Error(`Forbidden legacy provider path: ${url}`);
    }
    if (url === 'https://fixture.invalid/functions/v1/get-weather') {
      act('weather', payload); return Response.json(actionFailure ? { error: 'Fixture weather unavailable', fallback: true } : weatherPayload);
    }
    if (url === 'https://api.tavily.com/search') {
      act('search', payload); return Response.json({ answer: 'Fixture search finding.',
        results: [{ title: 'Fixture source', url: 'https://fixture.invalid/source', content: 'Fixture verified source content.' }], images: ['https://fixture.invalid/image.png'] });
    }
    if (url === 'https://fixture.invalid/functions/v1/memory-summary') {
      act('memory', payload); return Response.json({ summary: 'Fixture memory summary.' });
    }
    if (url === 'https://fixture.invalid/functions/v1/chat-subagents') {
      act('subagents', payload);
      return new Response(`data: ${JSON.stringify({ type: 'done', content: 'Fixture helper synthesis.', modelUsed: LUNA, workerCount: 2 })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw Error(`Unexpected fixture URL; real network is forbidden: ${url}`);
  };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon',
    OPENAI_API_KEY: 'fixture-model', TAVILY_API_KEY: 'fixture-search', CHAT_AGENT_ANSWER_STREAM_ENABLED: 'true' };
  const mockModules = {
    'ordinaryChatIntake.ts': { ordinaryChatIntake: options => options.handle(options.req) },
    'browserProvider.ts': { liveBrowserEnabled: () => browserEnabled, createBrowserProvider: () => browserBackend },
    'chatBrowserbaseIntent.ts': { browserPreflightIntent: () => null },
    'browserbaseStore.ts': { browserbaseSessionStore: () => ({ getOwned: async (handle, userId) => {
      assert.equal(handle, HANDLE); assert.equal(userId, OWNER); return { ...browserResult(), userId };
    } }) },
    'gitFeature.ts': { gitEnabledForEmail: async () => true, gitStaticTokenForUser: async () => 'fixture-github-token' },
    'github.ts': {
      githubSearchFiles: async (...args) => { act('git-search', args); return { repo: 'fixture/project', branch: 'main', headSha: 'fixture-sha', paths: ['src/App.tsx'] }; },
      githubReadFiles: async (...args) => { act('git-read', args); return { files: [{ path: 'src/App.tsx', content: 'Fixture repository content.' }] }; },
      githubCommitPullRequest: async (...args) => { act('git-apply', args); return { branch: 'arc/fixture', commitSha: 'fixture-sha', pullRequestUrl: 'https://github.com/fixture/project/pull/1' }; },
      decryptToken: () => { throw Error('Fixture should never decrypt credentials'); },
    },
    'cloudAgentAnswerStream.ts': { streamAgentAnswer: async () => { legacyCalls.push({ url: 'Agents event stream' }); throw Error('Responses must not open an Agents stream'); } },
  };
  function load(file) {
    file = resolve(file); if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const requireMock = name => {
      if (name.startsWith('node:')) return nodeRequire(name);
      if (name === 'https://deno.land/std@0.168.0/http/server.ts') return { serve: value => { handler = value; } };
      if (name === 'https://esm.sh/@supabase/supabase-js@2.89.0') return { createClient: () => db };
      if (mockModules[basename(name)]) return mockModules[basename(name)];
      assert.ok(name.startsWith('./') || name.startsWith('../'), `Unexpected nonlocal module: ${name}`);
      return load(resolve(dirname(file), name));
    };
    new Function('exports', 'require', 'Deno', 'console', 'fetch', compile(file))(exports, requireMock,
      { env: { get: name => env[name] }, serve: value => { handler = value; } },
      { log() {}, warn() {}, error(...args) { errors.push(args); } }, fetchMock);
    return exports;
  }
  load('supabase/functions/chat/index.ts');
  return { calls, posts, counts, outputs, events, errors, legacyCalls,
    async run(extra = {}) {
      const body = { messages: [{ role: 'user', content: tool.prompt ?? 'Please perform the fixture action.' }],
        profile: { context_info: 'Current client approximate IP-city estimate: Chicago, Illinois. This is not GPS. Explicit requested places override it.' },
        modelSelection: model, submissionId: `fixture:${tool.name}:${model}`, arcMode: 'chat', sessionId: SESSION,
        streamEvents, clientTimezone: 'UTC', ...tool.body, ...extra };
      const response = await handler(new Request('https://fixture.invalid/chat', {
        method: 'POST', headers: { Authorization: 'Bearer fixture-owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      if (!response.headers.get('Content-Type')?.includes('text/event-stream')) {
        const value = await response.json(); return { status: response.status, result: response.ok ? value : undefined, error: response.ok ? undefined : value.error };
      }
      for (const line of (await response.text()).split('\n')) {
        if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') events.push(JSON.parse(line.slice(6)));
      }
      const done = events.findLast(event => event.type === 'done');
      return { status: response.status, result: done?.result ?? done,
        error: events.find(event => event.type === 'error')?.message };
    },
  };
}

function assertBounded(f) {
  assert.deepEqual(f.legacyCalls, [], 'No Agents, Chat Completions recovery, synthesis, memory delegation, or Agents answer stream');
  assert.equal(f.counts.length, f.posts.length, 'Every generation has its own complete-input preflight');
  f.posts.forEach((post, i) => {
    for (const field of ['model', 'instructions', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text']) {
      assert.deepEqual(post[field], f.counts[i][field], `Preflight and generation ${field} must be identical`);
    }
    assert.equal(post.service_tier, 'default');
    assert.equal(post.parallel_tool_calls, false);
    assert.ok(Number.isSafeInteger(post.max_output_tokens) && post.max_output_tokens >= 128 && post.max_output_tokens <= 65_536);
    assert.equal('spend_control' in post, false);
  });
}

const observedTools = new Set();
for (const model of [LUNA, SOL, ASTRA]) {
  for (const tool of toolCases) test(`${model}: ${tool.name} reaches its real dispatcher and bounded result synthesis`, async () => {
    const f = fixture({ tool, model }); const { result, error } = await f.run();
    assert.equal(error, undefined, `${error}; logs=${JSON.stringify(f.errors.map(args => args.map(value => value instanceof Error ? value.stack : value)))}`);
    assert.ok(result); assert.equal(f.posts.length, 2, 'One tool-producing response and one result-synthesis response');
    assertBounded(f);
    const registered = f.posts[0].tools.map(value => value.name);
    assert.ok(registered.includes(tool.name)); observedTools.add(tool.name);
    assert.deepEqual(result.tool_calls_used, [tool.name]);
    assert.equal(f.posts[0].model, model); assert.equal(f.posts[1].model, model);
    assert.equal(result.model_used, tool.name === 'spawn_subagents' ? LUNA : model);
    assert.equal(result.reasoning_effort_used, tool.name === 'spawn_subagents' ? 'medium' : f.posts[1].reasoning.effort);
    const returned = f.posts[1].input.filter(item => item.type === 'function_call_output');
    assert.equal(returned.length, 1); assert.equal(returned[0].call_id, 'call_fixture'); assert.match(returned[0].output, tool.evidence);
    for (const item of f.outputs[0]) assert.deepEqual(f.posts[1].input.find(value => value.id === item.id), item, 'Native signed reasoning and function-call history must survive verbatim');
    assert.equal(f.events.filter(event => event.type === 'done').length, 1);
    const receipts = f.calls.filter(([name]) => name === 'record_arc_usage').map(([, args]) => args);
    assert.equal(receipts.length, 2); assert.equal(receipts[0].is_final, false); assert.equal(receipts[1].is_final, true);
    assert.ok(receipts[1].cumulative_nanos > receipts[0].cumulative_nanos);
    if (tool.name === 'get_weather') {
      assert.deepEqual(f.posts[0].tool_choice, { type: 'function', name: 'get_weather' });
      assert.equal(f.posts[1].tool_choice, 'auto'); assert.deepEqual(result.weather_data, weather);
      assert.deepEqual(f.calls.filter(([name]) => name === 'weather').map(([, body]) => body), [{ location: 'Chicago, IL' }]);
      assert.match(JSON.stringify(f.posts[0].input), /approximate IP-city estimate.*Chicago/);
    }
    if (tool.name === 'web_search') { assert.equal(result.search_provider, 'tavily'); assert.equal(result.web_sources[0].url, 'https://fixture.invalid/source'); assert.deepEqual(result.search_images, ['https://fixture.invalid/image.png']); }
    if (tool.name === 'update_canvas') { assert.deepEqual(result.canvas_update, tool.args); assert.deepEqual(registered, ['update_canvas']); }
    if (tool.name === 'update_code') { assert.deepEqual(result.code_update, tool.args); assert.deepEqual(registered, ['update_code']); }
    if (tool.name === 'save_memory') assert.deepEqual(result.memory_saved, { content: tool.args.memory });
    if (tool.name === 'send_notification') { assert.deepEqual(result.notification_dispatch.results, ['push sent']); assert.equal(f.calls.filter(([name]) => name === 'invoke:send-push-notification').length, 1); }
    if (tool.name === 'schedule_task' || tool.name === 'update_scheduled_task') { assert.equal(result.scheduled_task.id, TASK); assert.equal(f.calls.filter(([name]) => name === `scheduled_tasks:${tool.name === 'schedule_task' ? 'insert' : 'update'}`).length, 1); }
    if (tool.name.startsWith('git_')) { assert.equal(f.posts[0].tool_choice, 'required'); assert.ok(registered.every(name => name.startsWith('git_') || name.startsWith('browserbase_'))); }
    if (tool.name.startsWith('browserbase_')) { assert.equal(JSON.stringify(f.posts).includes('private-live-view'), false); assert.ok(f.events.some(event => event.type === (tool.name === 'browserbase_close_session' ? 'browser_session_closed' : 'browser_session'))); }
  });
}

test('all 18 registered chat tool names are exercised, including gated Git and browser tools', () => {
  assert.equal(toolCases.length, 18); assert.deepEqual([...observedTools].sort(), toolCases.map(tool => tool.name).sort());
});

for (const model of [LUNA, SOL, ASTRA]) test(`${model}: weather service failure stays honest, no weather card or hidden synthesis`, async () => {
  const f = fixture({ model, actionFailure: true }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.equal(result.weather_data, null); assert.match(result.choices[0].message.content, /did not complete/);
  assert.match(f.posts[1].input.find(item => item.type === 'function_call_output').output, /Weather lookup error.*unavailable/);
  assert.equal(f.calls.filter(([name]) => name === 'weather').length, 1); assertBounded(f);
});

test('queued weather Responses are polled by real response IDs without repeating generation', async () => {
  const f = fixture({ queued: true }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.deepEqual(result.weather_data, weather); assert.equal(f.posts.length, 2);
  assert.deepEqual(f.calls.filter(([name]) => name === 'poll-response').map(([, row]) => row.id), ['resp_fixture_0', 'resp_fixture_1']); assertBounded(f);
});

test('unknown model tool rejects the whole response before any registered side effect', async () => {
  const f = fixture({ tool: toolCases[8], providerTurns: ({ call }) => [call('send_notification', toolCases[8].args), call('not_registered', {}, 'call_unknown')] });
  const { result, error } = await f.run(); assert.equal(result, undefined); assert.match(error, /unavailable tool/);
  assert.equal(f.calls.filter(([name]) => name.startsWith('invoke:')).length, 0); assert.equal(f.posts.length, 1); assertBounded(f);
});

test('duplicate provider call IDs cannot execute a side effect twice', async () => {
  const f = fixture({ tool: toolCases[8], providerTurns: ({ call }) => [call('send_notification', toolCases[8].args), call('send_notification', toolCases[8].args)] });
  const { result, error } = await f.run(); assert.equal(result, undefined); assert.ok(error);
  assert.equal(f.calls.filter(([name]) => name === 'invoke:send-push-notification').length, 0, 'Reject duplicate call identities before tool execution');
  assert.equal(f.posts.length, 1); assertBounded(f);
});

test('a provider call ID reused in a later turn cannot repeat an already executed action', async () => {
  const f = fixture({ tool: toolCases[8], providerTurns: ({ call }) => [call('send_notification', toolCases[8].args)] });
  const { result, error } = await f.run(); assert.equal(result, undefined); assert.match(error, /already delivered|already executed/i);
  assert.equal(f.calls.filter(([name]) => name === 'invoke:send-push-notification').length, 1);
  assert.equal(f.posts.length, 2); assertBounded(f);
});

test('malformed weather arguments do not execute or produce a success card', async () => {
  const f = fixture({ providerTurns: ({ call }) => [call('get_weather', '{invalid')] }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.ok(error); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assert.equal(f.posts.length, 1); assertBounded(f);
});

test('forced weather selection cannot silently execute a different registered action', async () => {
  const f = fixture({ providerTurns: ({ call }) => [call('send_notification', toolCases[8].args)] }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /safely start|required tool/); assert.equal(f.calls.filter(([name]) => name.startsWith('invoke:')).length, 0); assertBounded(f);
});

for (const status of [408, 409, 500]) test(`HTTP ${status} after a tool side effect never invokes legacy recovery or repeats the action`, async () => {
  const f = fixture({ tool: toolCases[8], failGeneration: 2, generationStatus: status }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /No automatic retry/); assert.equal(f.posts.length, 2);
  assert.equal(f.calls.filter(([name]) => name === 'invoke:send-push-notification').length, 1);
  assert.equal(f.calls.filter(([name, args]) => name === 'record_arc_usage' && args.is_final).length, 0, 'Ambiguous second attempt retains its allowance hold'); assertBounded(f);
});

test('ambiguous second provider POST does not duplicate a saved reminder', async () => {
  const f = fixture({ tool: toolCases[9], failGeneration: 2, transportThrow: true }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /ambiguous provider transport/); assert.equal(f.posts.length, 2);
  assert.equal(f.calls.filter(([name]) => name === 'scheduled_tasks:insert').length, 1); assertBounded(f);
});

test('missing provider usage blocks weather execution and every further paid step', async () => {
  const f = fixture({ omitUsage: true }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /usage|Invalid provider payload/i); assert.equal(f.posts.length, 1); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assertBounded(f);
});

test('failed usage receipt prevents weather execution and further generation', async () => {
  const f = fixture({ ledgerFailAfter: 1 }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /usage could not be saved/); assert.equal(f.posts.length, 1); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assertBounded(f);
});

test('failed input preflight never generates or executes weather', async () => {
  const f = fixture({ inputCountStatus: 400 }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.match(error, /HTTP 400/); assert.equal(f.counts.length, 1); assert.equal(f.posts.length, 0);
  assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assert.deepEqual(f.legacyCalls, []);
});

test('replayed submission starts no new model generation or weather lookup', async () => {
  const f = fixture({ replayed: true }); const { result, error } = await f.run();
  assert.equal(result, undefined); assert.ok(error); assert.equal(f.posts.length, 0); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assert.deepEqual(f.legacyCalls, []);
});

test('browser disabled and Canvas/Git modes never leak unrelated tools into the request', async () => {
  const f = fixture({ browserEnabled: false }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.ok(result); assert.ok(f.posts[0].tools.every(tool => !tool.name.startsWith('browserbase_') && !tool.name.startsWith('git_'))); assertBounded(f);
});

test('plain JSON response retains weather and actual model metadata', async () => {
  const f = fixture({ model: SOL, streamEvents: false }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.deepEqual(result.weather_data, weather); assert.equal(result.model_used, SOL); assert.deepEqual(result.tool_calls_used, ['get_weather']); assertBounded(f);
});

for (const model of [LUNA, SOL, ASTRA]) test(`${model}: raw artifact stream retains weather, actual identity and safe presentation only`, async () => {
  const f = fixture({ model, streamEvents: false }); const { result, error } = await f.run({ stream: true });
  assert.equal(error, undefined); assert.deepEqual(result.weather_data, weather); assert.equal(result.model_used, model);
  assert.equal(result.reasoning_effort_used, f.posts[1].reasoning.effort); assert.deepEqual(result.tool_calls_used, ['get_weather']);
  assert.equal(result.content, 'Fixture complete for get_weather.'); assert.equal(f.events.filter(event => event.type === 'done').length, 1);
  assert.equal(JSON.stringify(f.events).includes('opaque_fixture_signature'), false); assert.equal(JSON.stringify(f.events).includes('function_call_output'), false); assertBounded(f);
});

test('explicit-place weather keeps its requested city instead of replacing it with the approximate snapshot', async () => {
  const tool = { ...toolCases[7], prompt: 'weather in Paris, France', args: { location: 'Paris, France' } };
  const f = fixture({ tool, weatherPayload: { ...weather, location: 'Paris, France' } }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.equal(result.weather_data.location, 'Paris, France');
  assert.deepEqual(f.calls.filter(([name]) => name === 'weather').map(([, body]) => body), [{ location: 'Paris, France' }]); assertBounded(f);
});

test('user-supplied weather coordinates remain paired numeric values through the tool dispatcher', async () => {
  const tool = { ...toolCases[7], prompt: 'weather at latitude 51.5, longitude -0.1', args: { latitude: 51.5, longitude: -0.1 } };
  const f = fixture({ tool, weatherPayload: { ...weather, location: 'London, UK' } }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.equal(result.weather_data.location, 'London, UK');
  assert.deepEqual(f.calls.filter(([name]) => name === 'weather').map(([, body]) => body), [{ latitude: 51.5, longitude: -0.1 }]); assertBounded(f);
});

test('a no-location clarification stays a plain answer with no fabricated weather card', async () => {
  const f = fixture({ providerTurns: ({ final }) => [final('Which city or ZIP code should I check?')] });
  const { result, error } = await f.run({ forceWebSearch: false, profile: { context_info: 'Current location is unavailable. Ask for a place.' } });
  assert.equal(error, undefined); assert.match(result.choices[0].message.content, /Which city/); assert.equal(result.weather_data, null);
  assert.deepEqual(result.tool_calls_used, []); assert.equal(f.posts.length, 1); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 0); assertBounded(f);
});

test('Auto web-mode weather selects Sol and still dispatches get_weather instead of search', async () => {
  const f = fixture({ model: 'auto' }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.equal(result.model_used, SOL); assert.deepEqual(result.weather_data, weather);
  assert.ok(f.posts.every(post => post.model === SOL)); assert.deepEqual(result.tool_calls_used, ['get_weather']);
  assert.equal(f.calls.filter(([name]) => name === 'search').length, 0); assertBounded(f);
});

test('exhausted Sol allowance keeps the real weather tool while truthfully identifying Luna', async () => {
  const f = fixture({ model: SOL, deniedModels: [SOL] }); const { result, error } = await f.run();
  assert.equal(error, undefined); assert.equal(result.model_used, LUNA); assert.match(result.model_switch_notice, /allowance.*GPT 6 Luna/);
  assert.ok(f.posts.every(post => post.model === LUNA)); assert.deepEqual(result.weather_data, weather);
  assert.deepEqual(result.tool_calls_used, ['get_weather']); assert.equal(f.calls.filter(([name]) => name === 'weather').length, 1); assertBounded(f);
});

let failed = 0;
const selectedTests = process.env.TEST_FILTER ? tests.filter(test => test.name.includes(process.env.TEST_FILTER)) : tests;
for (const { name, run } of selectedTests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
assert.equal(unexpectedNetwork, 0);
console.log(`${selectedTests.length - failed}/${selectedTests.length} actual-handler bounded-chat tool cases passed; ${unexpectedNetwork} external network attempts.`);
console.log('Fixtures exercise dispatch, artifacts, quotas, identity and transport; no live-model answer quality or external service health is claimed.');
process.exitCode = failed ? 1 : 0;
