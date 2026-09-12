// Repeatable real PG17 regression. Private Unix socket; no TCP/production env.
// node supabase/tests/cloudScheduledConcurrency.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const dir = mkdtempSync('/tmp/arc-cloud-scheduled-'), socket = `${dir}/socket`, data = `${dir}/data`, port = '55443';
mkdirSync(socket, { mode: 0o700 });
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const j = v => `${q(JSON.stringify(v))}::jsonb`;
const service = 'set role service_role;';
const migrationName = '20260912102631_durable_cloud_scheduled_tasks.sql';
const migration = readFileSync(`${root}/supabase/migrations/${migrationName}`, 'utf8');
const evidence = { directory: dir, migrationName, sha256: createHash('sha256').update(migration).digest('hex'), passes: [] };
const children = new Set(); let started = false;
function check(v, label) { if (!v) throw new Error(label); }
function pass(label) { evidence.passes.push(label); console.log(`PASS ${label}`); }
function connection(sql, name = randomUUID(), hold = false) {
  const child = spawn(`${bin}/psql`, ['-X', '-qAt', '-h', socket, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: { ...env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child); let stdout = '', stderr = '', resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', b => { stdout += b; if (stdout.includes('READY')) resolveReady(); });
    child.stderr.on('data', b => { stderr += b; });
    child.on('close', code => { children.delete(child); resolveReady(); resolve({ code, stdout, stderr }); });
  });
  child.stdin.write(`set statement_timeout='15s'; set lock_timeout='10s'; set idle_in_transaction_session_timeout='15s';\n${sql}\n`);
  if (hold) child.stdin.write('\\echo READY\n'); else child.stdin.end();
  return { done, ready, get stdout() { return stdout; }, release() { child.stdin.end('commit;\n'); } };
}
async function sql(text) { const r = await connection(text).done; check(r.code === 0, r.stderr); return r.stdout.trim(); }
async function race(label, one, two) {
  const first = connection(`begin; ${one}`, randomUUID(), true); await first.ready;
  if (!first.stdout.includes('READY')) throw new Error((await first.done).stderr);
  const name = randomUUID(), second = connection(two, name); let blocked = false;
  try {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await sql(`select count(*) from pg_stat_activity where application_name=${q(name)} and wait_event_type='Lock'`) === '1') { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    check(blocked, 'Expected real lock wait');
  } finally { first.release(); }
  const [a, b] = await Promise.all([first.done, second.done]); check(a.code === 0 && b.code === 0, a.stderr + b.stderr);
  pass(label); return JSON.parse(b.stdout.trim());
}
const A = randomUUID(), B = randomUUID();
async function fixture(name, args, mode = 'auto', owner = A) {
  const sid = randomUUID(), id = randomUUID(), call = { id: randomUUID(), name, arguments: JSON.stringify(args) };
  const key = `${id}:turn:1:tool:${call.id}`;
  const hash = createHash('sha256').update(`${name}\n${call.arguments}`).digest('hex');
  const checkpoint = { engine: { turns: 1, calls: [call] } };
  await sql(`${service} insert into public.chat_sessions(id,user_id,title,messages) values(${q(sid)},${q(owner)},'local fixture','[]');
    insert into public.cloud_runs(id,user_id,session_id,mode,request,checkpoint) values(${q(id)},${q(owner)},${q(sid)},${q(mode)},'{}',${j(checkpoint)});`);
  const token = await sql(`${service} select lease_token from public.claim_cloud_run(${q(id)});`);
  const f = { id, sid, call, key, token, owner, hash, checkpoint,
    command(overrides = {}) { const v = { id, owner, token, key, call, ...overrides }; return `${service} select public.cloud_scheduled_step(${q(v.id)},${q(v.owner)},${q(v.token)},${q(v.key)},${j(v.call)});`; },
    async apply(overrides) { return JSON.parse(await sql(this.command(overrides))); },
    async approve(decision = 'approve', hashValue = hash) {
      checkpoint.pendingApproval = { callId: call.id, argumentsHash: hashValue };
      checkpoint.inputResponse = { callId: call.id, argumentsHash: hashValue, decision };
      await sql(`${service} update public.cloud_runs set checkpoint=${j(checkpoint)} where id=${q(id)};`);
    },
  }; return f;
}
const schedule = extra => ({ title: 'Local reminder', prompt: 'Check the plants', when_iso: '2099-01-01T12:00:00Z', ...extra });
async function capture(id, owner = A) { return (await (await fixture('get_scheduled_task', { task_id: id }, 'auto', owner)).apply()).result; }
async function expectError(command, label) { const r = await connection(command).done; check(r.code !== 0, label); pass(label); }
try {
  evidence.postgres = execFileSync(`${bin}/postgres`, ['--version'], { env, encoding: 'utf8' }).trim();
  execFileSync(`${bin}/initdb`, ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'], { env, stdio: 'pipe' });
  execFileSync(`${bin}/pg_ctl`, ['-D', data, '-l', `${dir}/postgres.log`, '-o', `-k ${socket} -p ${port} -h '' -c unix_socket_permissions=0700`, '-w', 'start'], { env, stdio: 'pipe' }); started = true;
  check(await sql('show listen_addresses') === '', 'TCP disabled');
  await sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create function public.is_admin_user() returns boolean language sql stable as 'select false';
    grant usage on schema auth,public to anon,authenticated,service_role; grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
  for (const file of ['20250830192630_47cf40bc-2d2c-42a2-9541-f810ada41674.sql', '20251106031256_36740d06-a7da-482d-b3a6-886314af7b52.sql',
    '20260102064547_8daccd8e-e346-40d4-a197-fe6140d93084.sql', '20260529020858_177f2e15-3416-48d7-b030-2aa0dc2c81b9.sql']) {
    await sql(readFileSync(`${root}/supabase/migrations/${file}`, 'utf8'));
  }
  await sql('create unique index concurrently chat_sessions_id_user_id_cloud_runs_key on public.chat_sessions(id,user_id)');
  await sql(readFileSync(`${root}/supabase/migrations/20260912085941_durable_cloud_runs.sql`, 'utf8'));
  // Exact scheduled table/index/policy/trigger DDL; omit unrelated shared chats
  // and hosted pg_cron/pg_net extensions (no dispatcher is started locally).
  const original = readFileSync(`${root}/supabase/migrations/20260602182120_d4ab9ba4-5ba8-462c-8b44-f80413ffa9b5.sql`, 'utf8');
  await sql(original.slice(original.indexOf('CREATE TABLE public.scheduled_tasks'), original.indexOf('-- ============ SHARED CHATS')));
  await sql(readFileSync(`${root}/supabase/migrations/20260602183837_7b30a0d4-fb63-4c65-bd4f-6e3212244f7f.sql`, 'utf8'));
  await sql(migration); pass('actual base schema and new migration applied privately');
  await sql(`insert into auth.users(id) values(${q(A)}),(${q(B)});`);
  const create = await fixture('schedule_task', schedule());
  const duplicate = await race('concurrent identical tool execution returns one stable receipt', create.command(), create.command());
  check(duplicate.result.performed && await sql('select count(*) from public.scheduled_tasks') === '1', 'Exactly one task');
  const taskId = duplicate.result.task_id;
  check(duplicate.result.task.result_chat_id === null, 'Separate delivery destination');
  check(JSON.stringify(await create.apply()) === JSON.stringify(duplicate), 'Stable replay');
  for (const mode of ['ask', 'auto']) {
    const f = await fixture('schedule_task', schedule({ title: mode }), mode);
    if (mode === 'ask') {
      check((await f.apply()).status === 'approval_required', 'Ask cannot mutate before approval');
      await f.approve('deny'); check((await f.apply()).status === 'approval_required', 'Denial blocks');
      await f.approve('approve', 'a'.repeat(64)); check((await f.apply()).status === 'approval_required', 'Stale hash blocks');
      await f.approve();
    }
    check((await f.apply()).result.performed, `${mode} authorized config`);
  } pass('both modes and exact Ask approval, denial and stale hash');
  const latest = await fixture('get_scheduled_task', { task_id: null }); const captured = (await latest.apply()).result;
  await (await fixture('schedule_task', schedule({ title: 'newer task' }))).apply();
  check((await latest.apply()).result.task_id === captured.task_id, 'Latest receipt frozen');
  const edit = await fixture('update_scheduled_task', { task_id: captured.task_id, expected_version: captured.expected_version, title: 'Changed original' }, 'ask');
  await edit.approve(); check((await edit.apply()).result.task_id === captured.task_id, 'Update exact original');
  pass('latest resolved once; new task cannot redirect approved update');
  const snapshot = await capture(taskId);
  const left = await fixture('update_scheduled_task', { task_id: taskId, expected_version: snapshot.expected_version, prompt: 'one' });
  const right = await fixture('update_scheduled_task', { task_id: taskId, expected_version: snapshot.expected_version, prompt: 'two' });
  const conflict = await race('cross-session concurrent task CAS has exactly one winner', left.command(), right.command());
  check(conflict.result.reason === 'conflict', 'Stale snapshot rejected');
  check((await right.apply()).result.reason === 'conflict', 'Conflict itself durably replayed');
  const stale = await capture(taskId), legacy = await fixture('update_scheduled_task', { task_id: taskId, expected_version: stale.expected_version, title: 'stale' }, 'ask'); await legacy.approve();
  await race('legacy write before approved update is detected', `${service} update public.scheduled_tasks set title='legacy changed' where id=${q(taskId)};`, legacy.command());
  check((await legacy.apply()).result.reason === 'conflict', 'Legacy CAS conflict');
  for (const name of ['get_scheduled_task', 'update_scheduled_task']) {
    const f = await fixture(name, name === 'get_scheduled_task' ? { task_id: taskId } : { task_id: taskId, expected_version: stale.expected_version, cancel: true }, 'auto', B);
    check((await f.apply()).result.reason === 'not_found', 'Cross-owner target hidden');
  }
  check((await create.apply({ owner: B })).status === 'fenced', 'Forged run owner');
  check((await create.apply({ token: randomUUID() })).status === 'fenced', 'Stale lease cannot replay');
  pass('cross-owner read/update/cancel and claimed-owner/fence guards');
  const cancelSnap = await capture(taskId), cancel = await fixture('update_scheduled_task', { task_id: taskId, expected_version: cancelSnap.expected_version, cancel: true }, 'ask'); await cancel.approve();
  const cancelled = await race('duplicate cancellation settles once without recreating task', cancel.command(), cancel.command());
  check(cancelled.result.cancelled && await sql(`select count(*) from public.scheduled_tasks where id=${q(taskId)}`) === '0', 'Deleted once');
  check((await create.apply()).result.task_id === taskId, 'Create replay cannot recreate deleted task');
  const toDelete = await (await fixture('schedule_task', schedule({ title: 'delete before edit' }))).apply();
  const deletedEdit = await fixture('update_scheduled_task', { task_id: toDelete.result.task_id,
    expected_version: toDelete.result.expected_version, title: 'must not recreate' });
  const missing = await race('task deletion racing update cannot resurrect it',
    `${service} delete from public.scheduled_tasks where id=${q(toDelete.result.task_id)};`, deletedEdit.command());
  check(missing.result.reason === 'not_found', 'Deleted target rejected');
  const badDestination = await (await fixture('schedule_task', schedule({ title: 'destination guard' }))).apply();
  const otherSession = randomUUID();
  await sql(`${service} insert into public.chat_sessions(id,user_id,title) values(${q(otherSession)},${q(B)},'foreign');
    update public.scheduled_tasks set result_chat_id=${q(otherSession)} where id=${q(badDestination.result.task_id)};`);
  let badSnap = await capture(badDestination.result.task_id);
  let badEdit = await fixture('update_scheduled_task', { task_id: badSnap.task_id, expected_version: badSnap.expected_version, title: 'no foreign writes' });
  check((await badEdit.apply()).result.reason === 'destination_requires_migration', 'Cross-owner destination blocked');
  await sql(`${service} update public.scheduled_tasks set result_chat_id=${q(create.sid)} where id=${q(badDestination.result.task_id)};
    update public.chat_sessions set persistence_version=1 where id=${q(create.sid)};`);
  badSnap = await capture(badDestination.result.task_id);
  badEdit = await fixture('update_scheduled_task', { task_id: badSnap.task_id, expected_version: badSnap.expected_version, title: 'no protected overwrite' });
  check((await badEdit.apply()).result.reason === 'destination_requires_migration', 'Protected destination blocked');
  pass('unsafe existing destinations require dispatcher migration, not silent reactivation');
  const elapsed = await fixture('schedule_task', schedule({ when_iso: '2000-01-01T12:00:00Z' }));
  check((await elapsed.apply()).result.reason === 'time_elapsed', 'No delayed approval accidental immediate task');
  const aborted = await fixture('schedule_task', schedule({ title: 'rollback' }));
  await sql(`begin; ${aborted.command()} rollback;`);
  check(await sql(`select count(*) from public.cloud_scheduled_receipts where receipt_key=${q(aborted.key)}`) === '0', 'Receipt rollback');
  check(await sql("select count(*) from public.scheduled_tasks where title='rollback'") === '0', 'Task rollback');
  check((await aborted.apply()).result.performed, 'Rollback retry succeeds'); pass('task plus receipt transaction rollback and expired-time rejection');
  const dead = await fixture('schedule_task', schedule());
  await sql(`${service} update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where id=${q(dead.id)};`);
  check((await dead.apply()).status === 'fenced', 'Cancelled run');
  const cancelling = await fixture('schedule_task', schedule({ title: 'cancellation race' }));
  const cancelFence = await race('run cancellation wins before tool effect', `${service}
    update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where id=${q(cancelling.id)};`, cancelling.command());
  check(cancelFence.status === 'fenced', 'Cancellation fences waiting worker');
  const deleted = await fixture('schedule_task', schedule()); await sql(`${service} delete from public.chat_sessions where id=${q(deleted.sid)};`);
  check((await deleted.apply()).status === 'fenced', 'Deleted session'); pass('run cancellation and session deletion prevent effects');
  const cron = await fixture('schedule_task', { title: 'UTC cron', prompt: 'Read weather', cron_expr: '*/15 9-17 * * 1-5' });
  check((await cron.apply()).result.task.schedule_type === 'cron', 'Cron create');
  check(await sql(`select public.cloud_scheduled_next_cron('0 13 * * *','2026-09-12T12:59:00Z')='2026-09-12T13:00:00Z'::timestamptz`) === 't', 'UTC cron');
  for (const expr of ['garbage', '60 * * * *', '*/0 * * * *', '0 0 31 2 *']) await expectError(`select public.cloud_scheduled_next_cron(${q(expr)},now());`, `cron rejects ${expr}`);
  const invalid = await fixture('schedule_task', schedule({ user_id: B })); await expectError(invalid.command(), 'SQL rejects model owner override');
  const forged = { ...create.call, arguments: JSON.stringify(schedule({ title: 'different' })) };
  await expectError(create.command({ call: forged }), 'SQL rejects changed call arguments');
  await sql(`${service} update public.cloud_runs set checkpoint=${j({ engine: { turns: 1, calls: [forged] } })} where id=${q(create.id)};`);
  await expectError(create.command({ call: forged }), 'receipt identity conflict even if checkpoint call is replaced');
  await sql(`${service} update public.cloud_runs set checkpoint=${j(create.checkpoint)} where id=${q(create.id)};`);
  const expired = await fixture('schedule_task', schedule());
  await sql(`${service} update public.cloud_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id=${q(expired.id)};`);
  check((await expired.apply()).status === 'fenced', 'Expired lease'); pass('expired lease blocks new receipts');
  for (const role of ['anon', 'authenticated']) {
    await expectError(`set role ${role}; select * from public.cloud_scheduled_receipts;`, `${role} cannot read receipts`);
    await expectError(create.command().replace(service, `set role ${role};`), `${role} cannot invoke service RPC`);
  }
  check(await sql("select relrowsecurity from pg_class where oid='public.cloud_scheduled_receipts'::regclass") === 't', 'RLS');
  pass('receipt RLS and explicit service-only privileges');
} catch (error) { evidence.error = String(error.stack ?? error); throw error; }
finally {
  for (const child of children) child.kill('SIGTERM');
  if (started) execFileSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'pipe' });
  evidence.stopped = true; writeFileSync(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${dir}/evidence.json`);
}
