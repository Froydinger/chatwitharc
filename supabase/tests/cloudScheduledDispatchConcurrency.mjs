// Reuse the owned local PG bootstrap in memory; never edit its source.
// node supabase/tests/cloudScheduledDispatchConcurrency.mjs
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
let source = readFileSync(new URL('./cloudScheduledConcurrency.mjs', import.meta.url), 'utf8');
const start = source.indexOf("  const create = await fixture('schedule_task'");
const end = source.indexOf('} catch (error) { evidence.error');
if (start < 0 || end < start) throw Error('Local bootstrap boundaries changed');
source = source.slice(0, start) + String.raw`
  const dispatchMigration=readFileSync(root+'/supabase/migrations/20260912103816_durable_scheduled_dispatch.sql','utf8');
  evidence.dispatchSha256=createHash('sha256').update(dispatchMigration).digest('hex');
  await sql(dispatchMigration); pass('dispatch schema applied');
  async function task(extra='') {
    const id=randomUUID(); await sql(service+"insert into public.scheduled_tasks(id,user_id,title,prompt,schedule_type,run_at,next_run_at,notify_email) values("+q(id)+","+q(A)+",'title','prompt','once',now()-interval '1 minute',now()-interval '1 minute',true);"+extra); return id;
  }
  const claim=()=>sql(service+'select public.claim_scheduled_occurrence();').then(x=>x?JSON.parse(x):null);
  const stepSQL=(o,a,v=null,owner=o.user_id,token=o.lease_token)=>service+'select public.step_scheduled_occurrence('+q(o.id)+','+q(owner)+','+q(token)+','+q(a)+','+(v===null?'null':q(v))+');';
  const step=(o,a,v,owner,token)=>sql(stepSQL(o,a,v,owner,token));
  const firstTask=await task();
  const first=connection('begin; '+service+'select public.claim_scheduled_occurrence();',randomUUID(),true); await first.ready;
  if(!first.stdout.includes('READY')) throw Error((await first.done).stderr);
  check(await claim()===null,'concurrent claimant skips locked task'); first.release();
  const one=await first.done; check(one.code===0,one.stderr);
  let o=JSON.parse(one.stdout.split('\n').find(x=>x.startsWith('{')));
  check(await sql('select count(*) from public.cloud_scheduled_occurrences')==='1','one occurrence');
  check(await step(o,'start',null,B)==='f','owner fence');check(await step(o,'start',null,A,randomUUID())==='f','token fence');
  check(await step(o,'start')==='t','intent');check(await step(o,'start')==='f','cannot start twice');
  await sql(service+'update public.cloud_scheduled_occurrences set lease_expires_at=now()-interval \'1 second\' where id='+q(o.id));
  check(await claim()===null,'ambiguous start not repeated');
  check(await sql('select state from public.cloud_scheduled_occurrences where id='+q(o.id))==='recovery_required','recovery state');
  pass('atomic concurrent claim, owner/lease fencing and ambiguous start stop');
  await task();o=await claim();check(await step(o,'start')==='t','start');check(await step(o,'accept','provider-stable')==='t','accept');
  for(let i=0;i<8;i++){check(await step(o,'yield')==='t','yield');o=await claim();check(o.provider_id==='provider-stable'&&o.state==='accepted','poll receipt retained');}
  check(await step(o,'result','Scheduled output')==='t','result');
  await sql('begin; '+stepSQL(o,'complete')+'rollback;');
  check(await sql('select count(*) from public.chat_sessions where id='+q(o.chat_id))==='0','message rollback');
  check(await sql('select count(*) from public.cloud_scheduled_outbox where occurrence_id='+q(o.id))==='0','outbox rollback');
  const completeJSON=stepSQL(o,'complete').replace('select public.step_scheduled_occurrence(', 'select to_jsonb(public.step_scheduled_occurrence(').replace(/\);$/, '));');
  check(await race('concurrent completion commits one message and outbox',completeJSON,completeJSON)===false,'stale completion cannot repeat');
  check(await sql('select jsonb_array_length(messages) from public.chat_sessions where id='+q(o.chat_id))==='1','stable append');
  check(await sql('select count(*) from public.cloud_scheduled_outbox where occurrence_id='+q(o.id))==='2','channel receipts');
  pass('eight provider polls, frozen acceptance, atomic message/outbox rollback and completion dedup');
  const delivery=()=>sql(service+'select public.claim_scheduled_delivery();').then(x=>x?JSON.parse(x):null);
  const finish=(d,owner=d.user_id,token=d.lease_token)=>sql(service+'select public.finish_scheduled_delivery('+q(d.id)+','+q(owner)+','+q(token)+','+j({accepted:true,id:'provider-delivery'})+');');
  const d=await delivery();check(d&&d.user_id===A&&d.idempotency_key==='scheduled:'+o.id+':'+d.channel,'stable owner/channel key');
  check(await finish(d,B)==='f','delivery owner');check(await finish(d,A,randomUUID())==='f','delivery fence');
  check(await finish(d)==='t','delivery acceptance');check(await finish(d)==='f','no second settlement');
  const unknown=await delivery();check(unknown&&unknown.id!==d.id,'other channel');
  await sql(service+'update public.cloud_scheduled_outbox set lease_expires_at=now()-interval \'1 second\' where id='+q(unknown.id));
  check(await delivery()===null,'unknown acceptance not resent');
  check(await sql('select state from public.cloud_scheduled_outbox where id='+q(unknown.id))==='recovery_required','delivery recovery');
  pass('owner-scoped delivery receipt and ambiguous send never automatically repeated');
  await task();let cancelled=await claim();await step(cancelled,'start');await step(cancelled,'accept','p');await step(cancelled,'result','x');
  await sql(service+'delete from public.scheduled_tasks where id='+q(cancelled.task_id));
  check(await step(cancelled,'complete')==='f','deleted task cannot complete');
  await task();let changed=await claim();await step(changed,'start');await step(changed,'accept','p');await step(changed,'result','x');
  await sql(service+"update public.scheduled_tasks set prompt='changed' where id="+q(changed.task_id));
  check(await step(changed,'complete')==='f','edited task fences old result');
  await sql(service+"update public.scheduled_tasks set status='paused' where id="+q(changed.task_id));
  pass('task deletion and captured configuration conflict fence completion');
  const foreign=randomUUID();await sql(service+'insert into public.chat_sessions(id,user_id,title) values('+q(foreign)+','+q(B)+",'foreign');");
  const foreignTask=await task();await sql(service+'update public.scheduled_tasks set result_chat_id='+q(foreign)+' where id='+q(foreignTask));
  const f=await claim();check(f===null,'foreign destination rejected before paid work');
  check(await sql('select jsonb_array_length(messages) from public.chat_sessions where id='+q(foreign))==='0','foreign transcript intact');
  await sql(service+"update public.scheduled_tasks set status='paused' where id="+q(foreignTask));
  pass('cross-owner destination cannot receive or transfer result');
  for(const role of ['anon','authenticated']) {
    await expectError('set role '+role+';select public.claim_scheduled_occurrence();',role+' cannot claim');
    await expectError('set role '+role+';select * from public.cloud_scheduled_outbox;',role+' cannot read private outbox');
  }
` + source.slice(end);
source = source.replace("const root = fileURLToPath(new URL('../..', import.meta.url));", `const root = ${JSON.stringify(root)};`)
  .replace("mkdtempSync('/tmp/arc-cloud-scheduled-')", "mkdtempSync('/tmp/arc-dispatch-pg-')");
const result = spawnSync(process.execPath, ['--input-type=module'], { input: source, encoding: 'utf8', maxBuffer: 4e6 });
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? ''); process.exitCode = result.status ?? 1;
