// Local-only real PostgreSQL race harness. No TCP, production env, or services.
// Run: node supabase/tests/cloud_runs_concurrency.mjs
// Requires Homebrew postgresql@17. Retains disposable data/logs; always stops PG.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const directory = mkdtempSync('/tmp/arc-cloud-pg17-run-');
const data = `${directory}/data`, socket = `${directory}/socket`;
mkdirSync(socket, { mode: 0o700 });
const port = '55439';
const env = { PATH: process.env.PATH, LC_ALL: 'C' }; // Deliberately discard PG*/credentials.
const migrationPath = `${root}/supabase/migrations/20260912085941_durable_cloud_runs.sql`;
const migration = readFileSync(migrationPath, 'utf8');
const hash = createHash('sha256').update(migration).digest('hex');
const evidence = { postgres: '', directory, migrationSha256: hash, passes: [] };
let started = false;
const children = new Set();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const service = 'set role service_role;';
const auth = owner => `set role authenticated; select set_config('request.jwt.claim.sub',${quote(owner)},false);`;
function check(value, label) { if (!value) throw new Error(label); }
function pass(label) { evidence.passes.push(label); console.log(`PASS ${label}`); }
function connection(sql, name = randomUUID(), hold = false) {
  const child = spawn(`${bin}/psql`, ['-X', '-qAt', '-h', socket, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env: { ...env, PGAPPNAME: name }, stdio: ['pipe','pipe','pipe'] });
  children.add(child);
  let stdout = '', stderr = '', readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('ARC_READY')) readyResolve(); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => { children.delete(child); readyResolve(); resolve({ code, stdout, stderr }); });
  });
  child.stdin.write(`set statement_timeout='8s'; set lock_timeout='6s'; set idle_in_transaction_session_timeout='8s';\n${sql}\n`);
  if (hold) child.stdin.write('\\echo ARC_READY\n'); else child.stdin.end();
  return { child, done, ready, get stdout() { return stdout; }, release() { child.stdin.end('commit;\n'); } };
}
async function query(sql) {
  const result = await connection(sql).done;
  check(result.code === 0, `SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
async function until(predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Barrier timeout: ${label}`);
}
// First transaction executes its mutation and stays open. We verify the second
// connection is actually lock-waiting before releasing the first transaction.
async function race(label, firstSQL, secondSQL, expectedCode = null, releaseDelay = 0) {
  const first = connection(`begin; ${firstSQL}`, `first-${randomUUID()}`, true);
  await first.ready;
  if (!first.stdout.includes('ARC_READY')) throw new Error(`First transaction failed: ${(await first.done).stderr}`);
  const name = `second-${randomUUID()}`;
  const second = connection(secondSQL, name);
  try {
    await until(async () => (await query(`select count(*) from pg_stat_activity where application_name=${quote(name)} and wait_event_type='Lock'`)) === '1', label);
    if (releaseDelay) await new Promise(resolve => setTimeout(resolve,releaseDelay));
  } finally { first.release(); }
  const [one,two] = await Promise.all([first.done, second.done]);
  check(one.code === 0, `${label}: first failed ${one.stderr}`);
  check(expectedCode ? two.code !== 0 && two.stderr.includes(expectedCode) : two.code === 0,
    `${label}: unexpected second result ${JSON.stringify(two)}`);
  pass(`${label} (observed real lock wait${expectedCode ? `; SQLSTATE ${expectedCode}` : ''})`);
  return two.stdout.trim();
}
async function session(owner = A, messages = []) {
  const id = randomUUID();
  await query(`insert into public.chat_sessions(id,user_id,title,messages) values(${quote(id)},${quote(owner)},'Race fixture',${json(messages)})`);
  return id;
}
const message = (id = randomUUID(), content = 'hello', role = 'user') => ({ id, role, content });
function submit(id,sid,mode,msg,request = {}, owner = A, revision = 0) {
  return `${service} select public.submit_cloud_run(${quote(id)},${quote(owner)},${quote(sid)},${quote(mode)},'chat',${json(request)},${json(msg)},${revision});`;
}
function operation(sid, op, id = randomUUID(), owner = A) {
  return `${auth(owner)} select public.apply_chat_session_operation(${quote(id)},${quote(sid)},${json(op)});`;
}
async function running(mode) {
  const sid = await session(), id = randomUUID(), msg = message();
  await query(submit(id,sid,mode,msg));
  const token = await query(`${service} select lease_token from public.claim_cloud_run(${quote(id)});`);
  const assistant = message(`cloud-${id}`, 'finished', 'assistant');
  const complete = `${service} select public.complete_cloud_run(${quote(id)},${quote(token)},'{}',${json(assistant)});`;
  return { sid,id,msg,token,assistant,complete };
}
async function state(sid) {
  const result = await query(`select jsonb_build_object('messages',messages,'revision',revision,'version',persistence_version) from public.chat_sessions where id=${quote(sid)}`);
  return result ? JSON.parse(result) : null;
}
try {
  evidence.postgres = execFileSync(`${bin}/postgres`, ['--version'], { env, encoding: 'utf8' }).trim();
  execFileSync(`${bin}/initdb`, ['-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','-E','UTF8'], { env, stdio: 'pipe' });
  execFileSync(`${bin}/pg_ctl`, ['-D',data,'-l',`${directory}/postgres.log`,'-o',`-k ${socket} -p ${port} -h '' -c unix_socket_permissions=0700 -c deadlock_timeout=100ms -c log_lock_waits=on`,'-w','start'], { env, stdio: 'pipe' });
  started = true;
  check(await query('show listen_addresses') === '', 'TCP must be disabled');
  await query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
  for (const file of [
    '20250830192630_47cf40bc-2d2c-42a2-9541-f810ada41674.sql',
    '20251106031256_36740d06-a7da-482d-b3a6-886314af7b52.sql',
    '20260102064547_8daccd8e-e346-40d4-a197-fe6140d93084.sql',
    '20260529020858_177f2e15-3416-48d7-b030-2aa0dc2c81b9.sql',
  ]) await query(readFileSync(`${root}/supabase/migrations/${file}`,'utf8'));
  const missing = await connection(migration).done;
  check(missing.code !== 0 && missing.stderr.includes('42704'), 'Missing prerequisite must fail');
  check(await query("select to_regclass('public.cloud_runs') is null") === 't', 'Missing index rollback');
  pass('missing index rollback');
  await query('create unique index concurrently chat_sessions_id_user_id_cloud_runs_key on public.chat_sessions(id,user_id)');
  check(await query("select indisvalid from pg_index where indexrelid='public.chat_sessions_id_user_id_cloud_runs_key'::regclass") === 't','Concurrent index valid');
  await query(migration);
  pass('concurrent prerequisite index and migration apply');
  if (process.argv.includes('--memory')) {
    for (const file of ['20250910205114_15e4466e-d756-40c0-9a14-28fb83c4b20e.sql',
      '20260217044842_c604df0e-752d-4231-84f2-2bfa3346a94d.sql','20260911151101_add_living_memory_summary.sql',
      '20260912095358_durable_cloud_memory.sql']) await query(readFileSync(`${root}/supabase/migrations/${file}`,'utf8'));
    await query(readFileSync(`${root}/supabase/tests/cloud_memory.sql`,'utf8'));
    pass('durable memory migration and SQL suite on real PostgreSQL');
  }
  await query(readFileSync(`${root}/supabase/tests/cloud_runs.sql`,'utf8'));
  pass('full existing standalone SQL suite on PostgreSQL 17');
  await query(`insert into auth.users(id,email) values(${quote(A)},'a@example.invalid'),(${quote(B)},'b@example.invalid');`);
  if (process.argv.includes('--memory')) {
    const owner=randomUUID();
    await query(`insert into auth.users(id,email) values(${quote(owner)},'memory-races@example.invalid');
      insert into public.memory_summaries(user_id,summary,migrated_from_legacy) values(${quote(owner)},'initial',true);`);
    async function memoryRun(mode) {
      const sid=await session(owner),id=randomUUID();
      const call={id:'memory-call',name:'save_memory',arguments:'{"memory":"updated fact","replaces":[]}'};
      await query(`${service} insert into public.cloud_runs(id,user_id,session_id,mode,request,checkpoint)
        values(${quote(id)},${quote(owner)},${quote(sid)},${quote(mode)},'{}',${json({engine:{turns:1,calls:[call]}})});`);
      const token=await query(`${service} select lease_token from public.claim_cloud_run(${quote(id)});`);
      return {id,sid,step:(action,step=0,summary=null)=>`${service} select public.cloud_memory_step(${quote(id)},${quote(owner)},${quote(token)},
        ${quote(`${id}:turn:1:tool:memory-call`)},${json(call)},${quote(action)},${step},${summary===null?'null':quote(summary)});`};
    }
    const one=await memoryRun('ask'),two=await memoryRun('auto');
    await query(one.step('begin'));await query(two.step('begin'));
    const denied=await race('memory: one paid intent per owner across sessions',one.step('start'),two.step('start'));
    check(JSON.parse(denied).status==='recovery_required','Concurrent provider start prevented');
    await query(one.step('save',0,'first synthesis'));
    await query(two.step('start'));await query(two.step('save',0,'second synthesis'));
    const conflict=await race('memory: competing synthesized snapshots CAS',one.step('commit',1),two.step('commit',1));
    check(JSON.parse(conflict).status==='conflict','Second stale synthesis cannot overwrite');
    check(await query(`select summary from public.memory_summaries where user_id=${quote(owner)}`)==='first synthesis','Winning memory preserved');
    const three=await memoryRun('auto');
    await query(three.step('begin'));await query(three.step('start'));await query(three.step('save',0,'stale draft'));
    const legacyConflict=await race('memory: legacy voice memory edit versus durable commit',
      `${service} update public.memory_summaries set summary='legacy concurrent fact',revision=revision+1 where user_id=${quote(owner)};`,three.step('commit',1));
    check(JSON.parse(legacyConflict).status==='conflict','Legacy memory edit preserved');
    const ambiguous=await memoryRun('auto');await query(ambiguous.step('begin'));await query(ambiguous.step('start'));
    await query(`${service} update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where id=${quote(ambiguous.id)};`);
    check(JSON.parse(await query(ambiguous.step('save',0,'late provider result'))).status==='fenced','Cancelled synthesis cannot save');
    await query(`delete from public.chat_sessions where id=${quote(ambiguous.sid)};`);
    const next=await memoryRun('ask');
    check(JSON.parse(await query(next.step('begin'))).status==='recovery_required','Unknown paid intent survives run deletion and blocks resynthesis');
    pass('memory: cancellation fences result; ambiguous intent survives session deletion');
  }
  for (const mode of ['ask','auto']) {
    {
      const sid=await session(),a=randomUUID(),b=randomUUID(),m1=message(randomUUID(),'first'),m2=message(randomUUID(),'second');
      const req1={messages:[{role:'user',content:'first'}]};
      const req2={messages:[{role:'user',content:'first'},{role:'user',content:'second'}]};
      const accepted=await race(`${mode}: simultaneous distinct turns accepted in session order`,
        submit(a,sid,mode,m1,req1),submit(b,sid,mode,m2,req2));
      check(JSON.parse(accepted).session_sequence===2,'Concurrent second acceptance gets sequence two');
      const head=connection(`begin; ${service} select id from public.claim_cloud_run(${quote(a)});`,randomUUID(),true);
      await head.ready;
      check(head.stdout.includes(a),'Head claim actually acquired');
      try {
        check(await query(`${service} select count(*) from public.claim_cloud_run(${quote(b)});`)==='0','Follower cannot start while head transaction open');
        const independent=await running(mode);
        check(independent.token.length>0,'Different session executes while first session locked');
        check(await query(`${service} select count(*) from public.claim_cloud_run(${quote(a)});`)==='0','Same head cannot be claimed twice');
      } finally {head.release();await head.done;}
      pass(`${mode}: head-only competing claims; unrelated session remains parallel`);
      const claimed=JSON.parse(await query(`select to_jsonb(r) from public.cloud_runs r where id=${quote(a)}`));
      check(JSON.stringify(claimed.execution_messages)===JSON.stringify(req1.messages),'Head frozen input excludes accepted follower');
      await query(`${service} select public.checkpoint_cloud_run(${quote(a)},${quote(claimed.lease_token)},'{}','awaiting_input');`);
      check(await query(`${service} select count(*) from public.claim_cloud_run(${quote(b)});`)==='0','Approval head blocks follower');
      check(await query(`${service} select count(*) from public.list_claimable_cloud_runs(4) where session_id=${quote(sid)};`)==='0','Paused session not in candidate batch');
      const cancelling=connection(`begin; ${service} update public.cloud_runs set status='cancelled' where id=${quote(a)};`,randomUUID(),true);
      await cancelling.ready;
      try {
        check(await query(`${service} select count(*) from public.claim_cloud_run(${quote(b)});`)==='0','Uncommitted cancellation cannot release follower');
      } finally {cancelling.release();await cancelling.done;}
      await query(`${service} select id from public.claim_cloud_run(${quote(b)});`);
      check(await query(`select status from public.cloud_runs where id=${quote(b)}`)==='running','Cancellation releases next accepted turn');
      pass(`${mode}: cancellation commits before follower can claim`);
    }
    {
      const sid = await session(), id = randomUUID(), msg = message();
      const result = await race(`${mode}: identical submit`,submit(id,sid,mode,msg),submit(id,sid,mode,msg));
      check(JSON.parse(result).replayed === true,'Identical submit replay receipt');
      check((await state(sid)).messages.length === 1 && (await state(sid)).revision === 1,'Submit single append/revision');
    }
    {
      const sid = await session(), id = randomUUID(), msg = message();
      await race(`${mode}: conflicting submit`,submit(id,sid,mode,msg),submit(id,sid,mode,msg,{ changed: true }),'23505');
      check((await state(sid)).messages.length === 1,'Conflicting submit rollback');
    }
    {
      const first = await session(), second = await session(), id = randomUUID();
      await race(`${mode}: run UUID collision across sessions`,submit(id,first,mode,message()),submit(id,second,mode,message()),'23505');
      check((await state(second)).messages.length === 0 && (await state(second)).version === 0,'Cross-session loser untouched');
    }
    {
      const sid = await session(), id = randomUUID(), msg = message();
      const legacy = `${auth(A)} update public.chat_sessions set messages=${json([message()])} where id=${quote(sid)};`;
      await race(`${mode}: legacy edit invalidates submit revision`,legacy,submit(id,sid,mode,msg),'40001');
      check(await query(`select count(*) from public.cloud_runs where id=${quote(id)}`) === '0','Stale submission never queues');
      const other = await session(), otherRun = randomUUID();
      await race(`${mode}: submission protects against legacy overwrite`,submit(otherRun,other,mode,message()),
        `${auth(A)} update public.chat_sessions set messages='[]' where id=${quote(other)};`,'42501');
    }
    {
      const r = await running(mode);
      const stale = `${auth(A)} update public.chat_sessions set messages=${json([r.msg])} where id=${quote(r.sid)};`;
      await race(`${mode}: complete then stale legacy save`,r.complete,stale,'42501');
      check((await state(r.sid)).messages.length === 2,'Completed reply survives stale save');
    }
    {
      const r = await running(mode);
      // A legacy save that is identical before completion is a legal no-op.
      const old = `${auth(A)} update public.chat_sessions set messages=${json([r.msg])} where id=${quote(r.sid)};`;
      await race(`${mode}: legacy save then complete`,old,r.complete);
      check((await state(r.sid)).messages.length === 2,'Reverse ordering preserves completion');
    }
    {
      const r = await running(mode), original = r.msg;
      const op1 = { kind:'replace',id:original.id,expected:original,message:{...original,content:'first'} };
      const op2 = { kind:'replace',id:original.id,expected:original,message:{...original,content:'second'} };
      await race(`${mode}: same-message CAS`,operation(r.sid,op1),operation(r.sid,op2),'40001');
      check((await state(r.sid)).messages[0].content === 'first','CAS winning content');
      await race(`${mode}: operation preserves concurrent completion`,r.complete,
        operation(r.sid,{kind:'append',message:message(randomUUID(),'voice-style turn','assistant')}));
      check((await state(r.sid)).messages.length === 3,'Operation kept worker append');
    }
    {
      const sid = await session(), id = randomUUID(), op = {kind:'append',message:message()};
      const output = await race(`${mode}: concurrent operation retry`,operation(sid,op,id),operation(sid,op,id));
      check(JSON.parse(output.split('\n').at(-1)).replayed === true && (await state(sid)).revision === 1,'Operation receipt dedup');
    }
    {
      const first = await session(), second = await session(), id = randomUUID();
      await race(`${mode}: operation UUID collision rolls back loser`,
        operation(first,{kind:'append',message:message()},id),operation(second,{kind:'append',message:message()},id),'23505');
      check((await state(second)).messages.length === 0 && (await state(second)).revision === 0,'Receipt collision rolls edit back');
      await race(`${mode}: canvas CAS`,operation(first,{kind:'canvas',expected:null,value:'winner'}),
        operation(first,{kind:'canvas',expected:null,value:'loser'}),'40001');
      check(await query(`select canvas_content from public.chat_sessions where id=${quote(first)}`) === 'winner','Canvas winner retained');
    }
    {
      const r = await running(mode);
      await query(`${service} update public.cloud_runs set lease_expires_at=clock_timestamp()+interval '1 second' where id=${quote(r.id)};`);
      const outcome = await race(`${mode}: lease expires while waiting for session`,
        `${auth(A)} update public.chat_sessions set title='Holding session' where id=${quote(r.sid)};`,r.complete,null,1200);
      check(outcome === 'f' && (await state(r.sid)).messages.length === 1,'Expired waiting worker cannot append');
      const token = await query(`${service} select lease_token from public.claim_cloud_run(${quote(r.id)});`);
      check(token !== r.token && token.length > 0,'Recovery rotates fencing token');
      check(await query(r.complete) === 'f','Recovered old worker remains fenced');
    }
    {
      const r = await running(mode);
      const cancel = `${service} update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null
        where id=${quote(r.id)} and status in ('queued','running','awaiting_input');`;
      const outcome = await race(`${mode}: cancellation wins`,cancel,r.complete);
      check(outcome === 'f' && (await state(r.sid)).messages.length === 1,'Cancelled worker has no append');
      const other = await running(mode);
      const cancelOther = `${service} update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null
        where id=${quote(other.id)} and status in ('queued','running','awaiting_input');`;
      await race(`${mode}: completion wins cancellation`,other.complete,cancelOther);
      check(await query(`select status from public.cloud_runs where id=${quote(other.id)}`) === 'completed','Terminal completion retained');
    }
    for (const deleteFirst of [true,false]) {
      const r = await running(mode), deletion = `${auth(A)} delete from public.chat_sessions where id=${quote(r.sid)};`;
      const outcome = await race(`${mode}: ${deleteFirst ? 'deletion before completion' : 'completion before deletion'}`,
        deleteFirst ? deletion : r.complete,deleteFirst ? r.complete : deletion);
      if (deleteFirst) check(outcome === 'f','Deleted session rejects completion');
      check(await state(r.sid) === null && await query(`select count(*) from public.cloud_runs where id=${quote(r.id)}`) === '0','No deleted-session resurrection');
    }
    {
      const r = await running(mode);
      const first = connection(`begin; ${r.complete}`,randomUUID(),true);
      await first.ready;
      try {
        const wrong = await connection(operation(r.sid,{kind:'append',message:message()},randomUUID(),B)).done;
        check(wrong.code !== 0 && wrong.stderr.includes('42501'),'Cross-owner operation rejected during completion');
        const visible = await query(`${auth(B)} select count(id) from public.cloud_runs where id=${quote(r.id)};`);
        check(visible.split('\n').at(-1) === '0','Cross-owner run invisible');
      } finally { first.release(); await first.done; }
      pass(`${mode}: owner isolation during open completion transaction`);
    }
  }
  check(createHash('sha256').update(readFileSync(migrationPath)).digest('hex') === hash,'Migration changed while harness ran');
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.error = String(error.stack ?? error);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGTERM');
  if (started) {
    execFileSync(`${bin}/pg_ctl`, ['-D',data,'-m','fast','-w','stop'], { env, stdio:'pipe' });
    evidence.stopped = true;
  }
  writeFileSync(`${directory}/evidence.json`,JSON.stringify(evidence,null,2));
  console.log(`Evidence: ${directory}/evidence.json`);
  console.log(`Cluster stopped: ${evidence.stopped === true}; TCP disabled; port ${port} on private socket only.`);
}
