-- UNShipped. Disable the legacy run-scheduled-tasks cron BEFORE wiring this
-- dispatcher. Both dispatchers must never consume scheduled_tasks together.
begin;
set local lock_timeout='2s';
create table public.cloud_scheduled_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  snapshot jsonb not null,
  state text not null default 'ready' check(state in ('ready','starting','accepted','result','completed','cancelled','recovery_required')),
  provider_id text,
  output text,
  chat_id uuid not null default gen_random_uuid(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(task_id,scheduled_for)
);
create index cloud_scheduled_occurrences_owner on public.cloud_scheduled_occurrences(user_id);
create table public.cloud_scheduled_outbox (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.cloud_scheduled_occurrences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in ('push','email')),
  state text not null default 'ready' check(state in ('ready','sending','sent','cancelled','recovery_required')),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_receipt jsonb,
  unique(occurrence_id,channel)
);
create index cloud_scheduled_outbox_owner on public.cloud_scheduled_outbox(user_id);
create index cloud_scheduled_outbox_pending on public.cloud_scheduled_outbox(state) where state in ('ready','sending');
alter table public.cloud_scheduled_occurrences enable row level security;
alter table public.cloud_scheduled_outbox enable row level security;
revoke all on public.cloud_scheduled_occurrences,public.cloud_scheduled_outbox from public,anon,authenticated,service_role;
grant select,insert,update on public.cloud_scheduled_occurrences,public.cloud_scheduled_outbox to service_role;

create function public.cloud_scheduled_config(p_task public.scheduled_tasks) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select to_jsonb(p_task)-array['next_run_at','last_run_at','updated_at','status'];
$$;

-- One transaction consumes a due occurrence; polling accepted work doesn't
-- spend attempts. Starting with an unknown provider ID is NEVER resubmitted.
create function public.claim_scheduled_occurrence(p_lease_seconds integer default 120)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.scheduled_tasks%rowtype; o public.cloud_scheduled_occurrences%rowtype;
begin
  if p_lease_seconds not between 5 and 300 or p_lease_seconds is null then raise exception 'Invalid lease'; end if;
  select x.* into t from public.scheduled_tasks x
    where x.status='active' and x.next_run_at<=clock_timestamp()
      and exists(select 1 from auth.users where id=x.user_id)
      and not exists(select 1 from public.cloud_scheduled_occurrences c where c.task_id=x.id and c.scheduled_for=x.next_run_at
        and (c.state in ('completed','cancelled','recovery_required') or c.lease_expires_at>clock_timestamp()))
    order by x.next_run_at,x.id limit 1 for update skip locked;
  if not found then return null; end if;
  insert into public.cloud_scheduled_occurrences(task_id,user_id,scheduled_for,snapshot,chat_id)
    values(t.id,t.user_id,t.next_run_at,public.cloud_scheduled_config(t),coalesce(t.result_chat_id,gen_random_uuid()))
    on conflict(task_id,scheduled_for) do nothing;
  select * into o from public.cloud_scheduled_occurrences where task_id=t.id and scheduled_for=t.next_run_at for update;
  if o.user_id<>t.user_id or o.snapshot is distinct from public.cloud_scheduled_config(t) then
    update public.cloud_scheduled_occurrences set state='cancelled',lease_token=null,lease_expires_at=null where id=o.id; return null;
  end if;
  if t.result_chat_id is not null and not exists(select 1 from public.chat_sessions where id=t.result_chat_id and user_id=t.user_id) then
    update public.cloud_scheduled_occurrences set state='cancelled',lease_token=null,lease_expires_at=null where id=o.id; return null;
  end if;
  if o.state='starting' then
    update public.cloud_scheduled_occurrences set state='recovery_required',lease_token=null,lease_expires_at=null where id=o.id; return null;
  end if;
  update public.cloud_scheduled_occurrences set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    where id=o.id returning * into o;
  return to_jsonb(o);
end; $$;

