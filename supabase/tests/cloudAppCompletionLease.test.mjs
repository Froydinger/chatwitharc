// Execute the real cloud_app_step and complete_cloud_run PL/pgSQL in disposable
// Postgres WASM. No production connection, model, email, or HTTP requests.
// npm install --prefix /tmp/arc-db-tests --ignore-scripts @electric-sql/pglite@0.5.8
// TEST_PGLITE_MODULE=/tmp/arc-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/cloudAppCompletionLease.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const location = process.env.TEST_PGLITE_MODULE;
const { PGlite } = await import(location ? pathToFileURL(location).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const run = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
const project = '00000000-0000-4000-8000-000000000004';
const lease = '00000000-0000-4000-8000-000000000005';
const foreignLease = '00000000-0000-4000-8000-000000000006';
const oldRaise = "raise exception 'Completion lease expired' using errcode='40001';";
const newRaise = "raise exception 'Completion lease expired' using errcode='PT409';";
const read = async query => (await db.query(query)).rows;
const scalar = async query => Object.values((await read(query))[0])[0];
const definition = () => scalar("select pg_get_functiondef('public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure)");
const permissions = () => read("select p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) owner from pg_proc p where p.oid='public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure");
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.chat_sessions(id uuid primary key,user_id uuid,messages jsonb,persistence_version integer default 0);
create table public.cloud_runs(id uuid primary key,session_id uuid,user_id uuid,kind text,status text,
  lease_token uuid,lease_expires_at timestamptz,request jsonb,checkpoint jsonb,submission_message jsonb,
  result jsonb,error text,assistant_message_id text);
create table public.ide_projects(id uuid primary key,user_id uuid,files jsonb,messages jsonb,
  cloud_revision bigint default 0,cloud_managed boolean default true,title text,prompt text,versions jsonb);
create table public.cloud_app_workspaces(run_id uuid primary key,project_id uuid,user_id uuid,base_revision bigint,version integer default 0);
create table public.cloud_app_versions(run_id uuid,version integer,user_id uuid,files jsonb,receipt_key text,call jsonb,primary key(run_id,version));
create table public.cloud_app_publications(run_id uuid,status text,url text,netlify_url text);
create function public.user_has_boost(uuid) returns boolean language sql as $$ select true $$;
-- A sequence is deliberately nontransactional so a rejected transaction still
-- proves that exactly one IDE write was attempted. This is test-only instrumentation.
create sequence public.ide_write_attempts;
create function public.expire_completion_fixture() returns trigger language plpgsql as $$
begin
  perform nextval('public.ide_write_attempts');
  if current_setting('test.completion_failure',true)='expire' then
    update public.cloud_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${run}';
  elsif current_setting('test.completion_failure',true)='replace' then
    update public.cloud_runs set lease_token='${foreignLease}' where id='${run}';
  end if;
  return new;
end $$;
create trigger expire_completion_fixture before update of files,messages on public.ide_projects
  for each row execute function public.expire_completion_fixture();
grant select,insert,update,delete on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
`);
const runSql = await migration('20260912085941_durable_cloud_runs');
const start = runSql.indexOf('create function public.complete_cloud_run(');
const completionSql = runSql.slice(start, runSql.indexOf('$$;', start) + 3);
await db.exec(completionSql);
await db.exec(await migration('20260926031500_fix_cloud_app_worker_permissions'));
const original = await definition();
assert.equal(original.split(oldRaise).length - 1, 1, 'fixture reproduces the deployed Sept26 regression');
const originalPermissions = await permissions();
const fixture = async (mode = 'none', expiry = "clock_timestamp()+interval '10 minutes'") => {
  await db.exec(`reset role;
    truncate public.cloud_app_publications,public.cloud_app_versions,public.cloud_app_workspaces,public.ide_projects,public.cloud_runs,public.chat_sessions;
    alter sequence public.ide_write_attempts restart with 1;
    select set_config('test.completion_failure','${mode}',false);
    insert into public.chat_sessions values('${session}','${owner}','[{"id":"old-chat","role":"user","content":"Keep chat"}]',0);
    insert into public.ide_projects(id,user_id,files,messages,title,prompt,versions) values('${project}','${owner}',
      '{"src/App.tsx":{"content":"old","language":"tsx"}}','[{"id":"old-ide","role":"user","content":"Keep IDE"}]','Fixture app','Build fixture',
      '{"app_users":[{"name":"keep"}],"app_db":{"keep":1},"deploy":{"keep":true}}');
    insert into public.cloud_runs(id,session_id,user_id,kind,status,lease_token,lease_expires_at,request,checkpoint,submission_message)
      values('${run}','${session}','${owner}','app','running','${lease}',${expiry},
      '{"projectId":"${project}","messages":[{"role":"user","content":"Build fixture"}]}','{"engine":{"phase":"done"}}',
      '{"id":"new-user","role":"user","content":"New request","timestamp":"2026-10-10T00:00:00Z"}');
    insert into public.cloud_app_workspaces values('${run}','${project}','${owner}',0,1);
    insert into public.cloud_app_versions(run_id,version,user_id,files) values('${run}',1,'${owner}',
      '{"src/App.tsx":{"content":"new","language":"tsx"}}');
    set role service_role;
  `);
};
const snapshot = async () => ({
  project: await read('select * from public.ide_projects'), run: await read('select * from public.cloud_runs'),
  chat: await read('select * from public.chat_sessions'), versions: await read('select * from public.cloud_app_versions'),
});
const complete = async (token = lease) => (await db.query(`select public.cloud_app_step($1::uuid,$2::uuid,'complete',null,null,'{"ok":true}'::jsonb,
  '{"content":"Finished fixture","timestamp":"2026-10-10T00:00:01Z"}'::jsonb) receipt`, [run,token])).rows[0].receipt;
const attempts = async () => (await read('select last_value,is_called from public.ide_write_attempts'))[0];
let scenarios = 0;
const scenario = async (name, fn) => { await fn(); scenarios++; console.log(`PASS ${name}`); };
await scenario('Prepatch fixture reproduces deterministic 40001 and rolls back preceding writes', async () => {
  await fixture('expire'); const before = await snapshot();
  await assert.rejects(complete(), error => error.code === '40001' && error.message === 'Completion lease expired');
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await attempts(), {last_value:1,is_called:true});
});
await db.exec('reset role');
const patch = await migration('20261010021134_cloud_app_completion_lease_conflict');
await db.exec(patch);
assert.equal(await definition(), original.replace(oldRaise,newRaise), 'only the intended deterministic exception changes');
assert.deepEqual(await permissions(), originalPermissions, 'owner, grants, invoker and search_path are unchanged');
await db.exec(patch);
assert.equal(await definition(), original.replace(oldRaise,newRaise), 'reapplying is a no-op');
await scenario('Expiry between IDE update and real completion raises one PT409; all writes roll back', async () => {
  await fixture('expire'); const before = await snapshot();
  await assert.rejects(complete(), error => error.code === 'PT409' && error.message === 'Completion lease expired');
  assert.deepEqual(await snapshot(), before, 'IDE files/history, chat history, run state and fixture lease mutation roll back');
  assert.deepEqual(await attempts(), {last_value:1,is_called:true}, 'one SQL invocation attempted one preceding IDE write');
});
await scenario('Lease-token replacement at completion also raises PT409 with full rollback', async () => {
  await fixture('replace'); const before = await snapshot();
  await assert.rejects(complete(), error => error.code === 'PT409');
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await attempts(), {last_value:1,is_called:true});
});
await scenario('Already expired, stale and null leases preserve early fenced receipt without any writes', async () => {
  for (const [expiry, token] of [["clock_timestamp()-interval '1 second'",lease],["clock_timestamp()+interval '10 minutes'",foreignLease],["clock_timestamp()+interval '10 minutes'",null]]) {
    await fixture('none',expiry); const before = await snapshot();
    assert.deepEqual(await complete(token), {status:'fenced'});
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(await attempts(),{last_value:1,is_called:false});
  }
});
await scenario('Valid completion atomically persists version/history and duplicate completion is fenced', async () => {
  await fixture(); const before = await snapshot();
  const result = await complete(); assert.equal(result.status,'completed');
  const after = await snapshot();
  assert.equal(after.project[0].files['src/App.tsx'].content,'new');
  assert.deepEqual(after.project[0].versions,before.project[0].versions,'app users/database/deploy configuration is retained');
  assert.equal(after.project[0].messages.length,3); assert.equal(after.chat[0].messages.length,2);
  assert.equal(after.run[0].status,'completed'); assert.equal(after.run[0].lease_token,null);
  assert.equal(after.run[0].assistant_message_id,`cloud-${run}`);
  assert.equal(after.run[0].result.app_artifact.projectId,project);
  assert.deepEqual(await complete(),{status:'fenced'});
  assert.deepEqual(await snapshot(),after,'duplicate call cannot append history or rewrite files');
  assert.deepEqual(await attempts(),{last_value:1,is_called:true});
});
await scenario('Concurrent project revision conflict still leaves existing project untouched', async () => {
  await fixture(); await db.exec('update public.ide_projects set cloud_revision=1'); const before=await snapshot();
  assert.deepEqual(await complete(),{status:'conflict'}); assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await attempts(),{last_value:1,is_called:false});
});
await db.exec('reset role');
await scenario('Migration fails closed if the expected exception is absent', async () => {
  await db.exec(original.replace(oldRaise,"raise exception 'Changed upstream' using errcode='P0001';"));
  const changed=await definition();
  await assert.rejects(db.exec(patch), /Expected cloud_app_step completion lease error was not found/);
  assert.equal(await definition(),changed); assert.deepEqual(await permissions(),originalPermissions);
  await db.exec(original); await db.exec(patch);
});
for (const role of ['anon','authenticated']) {
  assert.equal(await scalar(`select has_function_privilege('${role}','public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)','execute')`),false);
}
assert.equal(await scalar("select has_function_privilege('service_role','public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)','execute')"),true);
console.log(`Passed ${scenarios} real-SQL transaction scenarios. PT409 HTTP mapping is documented by PostgREST; no live HTTP server was used.`);
await db.close();
