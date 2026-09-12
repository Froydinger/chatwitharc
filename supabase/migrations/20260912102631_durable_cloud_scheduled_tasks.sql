-- Unshipped: durable tool mutations only, NOT an exactly-once task dispatcher.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.cloud_scheduled_receipts (
  receipt_key text primary key,
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  call jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
-- No task/run FK: deletion must not erase the evidence and recreate a task.
create index cloud_scheduled_receipts_owner_idx on public.cloud_scheduled_receipts(user_id);
alter table public.cloud_scheduled_receipts enable row level security;
revoke all on public.cloud_scheduled_receipts from public,anon,authenticated,service_role;
grant select,insert on public.cloud_scheduled_receipts to service_role;

-- Strict subset of the existing runner's UTC cron grammar; no silent fallback.
create function public.cloud_scheduled_cron_field(p_expr text,p_min integer,p_max integer)
returns integer[] language plpgsql immutable security invoker set search_path='' as $$
declare part text; lo integer; hi integer; stride integer; result integer[] := '{}';
begin
  if p_expr is null or length(p_expr)>100 then raise exception 'Invalid cron field'; end if;
  foreach part in array string_to_array(p_expr,',') loop
    stride:=1;
    if part='*' then lo:=p_min; hi:=p_max;
    elsif part ~ '^\*/[0-9]{1,2}$' then
      stride:=split_part(part,'/',2)::integer;
      if stride<1 or stride>p_max+1 then raise exception 'Invalid cron step'; end if;
      -- Legacy runner uses value modulo step, including day/month fields.
      lo:=p_min + ((stride - p_min % stride) % stride); hi:=p_max;
    elsif part ~ '^[0-9]{1,2}-[0-9]{1,2}$' then
      lo:=split_part(part,'-',1)::integer; hi:=split_part(part,'-',2)::integer;
    elsif part ~ '^[0-9]{1,2}$' then lo:=part::integer; hi:=lo;
    else raise exception 'Invalid cron field'; end if;
    if lo<p_min or hi>p_max or lo>hi then raise exception 'Invalid cron range'; end if;
    result:=result || array(select generate_series(lo,hi,stride));
  end loop;
  return result;
end; $$;
create function public.cloud_scheduled_next_cron(p_expr text,p_after timestamptz)
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare f text[]; mins integer[]; hours integer[]; dom integer[]; mon integer[]; dow integer[]; result timestamptz;
begin
  if p_expr is null or length(p_expr)>200 or p_after is null then raise exception 'Invalid cron'; end if;
  f:=regexp_split_to_array(btrim(p_expr),'\s+');
  if cardinality(f)<>5 then raise exception 'Expected five UTC cron fields'; end if;
  mins:=public.cloud_scheduled_cron_field(f[1],0,59);
  hours:=public.cloud_scheduled_cron_field(f[2],0,23);
  dom:=public.cloud_scheduled_cron_field(f[3],1,31);
  mon:=public.cloud_scheduled_cron_field(f[4],1,12);
  dow:=public.cloud_scheduled_cron_field(f[5],0,6);
  select min((d + make_interval(hours=>h,mins=>m)) at time zone 'UTC') into result
    from generate_series(date_trunc('day',p_after at time zone 'UTC'),
      date_trunc('day',p_after at time zone 'UTC')+interval '366 days',interval '1 day') d,
      unnest(hours) h,unnest(mins) m
    where extract(day from d)::integer=any(dom) and extract(month from d)::integer=any(mon)
      and extract(dow from d)::integer=any(dow)
      and (d+make_interval(hours=>h,mins=>m)) at time zone 'UTC'>p_after;
  if result is null then raise exception 'No cron occurrence within 366 days'; end if;
  return result;
end; $$;

create function public.cloud_scheduled_step(
  p_run_id uuid,p_user_id uuid,p_lease_token uuid,p_receipt_key text,p_call jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype; receipt public.cloud_scheduled_receipts%rowtype;
  task public.scheduled_tasks%rowtype; args jsonb; result jsonb; name text;
  allowed text[]; k text; next_at timestamptz; target uuid; version text; call_hash text;
begin
  -- Match all cloud mutations: session -> run -> task. No network under locks.
  select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id;
  if not found then return jsonb_build_object('status','fenced'); end if;
  perform 1 from public.chat_sessions where id=r.session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('status','fenced'); end if;
  select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id for update;
  if not found or r.status<>'running' or p_lease_token is null or r.lease_token is distinct from p_lease_token
    or r.lease_expires_at is null or r.lease_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','fenced'); end if;
  name:=p_call->>'name';
  if p_receipt_key is null or p_receipt_key is distinct from
    (p_run_id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id'))
    or name is null or name not in ('get_scheduled_task','schedule_task','update_scheduled_task')
    or jsonb_typeof(p_call->'arguments') is distinct from 'string'
    or length(p_call->>'arguments')>12000
    or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
    then raise exception 'Not the claimed scheduled tool call' using errcode='22023'; end if;
  select * into receipt from public.cloud_scheduled_receipts where receipt_key=p_receipt_key;
  if found then
    if receipt.run_id is distinct from p_run_id or receipt.user_id is distinct from p_user_id or receipt.call is distinct from p_call
      then raise exception 'Scheduled receipt identity conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','done','receipt_key',p_receipt_key,'run_id',p_run_id,'user_id',p_user_id,'call',p_call,'result',receipt.result);
  end if;
  -- A service caller still must present the exact persisted Ask approval.
  if name<>'get_scheduled_task' and r.mode='ask' then
    call_hash:=encode(sha256(convert_to(name||E'\n'||(p_call->>'arguments'),'UTF8')),'hex');
    if r.checkpoint#>>'{pendingApproval,callId}' is distinct from p_call->>'id'
      or r.checkpoint#>>'{pendingApproval,argumentsHash}' is distinct from call_hash
      or r.checkpoint#>>'{inputResponse,callId}' is distinct from p_call->>'id'
      or r.checkpoint#>>'{inputResponse,argumentsHash}' is distinct from call_hash
      or r.checkpoint#>>'{inputResponse,decision}' is distinct from 'approve' then
      return jsonb_build_object('status','approval_required'); end if;
  end if;
  args:=(p_call->>'arguments')::jsonb;
  if jsonb_typeof(args) is distinct from 'object' then raise exception 'Invalid arguments'; end if;
  allowed:=case name when 'get_scheduled_task' then array['task_id']
    when 'schedule_task' then array['title','prompt','when_iso','cron_expr','deliver_push','deliver_email']
    else array['task_id','expected_version','title','prompt','when_iso','cron_expr','deliver_push','deliver_email','cancel'] end;
  if exists(select 1 from jsonb_object_keys(args) x where not x=any(allowed)) then raise exception 'Unexpected scheduled argument'; end if;
  foreach k in array array['title','prompt','when_iso','cron_expr','task_id','expected_version'] loop
    if args ? k and args->k<>'null'::jsonb and jsonb_typeof(args->k)<>'string' then raise exception 'Invalid string argument'; end if;
  end loop;
  foreach k in array array['deliver_push','deliver_email','cancel'] loop
    if args ? k and args->k<>'null'::jsonb and jsonb_typeof(args->k)<>'boolean' then raise exception 'Invalid boolean argument'; end if;
  end loop;
  if (args->>'title' is not null and (length(btrim(args->>'title'))=0 or length(args->>'title')>200))
    or (args->>'prompt' is not null and (length(btrim(args->>'prompt'))=0 or length(args->>'prompt')>4000))
    or (args->>'when_iso' is not null and args->>'cron_expr' is not null)
    then raise exception 'Invalid scheduled content or time'; end if;
  if name<>'schedule_task' then
    target:=(args->>'task_id')::uuid;
    if name='update_scheduled_task' and (target is null or args->>'expected_version' is null)
      then raise exception 'Resolve task_id and expected_version before approval'; end if;
    select * into task from public.scheduled_tasks where user_id=p_user_id
      and (case when target is null then status='active' else id=target end)
      order by created_at desc,id desc limit 1 for update;
    if not found then result:=jsonb_build_object('performed',false,'reason','not_found');
    else
      version:=encode(sha256(convert_to(to_jsonb(task)::text,'UTF8')),'hex');
      if name='update_scheduled_task' and version is distinct from args->>'expected_version'
        then result:=jsonb_build_object('performed',false,'reason','conflict','task_id',task.id);
      end if;
    end if;
  end if;
  if result is null and name<>'get_scheduled_task' then
    if name='update_scheduled_task' and not coalesce((args->>'cancel')::boolean,false)
      and task.result_chat_id is not null and not exists(select 1 from public.chat_sessions
        where id=task.result_chat_id and user_id=p_user_id and persistence_version=0) then
      -- A preexisting unsafe/missing destination needs explicit reconciliation,
      -- not reactivation of the legacy dispatcher's whole-array write path.
      result:=jsonb_build_object('performed',false,'reason','destination_requires_migration','task_id',task.id);
    end if;
    if name='schedule_task' and (args->>'title' is null or args->>'prompt' is null
      or coalesce(args->>'when_iso',args->>'cron_expr') is null) then raise exception 'Title, prompt and one time required'; end if;
    if name='update_scheduled_task' and coalesce((args->>'cancel')::boolean,false)
      and exists(select 1 from jsonb_each(args) x where x.key not in ('task_id','expected_version','cancel') and x.value<>'null'::jsonb)
      then raise exception 'Cancellation cannot include edits'; end if;
    if args->>'when_iso' is not null then
      if length(args->>'when_iso')>40 or (args->>'when_iso') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' then raise exception 'Expected UTC ISO timestamp'; end if;
      next_at:=(args->>'when_iso')::timestamptz;
      if next_at<=clock_timestamp() then result:=jsonb_build_object('performed',false,'reason','time_elapsed'); end if;
    elsif args->>'cron_expr' is not null then next_at:=public.cloud_scheduled_next_cron(args->>'cron_expr',clock_timestamp()); end if;
  end if;
  if r.lease_expires_at<=clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  if result is null then
    if name='schedule_task' then
      insert into public.scheduled_tasks(user_id,title,prompt,schedule_type,run_at,cron_expr,next_run_at,
        timezone,result_chat_id,push_on_complete,notify_email,model)
      values(p_user_id,args->>'title',args->>'prompt',case when args->>'cron_expr' is null then 'once' else 'cron' end,
        case when args->>'cron_expr' is null then next_at end,args->>'cron_expr',next_at,'UTC',
        -- Isolate delivery from protected cloud transcripts until dispatcher append is atomic.
        null,coalesce((args->>'deliver_push')::boolean,true),coalesce((args->>'deliver_email')::boolean,false),'gpt-5.6-luna') returning * into task;
    elsif name='update_scheduled_task' then
      if coalesce((args->>'cancel')::boolean,false) then
        -- Matches existing cancellation semantics, but receipt survives deletion.
        delete from public.scheduled_tasks where id=task.id and user_id=p_user_id;
        result:=jsonb_build_object('performed',true,'cancelled',true,'task_id',task.id,
          'execution_delivery','Not guaranteed: already picked-up work may still finish.');
      else
        if not exists(select 1 from jsonb_each(args) x where x.key not in ('task_id','expected_version','cancel') and x.value<>'null'::jsonb)
          then raise exception 'No changes requested'; end if;
        -- Never attach legacy runner writes to a cloud-owned transcript.
        -- Existing target is preserved, not overwritten or accepted from model args.
        update public.scheduled_tasks set title=coalesce(args->>'title',title),prompt=coalesce(args->>'prompt',prompt),
          push_on_complete=coalesce((args->>'deliver_push')::boolean,push_on_complete),
          notify_email=coalesce((args->>'deliver_email')::boolean,notify_email),
          schedule_type=case when next_at is null then schedule_type when args->>'cron_expr' is null then 'once' else 'cron' end,
          run_at=case when next_at is null then run_at when args->>'cron_expr' is null then next_at else null end,
          cron_expr=case when next_at is null then cron_expr else args->>'cron_expr' end,
          next_run_at=coalesce(next_at,next_run_at),status=case when next_at is null then status else 'active' end
          where id=task.id and user_id=p_user_id returning * into task;
      end if;
    end if;
    if result is null then result:=jsonb_build_object('performed',name<>'get_scheduled_task','task_id',task.id,
      'expected_version',encode(sha256(convert_to(to_jsonb(task)::text,'UTF8')),'hex'),
      'task',to_jsonb(task)-array['user_id','agent_id'],
      'execution_delivery','Task configuration saved/read only; future execution and delivery are not guaranteed.'); end if;
  end if;
  insert into public.cloud_scheduled_receipts(receipt_key,run_id,user_id,call,result)
    values(p_receipt_key,p_run_id,p_user_id,p_call,result);
  return jsonb_build_object('status','done','receipt_key',p_receipt_key,'run_id',p_run_id,'user_id',p_user_id,'call',p_call,'result',result);
end; $$;
revoke all on function public.cloud_scheduled_cron_field(text,integer,integer),
  public.cloud_scheduled_next_cron(text,timestamptz),public.cloud_scheduled_step(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cloud_scheduled_cron_field(text,integer,integer),
  public.cloud_scheduled_next_cron(text,timestamptz),public.cloud_scheduled_step(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
