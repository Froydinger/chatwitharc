begin;
set local lock_timeout = '2s';
create table public.cloud_image_receipts (
  receipt_key text primary key,
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  call jsonb not null,
  args jsonb not null,
  job_id uuid not null unique references public.image_generation_jobs(id) on delete cascade,
  slots jsonb not null,
  settled boolean not null default false,
  quota jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.cloud_image_receipts enable row level security;
revoke all on public.cloud_image_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.cloud_image_receipts to service_role;
create index cloud_image_receipts_owner on public.cloud_image_receipts(user_id);

-- No browser writes, no bearer retention. Begin/start require the live run;
-- accept/finish may reconcile a paid result after cancellation/lease loss.
-- Reconciliation never dispatches a new paid request or writes chat messages.
create function public.cloud_image_step(
  p_run_id uuid, p_user_id uuid, p_lease_token uuid, p_receipt_key text,
  p_call jsonb, p_action text, p_args jsonb default null,
  p_index integer default 0, p_value text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  m public.cloud_image_receipts%rowtype;
  slot jsonb; q jsonb; jid uuid; n integer; model text; urls text[];
  dispatch boolean := false;
begin
  if p_action not in ('begin','start','accept','finish','fail','cancel_ready') or p_action is null
    or p_index is null or p_index not between 0 and 2 then raise exception 'Invalid image action'; end if;
  if p_action in ('begin','start') then
    select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id;
    if not found then raise exception 'Image run fenced'; end if;
    perform 1 from public.chat_sessions where id=r.session_id and user_id=p_user_id for update;
    if not found then raise exception 'Image session fenced'; end if;
    select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id for update;
    if r.status <> 'running' or p_lease_token is null or r.lease_token is distinct from p_lease_token
      or r.lease_expires_at <= clock_timestamp() then raise exception 'Image lease fenced'; end if;
    if p_receipt_key is distinct from (p_run_id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id'))
      or p_call->>'name' not in ('generate_image','edit_image')
      or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
      then raise exception 'Image call mismatch'; end if;
    if not exists(select 1 from auth.users where id=p_user_id and not coalesce(is_anonymous,false)) then raise exception 'Image account required'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,739));
  select * into m from public.cloud_image_receipts where receipt_key=p_receipt_key for update;
  if found and (m.user_id is distinct from p_user_id or m.run_id is distinct from p_run_id or m.call is distinct from p_call)
    then raise exception 'Image receipt conflict'; end if;
  if m.receipt_key is null then
    if p_action <> 'begin' then raise exception 'Missing image receipt'; end if;
    n := (p_args->>'count')::integer;
    model := p_args->>'model';
    if n is null or n not between 1 and 3 or model is null or model not in ('gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2')
      or p_args->>'kind' not in ('generate','edit') or length(p_args->>'prompt') not between 1 and 12000 then raise exception 'Invalid image arguments'; end if;
    -- Same owner/content cannot silently replace an unresolved paid operation.
    if exists(select 1 from public.cloud_image_receipts x where x.user_id=p_user_id and x.args=p_args and not x.settled)
      then raise exception 'Image recovery required for existing request'; end if;
    insert into public.image_generation_jobs(user_id,job_type,prompt,aspect_ratio,preferred_model,status)
      values(p_user_id,p_args->>'kind',p_args->>'prompt',p_args->>'aspectRatio',model,'processing') returning id into jid;
    q := public.reserve_image_quota(p_user_id,jid,n);
    insert into public.cloud_image_receipts(receipt_key,run_id,user_id,call,args,job_id,slots,quota,settled)
      values(p_receipt_key,p_run_id,p_user_id,p_call,p_args,jid,
        (select jsonb_agg(jsonb_build_object('state',case when (q->>'allowed')::boolean then 'ready' else 'failed' end)) from generate_series(1,n)),q,not (q->>'allowed')::boolean)
      returning * into m;
    if m.settled then update public.image_generation_jobs set status='failed',error_type='daily_limit',error_message='Image quota or model entitlement denied' where id=jid; end if;
  end if;
  if p_args is not null and m.args is distinct from p_args then raise exception 'Image argument conflict'; end if;
  if p_action='begin' or m.settled then return to_jsonb(m)||jsonb_build_object('dispatch',false); end if;
  if p_index >= jsonb_array_length(m.slots) then raise exception 'Invalid image slot'; end if;
  slot := m.slots->p_index;
  if p_action='start' and slot->>'state'='ready' then
    if r.lease_expires_at <= clock_timestamp() then raise exception 'Image lease expired'; end if;
    if m.args->>'model' in ('gpt-image-2.5-sunburst','gpt-image-2') and not public.user_has_boost(p_user_id)
      and not exists(select 1 from public.admin_users where user_id=p_user_id) then raise exception 'Image entitlement changed'; end if;
    slot := jsonb_build_object('state','submitting'); dispatch := true;
  elsif p_action='accept' then
    if p_value is null or p_value !~ '^resp_[A-Za-z0-9_-]+$' then raise exception 'Invalid provider response'; end if;
    if slot->>'responseId' is not null and slot->>'responseId' <> p_value then raise exception 'Provider response conflict'; end if;
    if slot->>'state'='submitting' then slot := jsonb_build_object('state','pending','responseId',p_value); end if;
  elsif p_action='finish' then
    if slot->>'state'='pending' then
      if p_value is null or length(p_value)>2048 or p_value !~ '^https://' then raise exception 'Invalid image URL'; end if;
      slot := slot || jsonb_build_object('state','done','url',p_value);
    elsif slot->>'state'='done' and slot->>'url' is distinct from p_value then raise exception 'Image output conflict'; end if;
  elsif p_action='fail' and slot->>'state' in ('ready','submitting','pending') then
    -- Caller only invokes for confirmed provider rejection/terminal failure.
    slot := slot || jsonb_build_object('state','failed');
  elsif p_action='cancel_ready' and slot->>'state'='ready' then
    slot := jsonb_build_object('state','failed');
  end if;
  m.slots := jsonb_set(m.slots,array[p_index::text],slot);
  if not exists(select 1 from jsonb_array_elements(m.slots) s where s->>'state' not in ('done','failed')) then
    select coalesce(array_agg(s->>'url' order by ord),'{}') into urls
      from jsonb_array_elements(m.slots) with ordinality as t(s,ord) where s->>'state'='done';
    perform public.finalize_image_quota(m.job_id,cardinality(urls));
    update public.image_generation_jobs set status=case when cardinality(urls)>0 then 'completed' else 'failed' end,
      result_image_url=urls[1],result_image_urls=urls,error_type=case when cardinality(urls)=0 then 'provider_error' else null end
      where id=m.job_id and user_id=p_user_id;
    m.settled := true;
  end if;
  update public.cloud_image_receipts set slots=m.slots,settled=m.settled where receipt_key=p_receipt_key returning * into m;
  return to_jsonb(m)||jsonb_build_object('dispatch',dispatch);
end;
$$;
revoke all on function public.cloud_image_step(uuid,uuid,uuid,text,jsonb,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.cloud_image_step(uuid,uuid,uuid,text,jsonb,text,jsonb,integer,text) to service_role;
commit;
