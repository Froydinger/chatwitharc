// Runs the actual migration and existing claim SQL in an isolated Postgres WASM
// instance; net.http_post is a recording stub, so no production HTTP is sent.
// Install a test-only runner outside the app:
// npm install --prefix /tmp/arc-db-tests @electric-sql/pglite@0.5.8
// TEST_PGLITE_MODULE=/tmp/arc-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/idleWorkerWakeups.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.TEST_PGLITE_MODULE;
const { PGlite } = await import(moduleName ? pathToFileURL(moduleName).href : '@electric-sql/pglite');
const db = new PGlite();
const readMigration = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
const id = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
const functionsFrom = async (file, names) => {
  const source = await readMigration(file);
  for (const name of names) {
    const start = source.search(new RegExp(`create(?: or replace)? function public\\.${name}\\(`, 'i'));
    assert.ok(start >= 0, name);
    const sql = source.slice(start);
    const delimiter = sql.match(/as\s+(\$[a-z_]*\$)/i)[1];
    const bodyStart = sql.indexOf(delimiter);
    const end = sql.indexOf(delimiter, bodyStart + delimiter.length) + delimiter.length;
    await db.exec(sql.slice(0, end) + ';');
  }
};
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema vault; create schema net;
  create table auth.users(id uuid primary key);
  create table vault.decrypted_secrets(name text, decrypted_secret text);
  insert into vault.decrypted_secrets values
    ('scheduled_tasks_cron_secret','test-only-scheduler'),('content_review_cron_secret','test-only-cleanup');
  create table net.requests(url text, headers jsonb, body jsonb, timeout_milliseconds integer);
  create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
  returns bigint language plpgsql as $$ begin
    insert into net.requests values(url,headers,body,timeout_milliseconds); return 1;
  end $$;
  create table public.profiles(user_id uuid primary key);
  create table public.cloud_runs(id uuid primary key,session_id uuid,user_id uuid,status text,
    lease_expires_at timestamptz,session_sequence integer,updated_at timestamptz default now(),mode text,result jsonb);
  create table public.scheduled_tasks(id integer,status text,next_run_at timestamptz);
  create table public.cloud_scheduled_outbox(state text,lease_expires_at timestamptz);
  create table public.browserbase_sessions(session_handle uuid primary key,user_id uuid,
    provider_session_id text,settled_at timestamptz,status text,expires_at timestamptz,updated_at timestamptz);
  insert into auth.users values('${user}'); insert into public.profiles values('${user}');