create function public.step_scheduled_occurrence(p_id uuid,p_user_id uuid,p_lease_token uuid,p_action text,p_value text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.cloud_scheduled_occurrences%rowtype; t public.scheduled_tasks%rowtype; s public.chat_sessions%rowtype; msg jsonb; next_at timestamptz;
begin
  select * into o from public.cloud_scheduled_occurrences where id=p_id and user_id=p_user_id;
  if not found then return false; end if;
  -- Session -> task -> occurrence, compatible with transcript and schedule RPCs.
  if p_action='complete' then
    select * into s from public.chat_sessions where id=o.chat_id for update;
    if found and s.user_id<>p_user_id then return false; end if;
    if s.id is null and o.snapshot->>'result_chat_id' is not null then return false; end if;
  end if;
  select * into t from public.scheduled_tasks where id=o.task_id and user_id=p_user_id for update;
  if not found or t.status<>'active' or t.next_run_at is distinct from o.scheduled_for
    or public.cloud_scheduled_config(t) is distinct from o.snapshot then return false; end if;
  select * into o from public.cloud_scheduled_occurrences where id=p_id and user_id=p_user_id for update;
  if p_lease_token is null or o.lease_token is distinct from p_lease_token or o.lease_expires_at is null
    or o.lease_expires_at<=clock_timestamp() then return false; end if;
  if p_action='start' and o.state='ready' then
    update public.cloud_scheduled_occurrences set state='starting' where id=p_id;
  elsif p_action='accept' and o.state='starting' and length(p_value) between 1 and 300 then
    update public.cloud_scheduled_occurrences set state='accepted',provider_id=p_value where id=p_id;
  elsif p_action='result' and o.state='accepted' and length(p_value) between 1 and 32000 then
    update public.cloud_scheduled_occurrences set state='result',output=p_value where id=p_id;
  elsif p_action='yield' and o.state in ('ready','accepted','result') then
    update public.cloud_scheduled_occurrences set lease_token=null,lease_expires_at=null where id=p_id;
  elsif p_action='recover' and o.state in ('starting','accepted') then
    update public.cloud_scheduled_occurrences set state='recovery_required',lease_token=null,lease_expires_at=null where id=p_id;
  elsif p_action='complete' and o.state='result' then
    -- Compute before writes; invalid legacy cron rolls the whole operation back.
    if t.schedule_type='cron' then next_at:=public.cloud_scheduled_next_cron(t.cron_expr,greatest(clock_timestamp(),o.scheduled_for)); end if;
    if o.lease_expires_at<=clock_timestamp() then return false; end if;
    msg:=jsonb_build_object('id','scheduled-'||o.id::text,'role','assistant','type','text','content',o.output,
      'timestamp',o.scheduled_for,'scheduledTask',jsonb_build_object('id',t.id,'title',t.title));
    if s.id is null then
      insert into public.chat_sessions(id,user_id,title,messages,persistence_version)
        values(o.chat_id,p_user_id,'📅 '||t.title,jsonb_build_array(msg),1);
    elsif not exists(select 1 from jsonb_array_elements(coalesce(s.messages,'[]')) x where x->>'id'=msg->>'id') then
      update public.chat_sessions set messages=coalesce(messages,'[]')||jsonb_build_array(msg),persistence_version=1 where id=s.id and user_id=p_user_id;
    elsif not exists(select 1 from jsonb_array_elements(coalesce(s.messages,'[]')) x where x=msg) then raise exception 'Occurrence message conflict';
    end if;
    insert into public.cloud_scheduled_outbox(occurrence_id,user_id,channel)
      select o.id,p_user_id,c from unnest(array['push','email']) c
      where (c='push' and t.push_on_complete) or (c='email' and t.notify_email)
      on conflict(occurrence_id,channel) do nothing;
    update public.scheduled_tasks set last_run_at=clock_timestamp(),next_run_at=next_at,
      status=case when schedule_type='once' then 'completed' else 'active' end where id=t.id;
    update public.cloud_scheduled_occurrences set state='completed',lease_token=null,lease_expires_at=null where id=p_id;
  else return false;
  end if;
  return true;
end; $$;

-- Outbox is at-most-once automatic dispatch on ambiguous acceptance. No
-- provider idempotency guarantee is invented for browser push or legacy email.
create function public.claim_scheduled_delivery(p_lease_seconds integer default 120)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.cloud_scheduled_outbox%rowtype; o public.cloud_scheduled_occurrences%rowtype; t public.scheduled_tasks%rowtype;
begin
  if p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'Invalid lease'; end if;
  -- Task before outbox; lock skip prevents competing senders.
  select x.* into t from public.scheduled_tasks x where exists(select 1 from public.cloud_scheduled_outbox b
    join public.cloud_scheduled_occurrences c on c.id=b.occurrence_id
    where c.task_id=x.id and b.state in ('ready','sending') and (b.lease_expires_at is null or b.lease_expires_at<=clock_timestamp()))
    order by x.id limit 1 for update skip locked;
  if not found then return null; end if;
  select b.* into d from public.cloud_scheduled_outbox b join public.cloud_scheduled_occurrences c on c.id=b.occurrence_id
    where c.task_id=t.id and b.state in ('ready','sending') and (b.lease_expires_at is null or b.lease_expires_at<=clock_timestamp())
    order by b.id limit 1 for update of b skip locked;
  if not found then return null; end if;
  select * into o from public.cloud_scheduled_occurrences where id=d.occurrence_id;
  if d.user_id<>t.user_id or o.user_id<>t.user_id or o.state<>'completed' or t.status not in ('active','completed')
    or o.snapshot is distinct from public.cloud_scheduled_config(t)
    or not exists(select 1 from public.chat_sessions where id=o.chat_id and user_id=t.user_id) then
    update public.cloud_scheduled_outbox set state='cancelled',lease_token=null,lease_expires_at=null where id=d.id; return null;
  end if;
  if d.state='sending' then
    update public.cloud_scheduled_outbox set state='recovery_required',lease_token=null,lease_expires_at=null where id=d.id; return null;
  end if;
  update public.cloud_scheduled_outbox set state='sending',lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    where id=d.id returning * into d;
  return to_jsonb(d)||jsonb_build_object('title',o.snapshot->>'title','body',o.output,'chat_id',o.chat_id,
    'idempotency_key','scheduled:'||o.id::text||':'||d.channel);
end; $$;
create function public.finish_scheduled_delivery(p_id uuid,p_user_id uuid,p_lease_token uuid,p_receipt jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.cloud_scheduled_outbox%rowtype; o public.cloud_scheduled_occurrences%rowtype; t public.scheduled_tasks%rowtype;
begin
  select * into d from public.cloud_scheduled_outbox where id=p_id and user_id=p_user_id;
  if not found then return false; end if;
  select * into o from public.cloud_scheduled_occurrences where id=d.occurrence_id and user_id=p_user_id;
  select * into t from public.scheduled_tasks where id=o.task_id and user_id=p_user_id for update;
  if not found or t.status not in ('active','completed') or public.cloud_scheduled_config(t) is distinct from o.snapshot then return false; end if;
  select * into d from public.cloud_scheduled_outbox where id=p_id and user_id=p_user_id for update;
  if d.state<>'sending' or p_lease_token is null or d.lease_token is distinct from p_lease_token
    or d.lease_expires_at<=clock_timestamp() then return false; end if;
  if jsonb_typeof(p_receipt) is distinct from 'object' or length(p_receipt::text)>4000
    or p_receipt->>'accepted' is distinct from 'true' or nullif(p_receipt->>'id','') is null then return false; end if;
  update public.cloud_scheduled_outbox set state='sent',provider_receipt=p_receipt,lease_token=null,lease_expires_at=null where id=p_id;
  return true;
end; $$;
revoke all on function public.cloud_scheduled_config(public.scheduled_tasks),public.claim_scheduled_occurrence(integer),
  public.step_scheduled_occurrence(uuid,uuid,uuid,text,text),public.claim_scheduled_delivery(integer),
  public.finish_scheduled_delivery(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cloud_scheduled_config(public.scheduled_tasks),public.claim_scheduled_occurrence(integer),
  public.step_scheduled_occurrence(uuid,uuid,uuid,text,text),public.claim_scheduled_delivery(integer),
  public.finish_scheduled_delivery(uuid,uuid,uuid,jsonb) to service_role;
commit;
