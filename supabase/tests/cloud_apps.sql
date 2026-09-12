-- Rollback-only regression fixtures; run with cloud_apps_local.mjs.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','app-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','other@example.invalid');
insert into public.admin_users(user_id) values('00000000-0000-4000-8000-000000000001');
insert into public.chat_sessions(id,user_id,title,messages) values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','app','[]');
insert into public.ide_projects(id,user_id,files,versions) values
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',
  '{"src/App.tsx":{"content":"initial","language":"tsx"}}','{"app_db":{"keep":1},"app_users":[{"name":"keep"}]}');
insert into public.cloud_runs(id,user_id,session_id,kind,mode,request,status,lease_token,lease_expires_at) values
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',
  'app','auto','{"projectId":"00000000-0000-4000-8000-000000000004","messages":[{"role":"user","content":"build"}]}',
  'running','00000000-0000-4000-8000-000000000006',now()+interval '10 minutes');
update public.cloud_runs set submission_message='{"id":"new-user-turn","role":"user","content":"build","timestamp":"2026-09-12T00:00:00Z"}'
where id='00000000-0000-4000-8000-000000000005';

set local role service_role;
set local request.jwt.claim.role='service_role';
do $$
declare
 r uuid := '00000000-0000-4000-8000-000000000005';
 token uuid := '00000000-0000-4000-8000-000000000006';
 call jsonb; op jsonb; receipt text; result jsonb; original jsonb;
