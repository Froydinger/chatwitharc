import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'arc-monthly-')),data=join(dir,'data');
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout;};
const args=['-h',dir,'-p','54388','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=q=>run('psql',[...args,'-c',q]);
const parse=x=>JSON.parse(x.trim().split('\n').at(-1));
const free=randomUUID(),boost=randomUUID(),admin=randomUUID();
const auth=u=>`SET ROLE authenticated; SET request.jwt.claim.sub='${u}'; SET request.jwt.claim.role='authenticated'; `;
const svc=`SET ROLE service_role; SET request.jwt.claim.role='service_role'; `;
const snapshot=u=>parse(sql(auth(u)+'SELECT get_my_arc_image_credits();'));
const job=(u,model='gpt-image-2.5-flare',quality='low',aspect='1:1',kind='generate')=>{const id=randomUUID();sql(`INSERT INTO image_generation_jobs(id,user_id,preferred_model,image_quality,image_size,aspect_ratio,job_type) VALUES('${id}','${u}','${model}','${quality}','${model.startsWith('gemini')?'1K':aspect==='1:1'?'1024x1024':kind==='edit'?'auto':'1536x1024'}','${aspect}','${kind}');`);return id;};
const reserve=(u,id,n=1)=>parse(sql(svc+`SELECT reserve_arc_image_credits('${u}','${id}',${n});`));
const finish=(id,n)=>sql(svc+`SELECT finalize_arc_image_credits('${id}',${n});`);
const claim=(u,key=randomUUID(),offer=null)=>parse(sql(auth(u)+`SELECT claim_arc_image_refill('${key}',${offer?`'${offer}'`:'NULL'});`));
const preview=payload=>parse(sql(auth(admin)+`SELECT admin_arc_images('preview','${JSON.stringify(payload)}','${randomUUID()}');`));
const confirm=p=>parse(sql(auth(admin)+`SELECT admin_arc_images('confirm','{"previewId":"${p.id}","confirm":true}');`));
let started=false;
try{
 run('initdb',['-D',data,'--auth=trust','--no-locale']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -p 54388`,'-w','start']);started=true;
 sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean DEFAULT false,email text DEFAULT 'fixture@example.test');
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',auth.role())$$;
 CREATE TABLE admin_users(user_id uuid); CREATE TABLE subscriptions(user_id uuid,price_id text,status text,current_period_end timestamptz);
 CREATE TABLE google_play_subscriptions(user_id uuid,subscription_state text,expiry_time timestamptz);
 CREATE FUNCTION user_has_boost(u uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id=u) OR EXISTS(SELECT 1 FROM admin_users WHERE user_id=u)$$;
 INSERT INTO auth.users(id) VALUES('${free}'),('${boost}'),('${admin}'); INSERT INTO admin_users VALUES('${admin}'); INSERT INTO subscriptions VALUES('${boost}','arcai_boost_annual','active',now()+interval '1 year');
 CREATE TABLE cloud_runs(id uuid PRIMARY KEY,user_id uuid,kind text,status text,request jsonb,lease_expires_at timestamptz,session_id uuid,lease_token uuid,checkpoint jsonb);
 CREATE TABLE chat_sessions(id uuid PRIMARY KEY,user_id uuid);
 CREATE FUNCTION cloud_image_account_active(u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND NOT is_anonymous)$$;
 CREATE FUNCTION finalize_image_quota(j uuid,n integer) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
 CREATE TABLE cloud_image_receipts(receipt_key text PRIMARY KEY,run_id uuid,user_id uuid,call jsonb,args jsonb,job_id uuid,slots jsonb,settled boolean,quota jsonb);
 GRANT SELECT,INSERT,UPDATE ON cloud_runs,chat_sessions,cloud_image_receipts TO service_role;
 CREATE TABLE ide_projects(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE image_generation_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),preferred_model text,aspect_ratio text,job_type text,prompt text,status text,error_type text,error_message text,result_image_url text,result_image_urls text[]); GRANT SELECT,INSERT,UPDATE ON image_generation_jobs TO service_role;
 GRANT USAGE ON SCHEMA auth TO authenticated,service_role;`);
 sql(readFileSync('supabase/migrations/20260930071352_arc_daily_image_credits.sql','utf8'));
 // Existing cloud RPC is separately tested with full cloud schema; test this ledger in isolation.
 sql(`CREATE TABLE fixture_clock(at timestamptz NOT NULL); INSERT INTO fixture_clock VALUES(now()); CREATE FUNCTION fixture_now() RETURNS timestamptz LANGUAGE sql SECURITY DEFINER AS $$SELECT at FROM fixture_clock$$;`);
 sql(readFileSync('supabase/migrations/20261006031918_monthly_image_policy.sql','utf8').replaceAll('now()','public.fixture_now()'));
 assert.equal(snapshot(free).remaining,30);assert.equal(snapshot(boost).remaining,250);assert.equal(snapshot(admin).remaining,null);
 const a=job(free);assert.equal(reserve(free,a,3).remaining,27);assert.equal(reserve(free,a,3).remaining,27);assert.throws(()=>reserve(free,a,2),/conflict/);assert.throws(()=>reserve(boost,a),/Invalid image job/);
 assert.equal(reserve(free,job(free,'gemini-3.1-flash-lite-image','native')).allowed,false);
 assert.equal(reserve(free,job(free,'gpt-image-2.5-flare','medium')).allowed,false);
 finish(a,1);assert.equal(snapshot(free).remaining,29);finish(a,0);assert.equal(snapshot(free).remaining,29);
 const pending=job(free);reserve(free,pending);const key=randomUUID();assert.equal(claim(free,key).remaining,30);assert.equal(claim(free,key).remaining,30);assert.throws(()=>claim(free),/unavailable/);finish(pending,0);assert.equal(snapshot(free).remaining,30,'Old refund cannot inflate replacement');
 const configs=[['gpt-image-2.5-flare','medium',1],['gpt-image-2.5-sunburst','high',4],['gemini-3.1-flash-lite-image','native',3],['gemini-3.1-flash-image','native',5]];
 for(const [model,q,cost]of configs){const j=job(boost,model,q);assert.equal(reserve(boost,j,3).unitCost,cost);finish(j,2);}
 assert.equal(snapshot(boost).remaining,224);
 const large=job(boost,'gpt-image-2.5-sunburst','high','3:2');assert.equal(reserve(boost,large).unitCost,6);
 const p=preview({operation:'policy',reason:'test toggle',free_refill_enabled:false,boost_refill_enabled:false});confirm(p);assert.equal(snapshot(free).refillEnabled,false);assert.throws(()=>claim(boost),/unavailable/);assert.equal(snapshot(free).remaining,30);
 const bonus=preview({operation:'offer',reason:'test offer',tier:'boost',kind:'bonus',title:'Holiday',amount:20,startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()});confirm(bonus);confirm(bonus);assert.equal(snapshot(boost).bonusRemaining,20);
 const dashboard=parse(sql(auth(admin)+`SELECT admin_arc_images('dashboard');`));assert.equal(dashboard.offers.length,1);const offerId=dashboard.offers[0].id;
 reserve(boost,job(boost,'gemini-3.1-flash-lite-image','native'));assert.equal(snapshot(boost).bonusRemaining,17);
 confirm(preview({operation:'offer_status',reason:'revoke',offerId,status:'revoked'}));assert.equal(snapshot(boost).bonusRemaining,0);
 const refill=preview({operation:'offer',reason:'extra refill',tier:'boost',kind:'refill',title:'Update',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()});confirm(refill);
 const offer=parse(sql(auth(admin)+`SELECT admin_arc_images('dashboard');`)).offers.find(o=>o.kind==='refill');claim(boost,randomUUID(),offer.id);assert.equal(snapshot(boost).baseRemaining,250);assert.throws(()=>claim(boost,randomUUID(),offer.id),/unavailable/);
 const unlimited=preview({operation:'offer',reason:'test unlimited',tier:'free',kind:'unlimited',title:'Weekend',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()});confirm(unlimited);assert.equal(snapshot(free).unlimited,true);reserve(free,job(free),3);assert.equal(snapshot(free).baseRemaining,30);assert.equal(reserve(free,job(free,'gemini-3.1-flash-image','native')).allowed,false,'Unlimited campaign does not grant models');
 assert.throws(()=>sql(auth(free)+`SELECT admin_arc_images('dashboard');`),/Admin required/);assert.throws(()=>sql(auth(free)+`SELECT * FROM arc_image_balances;`),/permission denied/);
 // Simultaneous mixed-cost requests must not overspend a single bucket.
 sql(`UPDATE arc_image_balances SET remaining=5,consumed=245 WHERE user_id='${boost}' AND kind='base';`);
 const js=Array.from({length:8},()=>job(boost,'gemini-3.1-flash-lite-image','native'));
 const outcomes=await Promise.all(js.map(id=>new Promise((resolve,reject)=>{const p=spawn('psql',[...args,'-c',svc+`SELECT reserve_arc_image_credits('${boost}','${id}',1);`]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',c=>c?reject(Error(err)):resolve(parse(out)));})));
 assert.equal(outcomes.filter(x=>x.allowed).length,1);assert.equal(snapshot(boost).remaining,2);

 // Actual fenced cloud path must debit Work while Builder uses separate caps.
 const sid=randomUUID(),rid=randomUUID(),lease=randomUUID(),project=randomUUID();
 const call={id:'call',name:'generate_image',arguments:'{}'};
 const ca={kind:'generate',prompt:'Tree',model:'gpt-image-2.5-flare',count:3,aspectRatio:'1:1',sourceUrls:[],transparent:false,quality:'medium'};
 sql(`INSERT INTO chat_sessions VALUES('${sid}','${boost}'); INSERT INTO cloud_runs VALUES('${rid}','${boost}','chat','running','{}',now()+interval '1 hour','${sid}','${lease}','${JSON.stringify({engine:{turns:1,calls:[call]}})}');`);
 const step=(run,key,a,action='begin',index=0,value=null)=>parse(sql(svc+`SELECT cloud_image_step('${run}','${boost}','${lease}','${key}','${JSON.stringify(call)}','${action}','${JSON.stringify(a)}',${index},${value?`'${value}'`:'NULL'});`));
 const workkey=`${rid}:turn:1:tool:call`,work=step(rid,workkey,ca);assert.equal(work.quota.allowed,false,'Work shares exhausted standard balance');
 sql(`UPDATE arc_image_balances SET remaining=250,consumed=0 WHERE user_id='${boost}' AND kind='base'; DELETE FROM cloud_image_receipts WHERE run_id='${rid}';`);
 const work2=step(rid,workkey,ca);assert.equal(work2.quota.scope,'standard');assert.equal(snapshot(boost).remaining,247);
 // A canceled job only refunds its failed slots once.
 for(let i=0;i<3;i++)step(rid,workkey,ca,'cancel_ready',i);
 assert.equal(snapshot(boost).remaining,250);
 const appid=randomUUID(),appkey=`${appid}:turn:1:tool:call`;
 sql(`INSERT INTO ide_projects VALUES('${project}','${boost}'); INSERT INTO cloud_runs VALUES('${appid}','${boost}','app','running','${JSON.stringify({projectId:project,messages:[{role:'user',content:'Build a photo site'}]})}',now()+interval '1 hour','${sid}','${lease}','${JSON.stringify({engine:{turns:1,calls:[call]}})}');`);
 const ba={...ca,quality:'low',prompt:'Builder asset'};
 const builder=step(appid,appkey,ba);assert.equal(builder.quota.scope,'builder');assert.equal(snapshot(boost).remaining,250);
 assert.equal(step(appid,appkey,ba).job_id,builder.job_id,'Cloud receipt replay is idempotent');
 const pro={...ba,model:'gpt-image-2.5-sunburst',quality:'high',prompt:'premium'};
 const proid=job(boost,pro.model,'high');sql(`UPDATE image_generation_jobs SET image_builder_context=true,image_run_id='${appid}' WHERE id='${proid}';`);
 assert.throws(()=>reserve(boost,proid),/configuration denied/,'Model prompt cannot authorize Builder premium');
 sql(`UPDATE cloud_runs SET request=request||'${JSON.stringify({messages:[{role:'user',content:'Use better images for my app'}]})}'::jsonb WHERE id='${appid}';`);
 assert.equal(reserve(boost,proid).scope,'builder');assert.equal(snapshot(boost).remaining,250);
 sql(`UPDATE arc_image_policy SET builder_run_limit=4;`);
 const blocked=job(boost);sql(`UPDATE image_generation_jobs SET image_builder_context=true,image_run_id='${appid}' WHERE id='${blocked}';`);assert.equal(reserve(boost,blocked).allowed,false);
 // Forged user jobs cannot claim Builder exemption without a real owned app run.
 const forged=job(free);sql(`UPDATE image_generation_jobs SET image_builder_context=true,image_run_id='${appid}' WHERE id='${forged}';`);assert.throws(()=>reserve(free,forged),/context unavailable/);

 // Tier cycling cannot recreate spent credits.
 sql(`UPDATE arc_image_balances SET remaining=2,consumed=248 WHERE user_id='${boost}' AND kind='base'; DELETE FROM subscriptions WHERE user_id='${boost}';`);
 assert.equal(snapshot(boost).baseRemaining,0);
 sql(`INSERT INTO subscriptions VALUES('${boost}','arcai_boost_annual','active',now()+interval '1 year');`);assert.equal(snapshot(boost).remaining,2);
 // Group reset is previewed, applies once, and never resets admins/bonuses.
 const reset=preview({operation:'reset',tier:'boost',reason:'reset test'});assert.equal(reset.preview.affectedUsers,1);confirm(reset);assert.equal(snapshot(boost).baseRemaining,250);
 reserve(boost,job(boost),1);confirm(reset);assert.equal(snapshot(boost).baseRemaining,249,'Confirmation replay cannot reset twice');
 const late=job(boost);reserve(boost,late,3);
 // Real SQL under a controlled fixture clock verifies UTC calendar renewal and late refund isolation.
 sql(`UPDATE fixture_clock SET at=(date_trunc('month',at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';`);
 assert.equal(snapshot(free).remaining,30);assert.equal(snapshot(boost).remaining,250);assert.equal(snapshot(free).unlimited,false,'Expired unlimited offer stops automatically');
 finish(late,0);assert.equal(snapshot(boost).remaining,250,'Late refund cannot increase next month');
 confirm(preview({operation:'policy',reason:'enable refill',free_refill_enabled:true,boost_refill_enabled:true}));
 assert.equal(snapshot(free).canRefill,true,'New UTC month re-enables once-monthly refill');claim(free);assert.equal(snapshot(free).canRefill,false);
 const anon=randomUUID();sql(`INSERT INTO auth.users(id,is_anonymous) VALUES('${anon}',true);`);assert.throws(()=>snapshot(anon),/Registered account/);assert.throws(()=>claim(anon),/Invalid refill/);
 console.log('Monthly image policy Postgres: tier/model restrictions, weights, idempotency, ownership, partial refunds, refill fencing/toggle, admin grants/revocation, extra refill, unlimited campaigns, privilege checks and concurrent cap passed.');
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true});}
