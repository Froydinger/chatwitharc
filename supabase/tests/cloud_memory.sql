-- Disposable DB only, all fixtures rolled back. No provider/network calls.
begin;
create function pg_temp.memory_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
insert into auth.users(id,email) values('00000000-0000-4000-8000-00000000d001','memory@example.invalid');
insert into public.chat_sessions(id,user_id,title) values('00000000-0000-4000-8000-00000000d002','00000000-0000-4000-8000-00000000d001','memory');
update public.profiles set memory_info=E'First fact\n FIRST FACT \nSecond fact' where user_id='00000000-0000-4000-8000-00000000d001';
insert into public.context_blocks(user_id,content) values
  ('00000000-0000-4000-8000-00000000d001','Second fact'),
  ('00000000-0000-4000-8000-00000000d001','Third fact');
set local role service_role;
select pg_temp.memory_assert(jsonb_array_length(public.cloud_memory_legacy('00000000-0000-4000-8000-00000000d001'))=3,'legacy profile lines and context deduplicated');
do $$
declare
  owner_id uuid := '00000000-0000-4000-8000-00000000d001';
  sid uuid := '00000000-0000-4000-8000-00000000d002';
  rid uuid; token uuid; call jsonb; key text; response jsonb; mode text;
begin
  foreach mode in array array['ask','auto'] loop
    rid:=gen_random_uuid();
    call:=jsonb_build_object('id','memory-call','name','save_memory','arguments','{"memory":"new fact","replaces":[]}');
    key:=rid::text || ':turn:1:tool:memory-call';
    insert into public.cloud_runs(id,user_id,session_id,mode,request,checkpoint) values(rid,owner_id,sid,mode,'{}',
      jsonb_build_object('engine',jsonb_build_object('turns',1,'calls',jsonb_build_array(call))));
    select lease_token into token from public.claim_cloud_run(rid);
    response:=public.cloud_memory_step(rid,owner_id,token,key,call,'begin');
    perform pg_temp.memory_assert(response->>'status'='ready','begin');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,gen_random_uuid(),key,call,'start')->>'status'='fenced','wrong lease');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,gen_random_uuid(),token,key,call,'start')->>'status'='fenced','wrong owner');
    begin
      perform public.cloud_memory_step(rid,owner_id,token,key || 'wrong',call,'begin');
      raise exception 'FAIL: wrong exact key accepted';
    exception when invalid_parameter_value then null; end;
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'start')->>'status'='started','paid intent');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'start')->>'status'='recovery_required','no repeated synthesis intent');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'begin')->>'status'='started','ambiguous restart retains intent');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'save',0,'new fact')->>'status'='ready','save draft');
    response:=public.cloud_memory_step(rid,owner_id,token,key,call,'commit',1);
    perform pg_temp.memory_assert(response->>'status'='done' and (response#>>'{result,saved}')::boolean,'commit receipt');
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'commit',1)=response,'commit replay exact');
    perform pg_temp.memory_assert((select summary='new fact' from public.memory_summaries where user_id=owner_id),'summary committed');
    perform pg_temp.memory_assert((select legacy_item_count=3 and migrated_from_legacy from public.memory_summaries where user_id=owner_id),'legacy metadata retained');
    perform pg_temp.memory_assert((select count(*)=2 from public.context_blocks where user_id=owner_id),'legacy source remains recoverable');

    -- Simulate an unrelated legacy/voice memory edit between synthesis and CAS.
    call:=call || '{"id":"conflict-call"}';key:=rid::text || ':turn:2:tool:conflict-call';
    update public.cloud_runs set checkpoint=jsonb_build_object('engine',jsonb_build_object('turns',2,'calls',jsonb_build_array(call))) where id=rid;
    perform public.cloud_memory_step(rid,owner_id,token,key,call,'begin');
    perform public.cloud_memory_step(rid,owner_id,token,key,call,'start');
    perform public.cloud_memory_step(rid,owner_id,token,key,call,'save',0,'stale synthesized fact');
    update public.memory_summaries set summary='concurrent fact',revision=revision+1 where user_id=owner_id;
    perform pg_temp.memory_assert(public.cloud_memory_step(rid,owner_id,token,key,call,'commit',1)->>'status'='conflict','snapshot CAS conflict');
    perform pg_temp.memory_assert((select summary='concurrent fact' from public.memory_summaries where user_id=owner_id),'CAS preserves unrelated writer');
    update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where id=rid;
  end loop;
end; $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from public.cloud_memory_receipts;raise exception 'FAIL: private receipts readable';exception when insufficient_privilege then null;end;
  begin perform public.cloud_memory_step(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'key','{}','begin');
    raise exception 'FAIL: client memory RPC allowed';exception when insufficient_privilege then null;end;
end; $$;
reset role;
rollback;
select 'PASS: cloud memory ownership/fencing, exact keys, no repeated intent, draft recovery, CAS, receipt atomicity, privileges, Ask/Auto' as result;
