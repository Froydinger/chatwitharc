/** Local integration: actual composer/parent source blocks, full Zustand store,
 * cloud transport/endpoint/worker/engine, real migration in disposable PostgreSQL.
 * Not a DOM/browser test: unrelated component hooks and context retrieval are not
 * mounted. SDK calls use a SQL facade; provider HTTP is loopback-only and fake.
 * Run: node --test src/services/cloudTextIntegration.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = (source, fileName = 'fixture.ts') => ts.transpileModule(source, { fileName, compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
function evaluate(source, deps = {}, imports = {}, fileName) {
  const exports = {};
  new Function('exports', 'require', ...Object.keys(deps), compile(source, fileName))(exports, name => {
    if (name in imports) return imports[name];
    throw Error(`Unmocked import blocked: ${name}`);
  }, ...Object.values(deps));
  return exports;
}
function nodeSource(path, predicate) {
  const source = read(path), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  function walk(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, walk); }
  walk(ast); assert.equal(matches.length, 1, `Unique source boundary: ${path}`);
  return matches[0].getText(ast);
}
const declaration = name => node => ts.isVariableDeclaration(node) && node.name.getText() === name;
const parentSubmit = nodeSource('src/components/MobileChatApp.tsx', declaration('submitCloudText'));
const parentMode = nodeSource('src/components/MobileChatApp.tsx', declaration('cloudExecutionMode'));
const executionMode = (cloudModeChoice, user) => evaluate(`const ${parentMode}; exports.mode = cloudExecutionMode;`, { cloudModeChoice, user }).mode;
const parentTerminal = nodeSource('src/components/MobileChatApp.tsx', node => ts.isPropertyAssignment(node) && node.name.getText() === 'onTerminal');
const composerSession = nodeSource('src/components/ChatInput.tsx', declaration('requestSessionId'));
const composerUser = nodeSource('src/components/ChatInput.tsx', declaration('userMessageId'));
const composerRoute = nodeSource('src/components/ChatInput.tsx', node => ts.isIfStatement(node)
  && node.expression.getText().startsWith('onCloudTextSubmit &&'));
const quiet = { log() {}, warn() {}, error() {} };
const owner = '00000000-0000-4000-8000-00000000d001';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const literal = value => value == null ? 'null' : typeof value === 'number' || typeof value === 'boolean'
  ? String(value) : typeof value === 'object' ? `${quote(JSON.stringify(value))}::jsonb` : quote(value);
const ident = name => { assert.match(name, /^[a-z_]+$/); return `"${name}"`; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Bounded integration wait expired'); }

test('real text submission and durable completion across detached frontend lifetimes', async t => {
  const directory = mkdtempSync('/tmp/arc-text-integration-');
  const socket = `${directory}/socket`, data = `${directory}/data`;
  mkdirSync(socket, { mode: 0o700 });
  const bin = '/opt/homebrew/opt/postgresql@17/bin';
  const env = { PATH: process.env.PATH, LC_ALL: 'C' }; // No production/PG environment.
  const port = '55441'; let started = false, server;
  const pages = [];
  function sql(statement, role = 'postgres') {
    const prefix = role === 'postgres' ? '' : `set role ${role}; set request.jwt.claim.sub=${quote(owner)};`;
    const output = execFileSync(`${bin}/psql`, ['-X', '-qAt', '-h', socket, '-p', port, '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env, input: `${prefix}\n${statement}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.trim();
  }
  function jsonSQL(statement, role) { const value = sql(statement, role); return value ? JSON.parse(value) : null; }
  const traffic = [], modelPosts = [], dropped = new Set(); let dropNextSubmit = false;
  const dbCalls = []; let holdLegacyWrite = null, holdLegacyPredicate = () => true;
  function sdk(role) {
    return {
      auth: { getUser: async token => ({ data: { user: !token || token === 'fixture-token' ? { id: owner } : null }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: owner }, access_token: 'fixture-token' } }, error: null }) },
      rpc: async (name, args) => {
        dbCalls.push({ name, args: structuredClone(args), role });
        if (name === 'user_has_boost') return { data: true, error: null };
        try {
        const call = `public.${ident(name)}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${literal(v)}`).join(',')})`;
          const query = name === 'claim_cloud_run' ? `select coalesce(jsonb_agg(row), '[]') from ${call} row` : `select to_jsonb(${call})`;
          return { data: jsonSQL(query, role), error: null };
        } catch (e) { return { data: null, error: { code: String(e.stderr).match(/ERROR:\s+(\w{5}):/)?.[1], message: String(e.stderr) } }; }
      },
      from(table) {
        assert.ok(['chat_sessions', 'cloud_runs'].includes(table));
        const filters = []; let order = '', limit = '', selected = '*';
        const rows = async () => {
          try { return { data: jsonSQL(`select coalesce(jsonb_agg(row), '[]') from (select ${selected} from public.${table} ${filters.length ? `where ${filters.join(' and ')}` : ''} ${order} ${limit}) row`, role), error: null }; }
          catch (e) { return { data: null, error: { message: String(e.stderr) } }; }
        };
        const chain = {
          select(fields = '*') { selected = fields === '*' ? '*' : fields.split(',').map(field =>
            field === 'project_id:request->>projectId' ? `request->>'projectId' as project_id` : ident(field)).join(','); return chain; },
          eq(k, v) { filters.push(`${ident(k)}=${literal(v)}`); return chain; },
          gt(k, v) { filters.push(`${ident(k)}>${literal(v)}`); return chain; },
          in(k, values) { filters.push(`${ident(k)} in (${values.map(literal).join(',')})`); return chain; },
          order(k) { order = `order by ${ident(k)}`; return chain; },
          limit(n) { assert.ok(Number.isSafeInteger(n)); limit = `limit ${n}`; return chain; },
          then(resolve, reject) { return rows().then(resolve, reject); },
          async maybeSingle() { const r = await rows(); return { ...r, data: r.data?.[0] ?? null }; },
          async single() { return chain.maybeSingle(); },
          async insert(value) { return write(value, false); },
          async upsert(value) { if (holdLegacyWrite && holdLegacyPredicate(value)) await holdLegacyWrite; return write(value, true); },
        };
        async function write(value, upsert) {
          dbCalls.push({ table, upsert, value: structuredClone(value), role });
          try {
            const keys = Object.keys(value);
            sql(`insert into public.${table} (${keys.map(ident)}) values (${keys.map(k => literal(value[k]))}) ${upsert ? `on conflict(id) do update set ${keys.filter(k => k !== 'id').map(k => `${ident(k)}=excluded.${ident(k)}`).join(',')}` : ''}`, role);
            return { error: null };
          } catch (e) { return { error: { code: String(e.stderr).match(/ERROR:\s+(\w{5}):/)?.[1], message: String(e.stderr) } }; }
        }
        return chain;
      },
    };
  }
  try {
    execFileSync(`${bin}/initdb`, ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'], { env, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', data, '-l', `${directory}/postgres.log`, '-o', `-k ${socket} -p ${port} -h '' -c unix_socket_permissions=0700`, '-w', 'start'], { env, stdio: 'pipe' }); started = true;
    assert.equal(sql('show listen_addresses'), '');
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
    for (const file of ['20250830192630_47cf40bc-2d2c-42a2-9541-f810ada41674.sql', '20251106031256_36740d06-a7da-482d-b3a6-886314af7b52.sql',
      '20260102064547_8daccd8e-e346-40d4-a197-fe6140d93084.sql', '20260529020858_177f2e15-3416-48d7-b030-2aa0dc2c81b9.sql']) sql(read(`supabase/migrations/${file}`));
    sql(read('supabase/migrations/20260703041304_restore_missing_migrated_tables.sql'));
    sql(read('supabase/migrations/20260703032634_create_personas_table.sql'));
    sql(read('supabase/migrations/20260703044916_restore_chat_persona_relation.sql'));
    sql('create unique index chat_sessions_id_user_id_cloud_runs_key on public.chat_sessions(id,user_id)');
    sql(read('supabase/migrations/20260912085941_durable_cloud_runs.sql'));
    sql(`insert into auth.users(id,email) values(${quote(owner)},'fixture@example.invalid')`);
    const service = sdk('service_role'), browser = sdk('authenticated');
    const endpoint = evaluate(read('supabase/functions/cloud-run/index.ts').replace('if (import.meta.main)', 'if (false)'), {
      Deno: { env: { get: key => ({ CLOUD_RUNS_ENABLED: 'true', SUPABASE_URL: 'http://127.0.0.1', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' })[key] } },
    }, { 'https://esm.sh/@supabase/supabase-js@2.89.0': { createClient: () => service },
      '../_shared/cloudAppIngress.ts': evaluate(read('supabase/functions/_shared/cloudAppIngress.ts')),
      '../_shared/cloudMedia.ts': { validateCloudMediaReferences: () => [] } });
    server = createServer(async (req, res) => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString();
        if (req.url.startsWith('/provider')) {
          if (req.method === 'POST') { modelPosts.push(JSON.parse(body)); res.end(JSON.stringify({ id: `resp_fixture_${modelPosts.length}` })); }
          else {
            const input = modelPosts[Number(req.url.match(/resp_fixture_(\d+)/)?.[1]) - 1]?.input ?? [];
            const tool = input.some(item => item.content === 'Fixture tool request') && !input.some(item => item.type === 'function_call_output');
            res.end(JSON.stringify({ status: 'completed', usage: { total_tokens: 7 }, output: tool
              ? [{ type: 'function_call', call_id: 'call_fixture', name: 'fixture_action', arguments: '{"value":"fixture"}' }]
              : [{ type: 'message', content: [{ type: 'output_text', text: 'Single durable server reply.' }] }] }));
          }
          return;
        }
        assert.equal(req.url, '/functions/v1/cloud-run');
        const action = JSON.parse(body); traffic.push(action);
        const response = await endpoint.handleCloudRun(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body }));
        if (action.action === 'submit' && dropNextSubmit && response.ok) {
          dropNextSubmit = false; dropped.add(action.id); res.destroy(); return;
        }
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const localFetch = (url, init) => { assert.equal(new URL(url).origin, origin, 'External HTTP forbidden'); return fetch(url, init); };
    const transport = evaluate(read('src/services/cloudRuns.ts').replaceAll('import.meta.env.', 'env.'), { env: {
      VITE_SUPABASE_URL: origin, VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
    }, fetch: localFetch }, { '@/integrations/supabase/client': { supabase: browser, isSupabaseConfigured: true } });
    const engine = evaluate(read('supabase/functions/_shared/cloudRunEngine.ts'));
    const artifacts = evaluate(read('supabase/functions/_shared/cloudRunArtifacts.ts'));
    const worker = evaluate(read('supabase/functions/_shared/cloudRunWorker.ts'), {}, { './cloudRunEngine.ts': engine, './cloudRunArtifacts.ts': artifacts });
    const provider = evaluate(read('supabase/functions/_shared/cloudRunProvider.ts'), {}, { './cloudRunEngine.ts': engine });
    const workerStore = evaluate(read('supabase/functions/_shared/cloudRunStore.ts')).cloudWorkerStore(service);
    const model = provider.cloudResponseProvider({ apiKey: 'fixture-not-a-real-key', instructions: 'Fixture only', reasoningEffort: 'low', tools: [],
      fetcher: (url, init) => { assert.ok(url.startsWith('https://api.openai.com/v1/responses')); return localFetch(`${origin}/provider${url.slice('https://api.openai.com/v1/responses'.length)}`, init); } });
    const executedTools = [];
    const tools = { fixture_action: { approval: 'ask-mode', replaySafe: true, authorize: async () => true,
      execute: async (_run, call, receiptKey) => { executedTools.push({ call, receiptKey }); return 'Fixture action done'; } } };
    async function finish(id) {
      for (let i = 0; i < 8; i++) {
        const row = jsonSQL(`select to_jsonb(r) from public.cloud_runs r where id=${quote(id)}`);
        if (row.status === 'completed') return;
        await worker.processCloudRun(id, { store: workerStore, provider: model, tools });
      }
      assert.fail('Worker did not finish within eight ticks');
    }
    const changes = evaluate(read('src/services/cloudSessionChanges.ts'));
    const persistence = evaluate(read('src/services/cloudSessionPersistence.ts'), {}, { './cloudSessionChanges': changes });
    const lifecycle = evaluate(read('src/services/cloudRunLifecycle.ts'));
    const { CloudRunsBinding } = evaluate(read('src/hooks/useCloudRuns.ts'), {}, { react: require('react'), '@/services/cloudRunLifecycle': lifecycle });
    const storage = new Map();
    async function page() {
      const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
      const store = evaluate(read('src/store/useArcStore.ts').replace("import.meta.env.VITE_CLOUD_SESSION_OPERATIONS_ENABLED === 'true'", 'true'),
        { localStorage, navigator: { onLine: true }, console: quiet }, {
          zustand: require('zustand'), 'zustand/middleware': { persist: fn => fn },
          '@/integrations/supabase/client': { supabase: browser, isSupabaseConfigured: true },
          '@/utils/memoryDetection': {}, '@/store/useCanvasStore': { useCanvasStore: { getState: () => ({ hydrateFromSession() {} }) } },
          '@/services/cloudSessionPersistence': persistence, '@/services/cloudSessionChanges': changes,
        }).useArcStore;
      const dependencies = { useArcStore: store, useModelStore: { getState: () => ({ reasoningEffort: 'low' }) },
        captureCloudWorkspaceContext:transport.captureCloudWorkspaceContext,
        resolveReasoningEffort: value => value, getQueryComplexity: () => 'simple' };
      const terminal = evaluate(`const options = { ${parentTerminal} }; exports.terminal = options.onTerminal;`, dependencies).terminal;
      let snapshot; const terminalErrors = [];
      const binding = new CloudRunsBinding(owner, { onChange: value => { snapshot = value; },
        onTerminal: async (...args) => { try { await terminal(...args); } catch (error) { terminalErrors.push(error); throw error; } },
        createLifecycle: async options => new lifecycle.CloudRunLifecycle(owner, { ownerId: async () => owner,
          submit: transport.submitCloudRun, status: transport.getCloudRunStatus, list: transport.listCloudRuns,
          cancel: transport.cancelCloudRun, respond: transport.respondToCloudRun }, { ...options, intervalMs: 10, maxPolls: 2 }),
      });
      const api = { get ready() { return snapshot?.ready; }, prepare: input => binding.prepare(input), submit: id => binding.submit(id) };
      await binding.start();
      const state = () => store.getState();
      async function send(mode, { switchAfterUser = false, waitForLegacySave = true, content = 'Fixture plain chat', workspace, mutateSnapshot } = {}) {
        const submit = evaluate(`const ${parentSubmit}; exports.submit = submitCloudText;`, { ...dependencies, cloudRuns: api,
          supabase: browser, prepareCloudMediaCapture: async () => { throw Error('Attachment fixture not expected'); },
          cloudMediaDigest: async () => '',
          cloudExecutionMode: executionMode({ ownerId: owner, mode }, { id: owner }) }).submit;
        const notices = [];
        // Execute the actual ID capture, actual addMessage call and actual durable
        // branch. Context retrieval between these boundaries is deliberately fixed.
        const composer = evaluate(`exports.send = async () => { const ${composerSession}; const ${composerUser};
          await afterUser(requestSessionId, userMessageId); ${composerRoute}
          throw new Error('Unexpected legacy fallthrough'); };`, {
          ...dependencies, createNewSession: state().createNewSession, addMessage: state().addMessage, finalMessage: content,
          afterUser: async (sid, mid) => {
            if (waitForLegacySave) await until(() => jsonSQL(`select messages from public.chat_sessions where id=${quote(sid)}`)?.some(m => m.id === mid));
            if (switchAfterUser) state().createNewSession();
          },
          onCloudTextSubmit: async intent=>{const pending=submit(intent);if(mutateSnapshot)mutateSnapshot(intent);await pending;},
          isGuestMode: false, corporateMode: false, durableRoute: 'cloud',
          shouldUseCodeContext:workspace?.kind==='code',isCodingRequest:false,shouldRouteToCanvas:workspace?.kind==='canvas',
          images: [], documents: [],
          freshCanvasState:{isOpen:!!workspace,content:'stale store draft',codeLanguage:workspace?.language},
          freshestCanvasContent:workspace?.content ?? '',window:workspace ? {__arcaiLiveCanvasContent:workspace.content} : {},
          aiMessages: [{ role: 'user', content: workspace ? 'Legacy augmented prose must not reach model' : content }], wasSearchMode: false, shouldSearchForVideo: false,
          shouldForceCanvas: false, shouldForceCode: false, codeContextModelOverride: undefined, toast: value => notices.push(value),
          setLoading: () => {},
        }).send;
        await composer(); return { notices, snapshot };
      }
      const p = { store, state, binding, send, terminalErrors, get snapshot() { return snapshot; }, close: () => binding.dispose() };
      pages.push(p); return p;
    }
    for (const mode of ['ask', 'auto']) await t.test(`${mode}: explicit new session, close, real worker completes, recreate single reply`, async () => {
      const before = modelPosts.length, first = await page();
      const sent = await first.send(mode, { switchAfterUser: true }); assert.deepEqual(sent.notices, []);
      const submission = traffic.filter(x => x.action === 'submit').at(-1);
      assert.equal(submission.mode, mode); assert.notEqual(submission.sessionId, first.state().currentSessionId);
      assert.equal(typeof submission.userMessage.timestamp, 'string');
      first.close(); await finish(submission.id); assert.equal(modelPosts.length, before + 1);
      const reopened = await page();
      await until(() => reopened.state().chatSessions.some(s => s.id === submission.sessionId && s.messages.some(m => m.id === `cloud-${submission.id}`)));
      const session = reopened.state().chatSessions.find(s => s.id === submission.sessionId);
      assert.equal(session.messages.filter(m => m.id === submission.userMessage.id).length, 1);
      assert.equal(session.messages.filter(m => m.role === 'assistant').length, 1);
      assert.ok(session.messages.every(m => m.timestamp instanceof Date));
      await reopened.binding.restore(); await tick();
      assert.equal(reopened.state().chatSessions.find(s => s.id === session.id).messages.length, 2);
      assert.deepEqual(reopened.terminalErrors, []); reopened.close();
    });
    for(const kind of ['code','canvas']) await t.test(`${kind}: actual composer snapshot reaches model through endpoint and frozen SQL`,async()=>{
      const p=await page(),content=`Please revise this ${kind}`;
      const workspace={kind,content:`CURRENT LIVE ${kind}\n`+'preserve this exact line\n'.repeat(700),language:'typescript'};
      const before=modelPosts.length;
      const sent=await p.send('auto',{content,workspace,mutateSnapshot:intent=>{
        intent.workspaceContext.content='MUTATED DURING ASYNC PREPARE';intent.messages.at(-1).content='MUTATED USER';
      }});
      assert.deepEqual(sent.notices,[]);
      const submission=traffic.filter(x=>x.action==='submit').at(-1);
      assert.equal(submission.userMessage.content,content);
      assert.equal(submission.request.messages.at(-1).content,content);
      assert.equal(submission.request.workspace_context.content,workspace.content);
      p.close();await finish(submission.id);
      const userInput=modelPosts[before].input.find(item=>item.role==='user');
      assert.ok(userInput.content.startsWith(content));
      assert.ok(userInput.content.includes('untrusted user data'));
      const encoded=userInput.content.split('<arc_workspace_snapshot_json>\n')[1].split('\n</arc_workspace_snapshot_json>')[0];
      assert.equal(JSON.parse(encoded).content,workspace.content);
      assert.equal(JSON.stringify(modelPosts[before]).includes('Legacy augmented prose'),false);
      assert.equal(JSON.stringify(modelPosts[before]).includes('MUTATED DURING ASYNC PREPARE'),false);
      assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(submission.sessionId)}`)[0].content,content);
    });
    await t.test('actual parent mode selection never inherits Auto from another account', () => {
      assert.equal(executionMode(null, { id: owner }), 'ask');
      assert.equal(executionMode({ ownerId: owner, mode: 'auto' }, { id: owner }), 'auto');
      assert.equal(executionMode({ ownerId: owner, mode: 'auto' }, { id: randomUUID() }), 'ask');
      assert.equal(executionMode({ ownerId: owner, mode: 'auto' }, null), 'ask');
    });
    await t.test('actual composer captured content rejects an edit after preparation before submit', async () => {
      const p = await page();
      const prepare = p.state().prepareCloudSession;
      p.store.setState({ prepareCloudSession: async sid => {
        const receipt = await prepare(sid);
        const user = p.state().chatSessions.find(s => s.id === sid).messages.at(-1);
        // Real store mutation after its asynchronous preparation, before the
        // parent consumes the prepared receipt and re-reads the user message.
        p.state().editMessage(user.id, 'Edited while submission was preparing');
        return receipt;
      } });
      const before = traffic.filter(x => x.action === 'submit').length;
      const sent = await p.send('auto');
      assert.equal(sent.notices.length, 1);
      assert.match(sent.notices[0].description, /submitted message changed/);
      assert.equal(traffic.filter(x => x.action === 'submit').length, before);
      assert.equal(p.snapshot.entries.some(e => e.sessionId === p.state().currentSessionId), false);
      await tick(); p.close();
    });
    await t.test('two different chats finish independently with one owner coordinator', async () => {
      const p = await page(); await p.send('ask'); const a = traffic.filter(x => x.action === 'submit').at(-1);
      p.state().createNewSession(); await p.send('auto'); const b = traffic.filter(x => x.action === 'submit').at(-1);
      assert.notEqual(a.sessionId, b.sessionId); p.close(); await Promise.all([finish(a.id), finish(b.id)]);
      const restored = await page(); await until(() => restored.state().chatSessions.some(s => s.id === b.sessionId));
      for (const run of [a, b]) assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(run.sessionId)}`).filter(m => m.role === 'assistant').length, 1);
      restored.close();
    });
    await t.test('lost HTTP acknowledgement: actual composer returns without fallback; recreate discovers same run', async () => {
      const before = traffic.filter(x => x.action === 'submit').length, p = await page(); dropNextSubmit = true;
      const sent = await p.send('auto'); assert.equal(sent.notices.length, 1);
      const run = traffic.filter(x => x.action === 'submit').at(-1); assert.ok(dropped.has(run.id));
      assert.equal(p.snapshot.entries.find(e => e.id === run.id).connection, 'uncertain');
      p.close(); await finish(run.id); const restored = await page();
      await until(() => restored.state().chatSessions.some(s => s.id === run.sessionId));
      assert.equal(traffic.filter(x => x.action === 'submit').length, before + 1);
      assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(run.sessionId)}`).length, 2); restored.close();
    });
    await t.test('late browser whole-array save cannot erase server completion', async () => {
      // Independent stale tab: the submitting tab cannot wait on another tab's
      // in-memory saves. The database still has to fence its delayed overwrite.
      const p = await page(), stale = await page(), sid = randomUUID();
      const first = { id: randomUUID(), role: 'user', type: 'text', content: 'Existing', timestamp: new Date().toISOString() };
      sql(`insert into public.chat_sessions(id,user_id,title,messages) values(${quote(sid)},${quote(owner)},'Stale tab',${literal([first])})`);
      for (const tab of [p, stale]) tab.store.setState({ currentSessionId: sid, messages: [first], chatSessions: [{
        id: sid, title: 'Stale tab', messages: [first], isHydrated: true, createdAt: new Date(), lastMessageAt: new Date(),
      }] });
      let release; holdLegacyWrite = new Promise(resolve => { release = resolve; });
      holdLegacyPredicate = value => value.messages.length === 1;
      const lateSave = stale.state().saveChatToSupabase(stale.state().chatSessions[0]).then(() => null, error => error);
      await tick();
      try {
        const sent = await p.send('ask', { waitForLegacySave: false });
        assert.deepEqual(sent.notices, []);
        const run = traffic.filter(x => x.action === 'submit').at(-1); p.close(); await finish(run.id);
        release(); const error = await lateSave;
        assert.equal(error.code, '42501');
        assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(run.sessionId)}`).filter(m => m.id === `cloud-${run.id}`).length, 1);
        assert.equal(stale.state().isOnline, true, 'A safe database rejection is not a network outage');
        assert.match(stale.state().sessionSaveErrors[sid], /stale save.*Reload/);
      } finally { holdLegacyWrite = null; holdLegacyPredicate = () => true; release(); await lateSave; p.close(); stale.close(); }
    });
    for (const mode of ['ask', 'auto']) await t.test(`${mode}: real tool policy survives close; exact approval only in Ask`, async () => {
      const p = await page(), previousTools = executedTools.length;
      const sent = await p.send(mode, { content: 'Fixture tool request' }); assert.deepEqual(sent.notices, []);
      const run = traffic.filter(x => x.action === 'submit').at(-1); p.close();
      for (let i = 0; i < 3; i++) await worker.processCloudRun(run.id, { store: workerStore, provider: model, tools });
      if (mode === 'ask') {
        assert.equal(executedTools.length, previousTools);
        const restored = await page();
        await until(() => restored.snapshot.entries.find(e => e.id === run.id)?.run?.status === 'awaiting_input');
        const pending = restored.snapshot.entries.find(e => e.id === run.id).run.checkpoint.pendingApproval;
        assert.equal(pending.callId, 'call_fixture'); assert.ok(pending.argumentsHash);
        await assert.rejects(transport.respondToCloudRun(run.id, 'yes'), e => e.httpStatus === 409);
        await assert.rejects(transport.respondToCloudRun(run.id, { decision: 'approve', callId: pending.callId, argumentsHash: '0'.repeat(64) }), e => e.httpStatus === 409);
        await restored.binding.respond(run.id, { decision: 'approve', callId: pending.callId, argumentsHash: pending.argumentsHash });
        restored.close();
      } else assert.equal(executedTools.length, previousTools + 1);
      await finish(run.id);
      assert.equal(executedTools.length, previousTools + 1);
      assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(run.sessionId)}`).filter(m => m.role === 'assistant').length, 1);
    });
    await t.test('submission waits for existing legacy save then queues exactly once', async () => {
      const p = await page(), sid = randomUUID();
      const first = { id: randomUUID(), role: 'user', type: 'text', content: 'Existing history', timestamp: new Date().toISOString() };
      sql(`insert into public.chat_sessions(id,user_id,title,messages) values(${quote(sid)},${quote(owner)},'Legacy',${literal([first])})`);
      p.store.setState({ currentSessionId: sid, messages: [first], chatSessions: [{ id: sid, title: 'Legacy', messages: [first],
        isHydrated: true, createdAt: new Date(), lastMessageAt: new Date() }] });
      const submits = traffic.filter(x => x.action === 'submit').length;
      let release; holdLegacyWrite = new Promise(resolve => { release = resolve; });
      try {
        const sending = p.send('ask', { waitForLegacySave: false });
        await tick();
        assert.equal(traffic.filter(x => x.action === 'submit').length, submits);
        release(); const sent = await sending;
        assert.deepEqual(sent.notices, []);
        assert.equal(traffic.filter(x => x.action === 'submit').length, submits + 1);
        const run = traffic.filter(x => x.action === 'submit').at(-1);
        assert.equal(run.sessionId, sid); p.close(); await finish(run.id);
        assert.equal(jsonSQL(`select messages from public.chat_sessions where id=${quote(sid)}`).filter(m => m.role === 'assistant').length, 1);
        assert.equal(dbCalls.filter(c => c.table === 'chat_sessions' && c.upsert && c.value.id === sid).length, 1);
      } finally { holdLegacyWrite = null; release(); await tick(); p.close(); }
    });
    await t.test('actual status list exposes history recovery beyond the first bounded page', async () => {
      const sid = randomUUID();
      sql(`insert into public.chat_sessions(id,user_id,title,messages) values(${quote(sid)},${quote(owner)},'History', '[]')`);
      for (let i = 0; i < 26; i++) {
        const id = i === 25 ? 'ffffffff-ffff-4fff-8fff-ffffffffffff' : `00000000-0000-4000-8000-${String(8000 + i).padStart(12, '0')}`;
        sql(`insert into public.cloud_runs(id,user_id,session_id,mode,kind,status,request) values(${quote(id)},${quote(owner)},${quote(sid)},'ask','chat','completed','{}')`);
      }
      const p = await page();
      const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      assert.equal(p.snapshot.entries.some(e => e.id === missing), false);
      assert.ok(p.snapshot.historyCursor); assert.equal(p.snapshot.activeCursor, null);
      await p.binding.restore(); assert.equal(p.snapshot.entries.some(e => e.id === missing), false, 'Focus/restore repeats the same page');
      const React = require('react');
      const { CloudRunList } = evaluate(read('src/components/CloudRunList.tsx'), {}, {
        react: React, 'react/jsx-runtime': require('react/jsx-runtime'), './CloudRunStatus': { CloudRunStatus: () => null },
      }, 'fixture.tsx');
      const html = require('react-dom/server').renderToString(React.createElement(CloudRunList, { sessionId: sid,
        cloud: { ...p.snapshot, entries: [], restore: () => p.binding.restore(), loadMore: (...args) => p.binding.loadMore(...args) } }));
      assert.match(html, /Recover older cloud replies/, 'History cursor exposes the recovery control');
      await p.binding.loadMore(p.snapshot.historyCursor, true);
      assert.equal(p.snapshot.entries.some(e => e.id === missing), true, 'Transport can recover it when history pagination is explicitly requested');
      p.close();
    });
    assert.equal(traffic.some(x => x.action === 'cancel'), false);
    t.diagnostic(`Isolated PostgreSQL retained at ${directory}; stopped after test. No production connections.`);
  } finally {
    for (const page of pages) page.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'pipe' });
  }
});