begin
 result := public.cloud_app_step(r,token,'open');
 perform pg_temp.check(result->>'status'='ready','admin accepted and workspace persisted');
 perform pg_temp.check((select cloud_managed from public.ide_projects where id='00000000-0000-4000-8000-000000000004'),'project protected');
 perform pg_temp.check((public.cloud_app_step(r,gen_random_uuid(),'open')->>'status')='fenced','stale lease blocked');
 op := '{"expectedVersion":0,"writes":[{"path":"src/App.tsx","content":"round one","language":"tsx"}],"deletes":[]}';
 call := jsonb_build_object('id','write-one','name','apply_app_files','arguments',op::text);
 receipt := r::text||':turn:1:tool:write-one';
 update public.cloud_runs set checkpoint=jsonb_build_object('engine',jsonb_build_object('phase','tools','turns',1,'calls',jsonb_build_array(call),
   'receipts',jsonb_build_object(receipt,jsonb_build_object('state','started')))) where id=r;
 result := public.cloud_app_step(r,token,'apply',receipt,call);
 perform pg_temp.check(result->>'status'='saved' and (result->>'version')::int=1,'draft version saved');
 perform pg_temp.check((select files#>>'{src/App.tsx,content}' from public.ide_projects where id='00000000-0000-4000-8000-000000000004')='initial','draft not prematurely published');
 result := public.cloud_app_step(r,token,'apply',receipt,call);
 perform pg_temp.check(result->>'replayed'='true','same receipt safe after lost response');
 perform pg_temp.check((select count(*) from public.cloud_app_versions where run_id=r)=2,'no duplicate version');
 -- Another semantic round after process reconstruction.
 op := '{"expectedVersion":1,"writes":[{"path":"src/App.tsx","content":"round two","language":"tsx"}],"deletes":[]}';
 call := jsonb_build_object('id','write-two','name','apply_app_files','arguments',op::text);
 receipt := r::text||':turn:2:tool:write-two';
 update public.cloud_runs set checkpoint=jsonb_build_object('engine',jsonb_build_object('phase','tools','turns',2,'calls',jsonb_build_array(call),
   'receipts',jsonb_build_object(receipt,jsonb_build_object('state','started')))) where id=r;
 result := public.cloud_app_step(r,token,'apply',receipt,call);
 perform pg_temp.check(result->>'status'='saved' and result->>'version'='2','second round version');
 -- Revocation is rechecked server-side, even with an existing workspace.
 delete from public.admin_users where user_id='00000000-0000-4000-8000-000000000001';
 perform pg_temp.check(public.cloud_app_step(r,token,'open')->>'status'='denied','revoked Boost/admin blocks continuation');
 insert into public.subscriptions(user_id,price_id,status,stripe_subscription_id) values
 ('00000000-0000-4000-8000-000000000001','arcai_boost_monthly','active','sub_fixture');
 perform pg_temp.check(public.cloud_app_step(r,token,'open')->>'status'='ready','current subscription accepted');
 update public.cloud_runs set checkpoint=jsonb_set(checkpoint,'{engine,phase}','"done"') where id=r;
 original := (select versions from public.ide_projects where id='00000000-0000-4000-8000-000000000004');
 result := public.cloud_app_step(r,token,'complete',null,null,'{}','{"content":"Finished","timestamp":"2026-09-12T00:00:00Z"}');
 perform pg_temp.check(result->>'status'='completed','atomic publication completes');
 perform pg_temp.check((select files#>>'{src/App.tsx,content}' from public.ide_projects where id='00000000-0000-4000-8000-000000000004')='round two','latest draft published');
 perform pg_temp.check((select versions from public.ide_projects where id='00000000-0000-4000-8000-000000000004')=original,'app users/database retained');
 perform pg_temp.check((select jsonb_array_length(messages) from public.ide_projects where id='00000000-0000-4000-8000-000000000004')=2,'user and assistant IDE history appended');
 perform pg_temp.check((select messages->0->>'ideProjectId' from public.chat_sessions where id='00000000-0000-4000-8000-000000000003')='00000000-0000-4000-8000-000000000004','IDE artifact attached atomically');
 perform pg_temp.check(public.cloud_app_step(r,token,'complete')->>'status'='fenced','terminal replay cannot republish');
end; $$;
-- Independent ask-mode run: exact approvals, invalid paths, stale versions and
-- a concurrent project edit before publication all fail without overwriting.
insert into public.cloud_runs(id,user_id,session_id,kind,mode,request,status,lease_token,lease_expires_at) values
 ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',
  'app','ask','{"projectId":"00000000-0000-4000-8000-000000000004","messages":[{"role":"user","content":"change"}]}',
  'running','00000000-0000-4000-8000-000000000008',now()+interval '10 minutes');
do $$
declare
 r uuid := '00000000-0000-4000-8000-000000000007';
 token uuid := '00000000-0000-4000-8000-000000000008';
 call jsonb; receipt text; hash text; cp jsonb;
begin
 perform public.cloud_app_step(r,token,'open');
 call := jsonb_build_object('id','approved','name','apply_app_files','arguments',
   '{"expectedVersion":0,"writes":[{"path":"src/App.tsx","content":"new draft","language":"tsx"}],"deletes":[]}');
 receipt := r::text||':turn:1:tool:approved';
 cp := jsonb_build_object('engine',jsonb_build_object('phase','tools','turns',1,'calls',jsonb_build_array(call),
   'receipts',jsonb_build_object(receipt,jsonb_build_object('state','started'))));
 update public.cloud_runs set checkpoint=cp where id=r;
 perform pg_temp.check(public.cloud_app_step(r,token,'apply',receipt,call)->>'status'='denied','ask requires exact approval');
 hash := encode(sha256(convert_to((call->>'name')||E'\n'||(call->>'arguments'),'UTF8')),'hex');
 cp := cp||jsonb_build_object('pendingApproval',jsonb_build_object('callId','approved','argumentsHash',hash),
   'inputResponse',jsonb_build_object('decision','approve','callId','approved','argumentsHash',hash));
 update public.cloud_runs set checkpoint=cp where id=r;
 perform pg_temp.check(public.cloud_app_step(r,token,'apply',receipt,call)->>'status'='saved','approved mutation saves');
 update public.cloud_runs set mode='auto' where id=r;
 call := jsonb_build_object('id','stale','name','apply_app_files','arguments',
   '{"expectedVersion":0,"writes":[{"path":"src/App.tsx","content":"stale","language":"tsx"}],"deletes":[]}');
 receipt := r::text||':turn:2:tool:stale';
 update public.cloud_runs set checkpoint=jsonb_build_object('engine',jsonb_build_object('phase','tools','turns',2,'calls',jsonb_build_array(call),
   'receipts',jsonb_build_object(receipt,jsonb_build_object('state','started')))) where id=r;
 perform pg_temp.check(public.cloud_app_step(r,token,'apply',receipt,call)->>'status'='conflict','stale draft version conflicts');
 call := jsonb_set(call,'{arguments}',to_jsonb('{"expectedVersion":1,"writes":[{"path":"../bad","content":"bad","language":"tsx"}],"deletes":[]}'::text));
 update public.cloud_runs set checkpoint=jsonb_set(checkpoint,'{engine,calls}',jsonb_build_array(call)) where id=r;
 begin
   perform public.cloud_app_step(r,token,'apply',receipt,call);
   raise exception 'FAIL: traversal accepted';
 exception when invalid_parameter_value then null; end;
 update public.ide_projects set files='{"src/App.tsx":{"content":"concurrent newer content","language":"tsx"}}'
   where id='00000000-0000-4000-8000-000000000004';
 update public.cloud_runs set checkpoint=jsonb_set(checkpoint,'{engine,phase}','"done"') where id=r;
 perform pg_temp.check(public.cloud_app_step(r,token,'complete',null,null,'{}','{"content":"done"}')->>'status'='conflict','publication CAS rejects concurrent changes');
 perform pg_temp.check((select files#>>'{src/App.tsx,content}' from public.ide_projects where id='00000000-0000-4000-8000-000000000004')='concurrent newer content','newer project not overwritten');
 perform pg_temp.check((select count(*) from public.cloud_app_versions where run_id=r)=2,'draft retained after conflict');
 update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where id=r;
 perform pg_temp.check(public.cloud_app_step(r,token,'complete')->>'status'='fenced','cancellation blocks publication');
end; $$;
reset role;
-- Real authenticated RLS read and raw-write guard.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from public.cloud_app_versions)=0,'other owner cannot read artifacts');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from public.cloud_app_versions)=5,'owner can read immutable history');
do $$ begin
 begin
  update public.ide_projects set files='{}' where id='00000000-0000-4000-8000-000000000004';
  raise exception 'FAIL: protected raw save accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.cloud_app_step('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006','open');
  raise exception 'FAIL: authenticated invoked worker RPC';
 exception when insufficient_privilege then null; end;
end; $$;
set local request.jwt.claim.role='authenticated';
do $$
declare
 p uuid := '00000000-0000-4000-8000-000000000004';
 operation uuid := '00000000-0000-4000-8000-000000000009';
 rev bigint; history jsonb; files jsonb := '{"src/App.tsx":{"content":"manual edit","language":"tsx"}}';
 receipt jsonb;
begin
 select cloud_revision,messages into rev,history from public.ide_projects where id=p;
 receipt := public.save_cloud_app_project(operation,p,rev,files,history);
 perform pg_temp.check(receipt->>'replayed'='false','manual protected save accepted with exact revision');
 perform pg_temp.check(public.save_cloud_app_project(operation,p,rev,files,history)->>'replayed'='true','manual save stable UUID replay');
 begin
   perform public.save_cloud_app_project(gen_random_uuid(),p,rev,files,history);
   raise exception 'FAIL: stale manual snapshot accepted';
 exception when serialization_failure then null; end;
 begin
   perform public.save_cloud_app_project(operation,p,rev,'{}',history);
   raise exception 'FAIL: operation identity reused with different data';
 exception when unique_violation then null; end;
end; $$;
rollback;
