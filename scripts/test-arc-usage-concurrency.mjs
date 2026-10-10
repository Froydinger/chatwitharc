// Native PostgreSQL race tests. Spins up an isolated Unix-socket-only cluster;
// no external database, service secrets, providers or production operations.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
for (const binary of ['initdb','pg_ctl','psql']) {
  if (spawnSync(binary,['--version'],{encoding:'utf8'}).status!==0) {
    console.error(`Native usage concurrency tests were NOT run: ${binary} is required on PATH.`);
    process.exit(1);
  }
}
const dir=mkdtempSync(join(tmpdir(),'arc-usage-races-')),data=join(dir,'data');
const port=String(55000+Math.floor(Math.random()*9000));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout;};
const args=['-h',dir,'-p',port,'-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=q=>run('psql',[...args,'-c',q]);
const concurrent=q=>new Promise(resolve=>{const p=spawn('psql',[...args,'-c',q]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',error=>resolve({status:1,error:String(error)}));p.on('close',status=>resolve({status,out,error:err}));});
const parse=s=>JSON.parse(s.trim().split('\n').at(-1));
const service=`SET ROLE service_role; SET request.jwt.claim.role='service_role'; `;
const free=randomUUID(),other=randomUUID(),boost=randomUUID(),admin=randomUUID();
const reserve=(id,key,amount=10)=>service+`SELECT reserve_arc_usage('${id}','${key}','model:0','chat','gpt-6.1-sol',${amount},'fixture');`;
const finish=(id,rid,key,amount,final=true)=>service+`SELECT record_arc_usage('${id}','${rid}','${key}',${amount},${final});`;
const view=id=>parse(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SELECT get_my_arc_usage();`));
let started=false;
try {
  run('initdb',['-D',data,'--auth=trust','--no-locale']);
  run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p ${port}`,'-w','start']); started=true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,boost boolean DEFAULT false,is_anonymous boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.user_has_boost(u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT boost FROM auth.users WHERE id=u$$;
    INSERT INTO auth.users(id,boost) VALUES('${free}',false),('${other}',false),('${boost}',true),('${admin}',true);
    INSERT INTO public.admin_users VALUES('${admin}');`);
  sql(readFileSync('supabase/migrations/20261010040518_arc_usage_ledger.sql','utf8'));
  sql(`UPDATE arc_usage_policy SET enforcement_enabled=true,free_daily_nanos=100,free_monthly_nanos=250,boost_daily_nanos=1000,boost_monthly_nanos=2000 WHERE pool='sol';`);
  const key=randomUUID();
  const duplicates=await Promise.all(Array.from({length:20},()=>concurrent(reserve(free,key))));
  assert.ok(duplicates.every(x=>x.status===0&&parse(x.out).allowed));
  assert.equal(new Set(duplicates.map(x=>parse(x.out).reservationId)).size,1);
  assert.equal(view(free).daily.reservedNanos,10,'Concurrent replay reserves once');
  const competing=await Promise.all(Array.from({length:35},()=>concurrent(reserve(free,randomUUID()))));
  assert.ok(competing.every(x=>x.status===0));
  assert.equal(competing.filter(x=>parse(x.out).allowed).length,9,'All competing admissions honor exact remaining balance');
  assert.equal(view(free).daily.reservedNanos,100);
  const rid=parse(duplicates[0].out).reservationId,receipt=randomUUID();
  const finalReplay=await Promise.all(Array.from({length:20},()=>concurrent(finish(free,rid,receipt,3))));
  assert.ok(finalReplay.every(x=>x.status===0));
  assert.equal(view(free).daily.spentNanos,3); assert.equal(view(free).daily.reservedNanos,90);
  const sameRequest=randomUUID(),second=parse(sql(reserve(other,sameRequest,50)));
  const mixed=await Promise.all([
    ...Array.from({length:12},(_,i)=>concurrent(finish(other,second.reservationId,`check-${i}`,i+1,false))),
    concurrent(finish(other,second.reservationId,'final',9)),
    ...Array.from({length:8},()=>concurrent(reserve(other,sameRequest,90))),
  ]);
  assert.ok(mixed.every(x=>x.status===0));
  assert.equal(view(other).daily.spentNanos,9); assert.equal(view(other).daily.reservedNanos,0,'Final/top-up/checkpoint race cannot revive a settled hold');
  const current=parse(sql(reserve(other,sameRequest,90)));
  const corrected=await Promise.all([4,5].map(amount=>concurrent(service+`SELECT reconcile_arc_usage('${other}','${second.reservationId}','reconcile-${amount}',${current.revision},${amount},'{"reason":"fixture final accounting"}');`)));
  assert.equal(corrected.filter(x=>x.status===0).length,1,'Exactly one reconciliation wins the revision fence');
  assert.equal(corrected.filter(x=>x.status!==0&&x.error.includes('revision conflict')).length,1);
  assert.ok([4,5].includes(view(other).daily.spentNanos));
  const combined=JSON.parse(sql(`SELECT jsonb_build_object('spent',sum(w.spent_nanos),'held',sum(w.reserved_nanos)) FROM arc_usage_windows w WHERE window_kind='day';`).trim());
  const attempts=JSON.parse(sql(`SELECT jsonb_build_object('spent',sum(charged_nanos),'held',sum(held_nanos)) FROM arc_usage_reservations;`).trim());
  assert.deepEqual(combined,attempts,'Account aggregates exactly match attempt accounting');
  console.log('PASS native PostgreSQL concurrency: duplicate reservation/final receipts, exact competing cap, checkpoint/final/top-up races, revision-fenced reconciliation and aggregate invariants.');
} catch (error) {
  try { console.error(readFileSync(join(dir,'postgres.log'),'utf8')); } catch { /* no server log before startup */ }
  throw error;
} finally {
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  rmSync(dir,{recursive:true,force:true});
}
