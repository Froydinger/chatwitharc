-- Unshipped durable save_memory foundation. No legacy memory/voice changes.
begin;
set local lock_timeout = '2s';
create table public.cloud_memory_receipts (
  receipt_key text primary key,
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  call jsonb not null,
  snapshot jsonb,
  legacy jsonb not null default '[]',
  state text not null default 'ready' check (state in ('ready','started','done','conflict')),
  step integer not null default 0 check (step between 0 and 65),
  draft text not null default '',
  result jsonb,
  created_at timestamptz not null default now()
);
-- Do not cascade receipts on run/session deletion: an ambiguous paid intent
-- must not disappear and allow silent repeat synthesis in a different run.
create index cloud_memory_receipts_owner_idx on public.cloud_memory_receipts(user_id);
create unique index cloud_memory_one_started_owner on public.cloud_memory_receipts(user_id) where state='started';
alter table public.cloud_memory_receipts enable row level security;
revoke all on public.cloud_memory_receipts from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.cloud_memory_receipts to service_role;

create function public.cloud_memory_legacy(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(content order by ordering,created_at,content),'[]') from (
    select distinct on (lower(regexp_replace(btrim(content),'\s+',' ','g')))
      btrim(content) as content,ordering,created_at from (
      select unnest(string_to_array(memory_info,E'\n')) as content,0 as ordering,null::timestamptz as created_at
        from public.profiles where user_id=p_user_id
      union all select content,1,created_at from public.context_blocks where user_id=p_user_id
    ) raw where nullif(btrim(content),'') is not null
    order by lower(regexp_replace(btrim(content),'\s+',' ','g')),ordering,created_at,content
  ) deduped;
$$;
revoke all on function public.cloud_memory_legacy(uuid) from public,anon,authenticated;
grant execute on function public.cloud_memory_legacy(uuid) to service_role;

-- All steps are fenced. begin is read/replay or creates a durable snapshot;
-- start atomically records a paid intent; save records its known result;
-- commit CASes the complete snapshot and settles the receipt in one transaction.
create function public.cloud_memory_step(
  p_run_id uuid, p_user_id uuid, p_lease_token uuid, p_receipt_key text,
  p_call jsonb, p_action text, p_step integer default 0, p_summary text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  m public.cloud_memory_receipts%rowtype;
  s jsonb;
  legacy_items jsonb;
  updated_row public.memory_summaries%rowtype;
begin
  if p_action is null or p_action not in ('begin','start','save','commit')
    or p_step is null or p_step not between 0 and 64 then
    raise exception 'Invalid memory step' using errcode='22023';
  end if;
  -- Session then run, matching the durable chat RPCs. No extra auth schema
  -- mutation privileges are required; account deletion is enforced by FKs.
  select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id;
  if not found then return jsonb_build_object('status','fenced'); end if;
  perform 1 from public.chat_sessions where id=r.session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('status','fenced'); end if;
  select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id for update;
  if not found or r.status <> 'running' or p_lease_token is null
    or r.lease_token is distinct from p_lease_token or r.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status','fenced');
  end if;
  if p_receipt_key is distinct from (p_run_id::text || ':turn:' || (r.checkpoint#>>'{engine,turns}') || ':tool:' || (p_call->>'id'))
    or p_call->>'name' is distinct from 'save_memory'
    or jsonb_typeof(p_call->'arguments') is distinct from 'string'
    or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call) then
    raise exception 'Memory receipt is not the claimed tool call' using errcode='22023';
  end if;
  -- Serialize short DB steps for an owner, not network work. Hash collisions
  -- only reduce concurrency; they never expand authorization.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,731));
  if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  select * into m from public.cloud_memory_receipts where receipt_key=p_receipt_key for update;
  if found and (m.user_id is distinct from p_user_id or m.run_id is distinct from p_run_id or m.call is distinct from p_call) then
    raise exception 'Memory receipt identity conflict' using errcode='23505';
  end if;
  if p_action='begin' then
    if m.receipt_key is not null then return to_jsonb(m) || jsonb_build_object('status',m.state); end if;
    if exists(select 1 from public.cloud_memory_receipts where user_id=p_user_id and state='started') then
      return jsonb_build_object('status','recovery_required');
    end if;
    select to_jsonb(x) into s from public.memory_summaries x where user_id=p_user_id;
    legacy_items := '[]';
    if not coalesce((s->>'migrated_from_legacy')::boolean,false) then
      legacy_items := public.cloud_memory_legacy(p_user_id);
    end if;
    insert into public.cloud_memory_receipts(receipt_key,run_id,user_id,call,snapshot,legacy,draft)
      values(p_receipt_key,p_run_id,p_user_id,p_call,s,legacy_items,coalesce(s->>'summary','')) returning * into m;
    return to_jsonb(m) || jsonb_build_object('status','ready');
  end if;
  if m.receipt_key is null then raise exception 'Missing memory receipt' using errcode='22023'; end if;
  if m.state='done' then return to_jsonb(m) || jsonb_build_object('status','done'); end if;
  if m.state='conflict' then return jsonb_build_object('status','conflict'); end if;
  if m.step <> p_step then return jsonb_build_object('status','conflict'); end if;
  if p_action='start' then
    if m.state <> 'ready' or exists(select 1 from public.cloud_memory_receipts where user_id=p_user_id and state='started') then
      return jsonb_build_object('status','recovery_required');
    end if;
    update public.cloud_memory_receipts set state='started' where receipt_key=p_receipt_key;
    return jsonb_build_object('status','started');
  end if;
  if p_action='save' then
    if m.state <> 'started' or p_summary is null or length(p_summary)>12000 then
      raise exception 'Invalid synthesized memory result' using errcode='22023';
    end if;
    update public.cloud_memory_receipts set state='ready',draft=p_summary,step=step+1 where receipt_key=p_receipt_key;
    return jsonb_build_object('status','ready');
  end if;
  if m.state <> 'ready' or m.step < 1 then return jsonb_build_object('status','recovery_required'); end if;
  select to_jsonb(x) into s from public.memory_summaries x where user_id=p_user_id for update;
  if s is distinct from m.snapshot or (not coalesce((m.snapshot->>'migrated_from_legacy')::boolean,false)
    and public.cloud_memory_legacy(p_user_id) is distinct from m.legacy) then
    update public.cloud_memory_receipts set state='conflict' where receipt_key=p_receipt_key;
    return jsonb_build_object('status','conflict');
  end if;
  if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  if s is null then
    insert into public.memory_summaries(user_id,summary,revision,migrated_from_legacy,legacy_item_count)
      values(p_user_id,m.draft,1,true,jsonb_array_length(m.legacy)) on conflict(user_id) do nothing returning * into updated_row;
    if not found then
      update public.cloud_memory_receipts set state='conflict' where receipt_key=p_receipt_key;
      return jsonb_build_object('status','conflict');
    end if;
  else
    update public.memory_summaries set summary=m.draft,revision=revision+1,migrated_from_legacy=true,
      legacy_item_count=case when not migrated_from_legacy then jsonb_array_length(m.legacy) else legacy_item_count end
      where user_id=p_user_id returning * into updated_row;
  end if;
  update public.cloud_memory_receipts set state='done',result=jsonb_build_object('saved',true,'revision',updated_row.revision)
    where receipt_key=p_receipt_key returning * into m;
  return to_jsonb(m) || jsonb_build_object('status','done');
end;
$$;
revoke all on function public.cloud_memory_step(uuid,uuid,uuid,text,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.cloud_memory_step(uuid,uuid,uuid,text,jsonb,text,integer,text) to service_role;
commit;
