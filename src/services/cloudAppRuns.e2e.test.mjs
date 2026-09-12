// Local integration: real PostgreSQL migrations/RPCs, client lifecycle and app
// worker/engine. Only auth transport and model responses are fixtures. No TCP,
// production connection, paid request, or deployment. Closing destroys the client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import ts from 'typescript';

const modules = new Map();
function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let js = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const ast = ts.createSourceFile('module.js', js, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const imports = ast.statements.filter(ts.isImportDeclaration).filter(node => node.moduleSpecifier.text.startsWith('.'));
  for (const node of imports.reverse()) {
    const path = node.moduleSpecifier.text;
    const child = new URL(path.endsWith('.ts') ? path : `${path}.ts`, url);
    js = js.slice(0, node.moduleSpecifier.getStart(ast)) + JSON.stringify(moduleURL(child)) + js.slice(node.moduleSpecifier.end);
  }
  const data = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  modules.set(url.href, data); return data;
}
const load = path => import(moduleURL(new URL(path, import.meta.url)));

test('saved project -> app submit -> close -> real worker versions -> reopen authoritative reload; Ask approval', async () => {
  const { CloudAppRuns } = await load('./cloudAppRuns.ts');
  const { CloudRunLifecycle } = await load('./cloudRunLifecycle.ts');
  const { CloudAppProjectPersistence } = await load('./cloudAppProjects.ts');
  const { advanceCloudAppRun } = await load('../../supabase/functions/_shared/cloudAppRuntime.ts');
  const { cloudAppPersistence } = await load('../../supabase/functions/_shared/cloudAppPersistence.ts');
  const { cloudWorkerStore } = await load('../../supabase/functions/_shared/cloudRunStore.ts');
  const { authorizeCloudAppSubmission } = await load('../../supabase/functions/_shared/cloudAppIngress.ts');
  const bin = '/opt/homebrew/opt/postgresql@17/bin';
  const directory = mkdtempSync('/tmp/arc-app-e2e-');
  const socket = `${directory}/socket`, data = `${directory}/data`;
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, PGHOST: socket, PGPORT: '55443', PGUSER: 'postgres', PGDATABASE: 'postgres' };
  delete env.PGPASSWORD;
  const sql = query => execFileSync(`${bin}/psql`, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { env, input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const json = value => `${quote(JSON.stringify(value))}::jsonb`;
  let started = false;
  try {
    execFileSync(`${bin}/initdb`, ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'], { env, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', data, '-l', `${directory}/postgres.log`, '-o', `-k ${socket} -p 55443 -h '' -c unix_socket_permissions=0700`, '-w', 'start'], { env, stdio: 'pipe' });
    started = true; assert.equal(sql('show listen_addresses'), '');
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create function auth.jwt() returns jsonb language sql stable as 'select jsonb_build_object(''role'',current_setting(''request.jwt.claim.role'',true))';
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
    const migration = name => sql(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    for (const name of ['20250830192630_47cf40bc-2d2c-42a2-9541-f810ada41674.sql', '20251106031256_36740d06-a7da-482d-b3a6-886314af7b52.sql',
      '20260102064547_8daccd8e-e346-40d4-a197-fe6140d93084.sql', '20260529020858_177f2e15-3416-48d7-b030-2aa0dc2c81b9.sql',
      '20260310120000_add_ide_projects.sql', '20260312022706_9680e92b-7530-4c35-9e61-e6635685fedc.sql']) migration(name);
    sql(`create table public.admin_users(user_id uuid primary key);
      create table public.subscriptions(user_id uuid, price_id text,status text,stripe_subscription_id text,current_period_end timestamptz);
      create unique index chat_sessions_id_user_id_cloud_runs_key on public.chat_sessions(id,user_id);`);
    for (const name of ['20260828213000_expire_admin_boost_grants.sql', '20260912085941_durable_cloud_runs.sql', '20260912100349_durable_cloud_app_versions.sql']) migration(name);
    const owner = '00000000-0000-4000-8000-000000000001', projectId = '00000000-0000-4000-8000-000000000002', sessionId = '00000000-0000-4000-8000-000000000003';
    const initial = { files: { 'src/App.tsx': { content: 'initial', language: 'tsx' } }, messages: [] };
    sql(`insert into auth.users(id,email) values (${quote(owner)},'fixture@example.invalid'); insert into public.admin_users values (${quote(owner)});`);
    const authenticated = query => sql(`set role authenticated; set request.jwt.claim.sub=${quote(owner)}; ${query}`);
    const service = query => sql(`set role service_role; set request.jwt.claim.role='service_role'; ${query}`);
    const row = (table, id) => JSON.parse(service(`select to_jsonb(t) from public.${table} t where id=${quote(id)}`) || 'null');
    const rpc = async (name, args) => {
      const values = Object.entries(args).map(([key, value]) => `${key} => ${value === null ? 'null' : typeof value === 'object' ? json(value) : typeof value === 'number' ? value : quote(value)}`).join(',');
      try { return { data: JSON.parse(service(name === 'claim_cloud_run'
        ? `select coalesce(jsonb_agg(t),'[]') from public.${name}(${values}) t`
        : `select to_jsonb(public.${name}(${values}))`)), error: null }; }
      catch (error) { throw new Error(error.stderr?.toString() || error.message); }
    };
    const db = { rpc, from: table => {
      const filters = [];
      const query = { select: () => query, eq: (key, value) => { filters.push(`${key}=${quote(value)}`); return query; },
        maybeSingle: async () => ({ data: JSON.parse(service(`select to_jsonb(t) from public.${table} t where ${filters.join(' and ')}`) || 'null'), error: null }) };
      return query;
    } };
    let cancels = 0, submissions = 0, modelStarts = 0, reloaded, publishedRun, journal;
    const publicRun = id => { const r = row('cloud_runs', id); return { id, projectId: r.request.projectId, status: r.status,
      checkpoint: { pendingApproval: r.checkpoint.pendingApproval ?? null }, result: r.result }; };
    const persistence = () => new CloudAppProjectPersistence(owner, projectId, 0, {
      ownerId: async () => owner, persist: value => { journal = value; },
      read: async (id, user) => JSON.parse(authenticated(`select to_jsonb(t) from public.ide_projects t where id=${quote(id)} and user_id=${quote(user)}`)),
      save: async () => { throw Error('Unexpected manual save'); },
    }, journal);
    let projectClient = persistence();
    const makeClient = () => new CloudAppRuns(owner, projectId, true, {
      ownerId: async () => owner,
      lifecycle: async onChange => new CloudRunLifecycle(owner, {
        ownerId: async () => owner,
        submit: async input => {
          submissions++;
          await authorizeCloudAppSubmission({ enabled: true, ownerId: owner, sessionId: input.sessionId, request: input.request }, {
            session: async id => row('chat_sessions', id), project: async id => row('ide_projects', id), boost: async () => true,
          });
          assert.equal(input.request.currentFiles, undefined);
          assert.equal(row('chat_sessions', sessionId).messages.length, 0, 'no separately saved user turn');
          await rpc('submit_cloud_run', { p_run_id: input.id, p_user_id: owner, p_session_id: input.sessionId, p_kind: input.kind,
            p_mode: input.mode, p_request: input.request, p_user_message: input.userMessage, p_expected_revision: input.expectedRevision });
          publishedRun = input.id; return publicRun(input.id);
        },
        status: async id => publicRun(id),
        list: async () => ({ runs: publishedRun ? [{ ...publicRun(publishedRun), sessionId, kind: 'app', mode: row('cloud_runs', publishedRun).mode }] : [], nextCursor: null }),
        cancel: async () => { cancels++; throw Error('Close must never cancel'); },
        respond: async (id, response) => {
          const r = row('cloud_runs', id);
          assert.equal(response.callId, r.checkpoint.pendingApproval.callId);
          assert.equal(response.argumentsHash, r.checkpoint.pendingApproval.argumentsHash);
          await rpc('resume_cloud_run', { p_run_id: id, p_user_id: owner, p_expected_updated_at: r.updated_at,
            p_user_message: { id: crypto.randomUUID(), role: 'user', content: 'Approve', timestamp: new Date().toISOString() }, p_input_response: response });
          return publicRun(id);
        },
      }, { onChange, intervalMs: 1, maxPolls: 1 }),
      prepareProject: async snapshot => {
        authenticated(`insert into public.ide_projects(id,user_id,files,messages,versions) values(${quote(projectId)},${quote(owner)},${json(snapshot.files)},'[]','{"app_db":{"keep":true}}')`);
        assert.equal((await projectClient.reload()).status, 'reloaded');
      },
      prepareSession: async () => {
        authenticated(`insert into public.chat_sessions(id,user_id,title,messages) values(${quote(sessionId)},${quote(owner)},'app','[]')`);
        return { id: sessionId, revision: 0 };
      },
      reconcile: async (run, signal) => {
        assert.equal(run.projectId, projectId);
        reloaded = await projectClient.reload(signal);
        return reloaded;
      }, remember: () => {},
    }, () => {});
    let client = makeClient();
    await client.start('Build my app', 'ask', initial);
    const id = publishedRun;
    client.close(); client = null; // Simulated closed browser: no client observation remains.
    assert.equal(cancels, 0); assert.equal(submissions, 1);
    assert.equal(row('chat_sessions', sessionId).messages.length, 1);
    const advance = () => advanceCloudAppRun(id, {
      store: cloudWorkerStore(db), app: cloudAppPersistence(db), context: async () => ({ instructions: 'Fixture Arc personality' }),
      provider: () => ({ startModel: async () => `model_${++modelStarts}`,
        pollModel: async responseId => responseId === 'model_1' ? {
          calls: [{ id: 'write-one', name: 'apply_app_files', arguments: JSON.stringify({ expectedVersion: 0, writes: [{ path: 'src/App.tsx', content: 'worker published', language: 'tsx' }], deletes: [] }) }], text: '', outputItems: [], tokens: 1,
        } : { calls: [], text: 'Ready; not executed or deployed.', outputItems: [], tokens: 1 },
        cancelModel: async () => { throw Error('Unexpected provider cancellation'); },
      }),
    });
    for (let i = 0; i < 12 && row('cloud_runs', id).status !== 'awaiting_input'; i++) await advance();
    assert.equal(row('cloud_runs', id).status, 'awaiting_input');
    assert.equal(row('ide_projects', projectId).files['src/App.tsx'].content, 'initial');
    // Reopen, discover exact pending call, approve, then close again.
    client = makeClient(); await client.restore();
    assert.equal(client.snapshot().entry.run.projectId, projectId);
    await client.decide('approve'); client.close(); client = null;
    for (let i = 0; i < 15 && row('cloud_runs', id).status !== 'completed'; i++) await advance();
    assert.equal(row('cloud_runs', id).status, 'completed');
    assert.equal(service(`select count(*) from public.cloud_app_versions where run_id=${quote(id)}`), '2');
    assert.equal(row('ide_projects', projectId).versions.app_db.keep, true);
    projectClient = persistence(); // Reconstruct owner-scoped journal after refresh.
    client = makeClient(); await client.restore();
    for (let i = 0; i < 10 && !reloaded; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(reloaded.status, 'reloaded');
    assert.equal(reloaded.project.files['src/App.tsx'].content, 'worker published');
    assert.equal(typeof reloaded.project.messages[0].timestamp, 'number');
    assert.equal(reloaded.project.messages.length, 2);
    assert.equal(submissions, 1); assert.equal(cancels, 0); assert.equal(modelStarts, 2);
    client.close();
  } finally {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'pipe' });
  }
});