`);
await functionsFrom('20260912085941_durable_cloud_runs', ['list_claimable_cloud_runs']);
await db.exec(await readMigration('20260912113905_cloud_run_completion_email_notifications'));
await db.exec(await readMigration('20260912170000_cloud_run_completion_push_notifications'));
await functionsFrom('20260928234345_browserbase_idle_timeout', ['touch_browserbase_session', 'claim_idle_browserbase_sessions']);
const migration = await readMigration('20261009220000_gate_idle_worker_wakeups');
assert.doesNotMatch(migration, /cron\.(un)?schedule\s*\(/i, 'Minute schedules and legacy scheduler remain unchanged');
await db.exec(migration);
await db.exec(migration); // Repeat deploy is safe.
const reset = () => db.exec('truncate net.requests,public.cloud_run_email_outbox,public.cloud_run_push_outbox,public.cloud_runs,public.scheduled_tasks,public.cloud_scheduled_outbox,public.browserbase_sessions cascade');
const invoke = name => db.exec(`select public.${name}()`);
const count = () => scalar('select count(*)::int from net.requests');
const run = (status, lease = 'null', sequence = 1, runId = id) => db.exec(`insert into public.cloud_runs(id,session_id,user_id,status,lease_expires_at,session_sequence,mode,result) values('${runId}','${session}','${user}','${status}',${lease},${sequence},'chat','{}')`);
let cases = 0;
async function check(name, fn) { await reset(); await fn(); cases++; console.log(`PASS ${name}`); }
await check('Idle ticks send zero HTTP requests, even with no configured secrets', async () => {
  await db.exec('delete from vault.decrypted_secrets');
  for (const fn of ['invoke_cloud_worker','invoke_run_scheduled_tasks','invoke_browserbase_cleanup']) await invoke(fn);
  assert.equal(await count(), 0);
  await db.exec("insert into vault.decrypted_secrets values ('scheduled_tasks_cron_secret','test-only-scheduler'),('content_review_cron_secret','test-only-cleanup')");
});
await check('Due cloud work wakes from database with no app open', async () => {
  await run('queued'); await invoke('invoke_cloud_worker'); assert.equal(await count(), 1);
  const req = (await db.query('select * from net.requests')).rows[0];
  assert.ok(req.url.endsWith('/cloud-worker')); assert.equal(req.headers.Authorization, 'Bearer test-only-scheduler');
  assert.equal(req.timeout_milliseconds, 55000);
});
for (const [status, lease, expected] of [
  ['running', "now()-interval '1 minute'", 1], ['running', "now()+interval '1 minute'", 0],
  ['running', 'null', 0], ['completed', 'null', 0], ['awaiting_input', 'null', 0], ['failed', 'null', 0],
]) await check(`Cloud run ${status}/${lease} wakes ${expected}`, async () => {
  await run(status, lease); await invoke('invoke_cloud_worker'); assert.equal(await count(), expected);
});
await check('Queued follower behind paused head is not claimable', async () => {
  await run('awaiting_input'); await run('queued', 'null', 2, '00000000-0000-4000-8000-000000000004');
  await invoke('invoke_cloud_worker'); assert.equal(await count(), 0);
});
for (const channel of ['email','push']) {
  for (const [state, lease, expected] of [
    ['ready', 'null', 1], ['ready', "now()+interval '1 minute'", 0],
    ['sending', 'null', 1], ['sending', "now()-interval '1 minute'", 1], ['sending', "now()+interval '1 minute'", 0],
    ['sent','null',0], ['cancelled','null',0], ['recovery_required','null',0],
  ]) await check(`${channel} outbox ${state}/${lease} wakes ${expected}`, async () => {
    await run('completed');
    await db.exec(`insert into public.cloud_run_${channel}_outbox(run_id,user_id,state,lease_expires_at) values('${id}','${user}','${state}',${lease})`);
    await invoke('invoke_cloud_worker'); assert.equal(await count(), expected);
    if (state === 'sending' && expected) {
      assert.equal(await scalar(`select public.claim_cloud_run_${channel}()`), null);
      assert.equal(await scalar(`select state from public.cloud_run_${channel}_outbox`), 'recovery_required');
      await db.exec('truncate net.requests'); await invoke('invoke_cloud_worker'); assert.equal(await count(), 0);
    }
  });
  await check(`${channel} completion claim/receipt prevents duplicate delivery`, async () => {
    await run('running', "now()-interval '1 minute'");
    await db.exec(`update public.cloud_runs set status='completed' where id='${id}'`);
    const delivery = await scalar(`select public.claim_cloud_run_${channel}()`);
    assert.ok(delivery.lease_token); assert.equal(await scalar(`select public.claim_cloud_run_${channel}()`), null);
    const finished = await scalar(`select public.finish_cloud_run_${channel}('${delivery.id}','${user}','${delivery.lease_token}','{"accepted":true,"id":"fixture-receipt"}')`);
    assert.equal(finished, true); assert.equal(await scalar(`select public.claim_cloud_run_${channel}()`), null);
  });
}
for (const [status, date, expected] of [
  ['active', "now()-interval '1 minute'", 1], ['active', "now()+interval '1 minute'", 0],
  ['active', 'null', 0], ['paused', "now()-interval '1 minute'", 0], ['completed', "now()-interval '1 minute'", 0],
]) await check(`Scheduled task ${status}/${date} wakes ${expected}`, async () => {
  await db.exec(`insert into public.scheduled_tasks values(1,'${status}',${date})`);
  await invoke('invoke_run_scheduled_tasks'); assert.equal(await count(), expected);
  // Runtime flags are outside SQL: retain the optional worker wake if it was
  // already enabled, without changing either dispatcher or its configuration.
  await invoke('invoke_cloud_worker'); assert.equal(await count(), expected * 2);
});
for (const [state, lease, expected] of [
  ['ready','null',1], ['ready',"now()+interval '1 minute'",0],
  ['sending','null',1], ['sending',"now()-interval '1 minute'",1], ['sending',"now()+interval '1 minute'",0],
  ['sent','null',0], ['cancelled','null',0], ['recovery_required','null',0],
]) await check(`Optional durable scheduled outbox ${state}/${lease} wakes ${expected}`, async () => {
  await db.exec(`insert into public.cloud_scheduled_outbox values('${state}',${lease})`);
  await invoke('invoke_cloud_worker'); assert.equal(await count(), expected);
});
const browser = async (status, { expired = false, idle = true, provider = true, settled = false } = {}) => db.exec(`
  insert into public.browserbase_sessions values('${id}','${user}',${provider ? "'provider-fixture'" : 'null'},${settled ? 'now()' : 'null'},'${status}',
  now()${expired ? '-' : '+'}interval '1 minute',now()-interval '${idle ? 6 : 1} minutes')`);
for (const [status, options, expected] of [
  ['agent_running', {}, 1], ['handed_back', {}, 1], ['agent_running', {idle:false}, 0],
  ['user_control', {}, 0], ['user_control', {expired:true}, 1], ['release_requested', {idle:false}, 1],
  ['agent_running', {provider:false}, 0], ['release_requested', {settled:true}, 0], ['provisioning', {}, 0],
]) await check(`Browser ${status}/${JSON.stringify(options)} wakes ${expected}`, async () => {
  await browser(status, options); await invoke('invoke_browserbase_cleanup'); assert.equal(await count(), expected);
  assert.equal((await db.query('select * from public.claim_idle_browserbase_sessions()')).rows.length, expected);
});
await check('User control acquired after wakeup is protected by atomic claim recheck', async () => {
  await browser('agent_running'); await invoke('invoke_browserbase_cleanup'); assert.equal(await count(), 1);
  await db.exec("update public.browserbase_sessions set status='user_control',updated_at=now()");
  assert.equal((await db.query('select * from public.claim_idle_browserbase_sessions()')).rows.length, 0);
  assert.equal(await scalar('select status from public.browserbase_sessions'), 'user_control');
});
await check('Activity after wakeup prevents stale idle claim', async () => {
  await browser('agent_running'); await invoke('invoke_browserbase_cleanup');
  await db.exec('update public.browserbase_sessions set updated_at=now()');
  assert.equal((await db.query('select * from public.claim_idle_browserbase_sessions()')).rows.length, 0);
});
for (const fn of ['invoke_cloud_worker','invoke_run_scheduled_tasks','invoke_browserbase_cleanup']) {
  assert.equal(await scalar(`select has_function_privilege('anon','public.${fn}()','execute')`), false);
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.${fn}()','execute')`), false);
}
await reset();
await db.exec(await readFile(new URL('../../docs/qa/idle-worker-wakeups-rollback.sql', import.meta.url), 'utf8'));
for (const fn of ['invoke_cloud_worker','invoke_run_scheduled_tasks','invoke_browserbase_cleanup']) await invoke(fn);
assert.equal(await count(), 3, 'Rollback restores all three original unconditional HTTP wakeups');
console.log(`Passed ${cases} database execution scenarios plus executable rollback; no production calls. Realtime/network and cross-connection locking require integration verification.`);
await db.close();
