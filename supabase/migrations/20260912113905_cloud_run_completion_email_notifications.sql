-- Cloud-run completion mail is an opt-out preference. The outbox is service-only
-- so a browser can change the preference but can never enqueue or mark mail sent.
alter table public.profiles
  add column if not exists cloud_run_email_notifications boolean not null default true;

create table public.cloud_run_email_outbox (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.cloud_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'ready' check (state in ('ready','sending','sent','recovery_required','cancelled')),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_receipt jsonb,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);

create index cloud_run_email_outbox_ready_idx
  on public.cloud_run_email_outbox(created_at)
  where state in ('ready','sending');

alter table public.cloud_run_email_outbox enable row level security;
revoke all on table public.cloud_run_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.cloud_run_email_outbox to service_role;

-- Completion and enqueue happen in one transaction. If the worker crashes after
-- complete_cloud_run, the next worker tick still has a durable mail item.
create or replace function public.enqueue_cloud_run_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
    and coalesce((select p.cloud_run_email_notifications
                  from public.profiles p where p.user_id = new.user_id), true) then
    insert into public.cloud_run_email_outbox(run_id, user_id)
      values (new.id, new.user_id)
      on conflict (run_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_cloud_run_email() from public, anon, authenticated;

create trigger cloud_runs_enqueue_completion_email
  after update of status on public.cloud_runs
  for each row execute function public.enqueue_cloud_run_email();

create function public.claim_cloud_run_email(p_lease_seconds integer default 120)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.cloud_run_email_outbox%rowtype;
  r public.cloud_runs%rowtype;
begin
  if p_lease_seconds is null or p_lease_seconds not between 5 and 300 then
    raise exception 'Invalid lease' using errcode = '22023';
  end if;

  select x.* into d
    from public.cloud_run_email_outbox x
    where x.state in ('ready','sending')
      and (x.lease_expires_at is null or x.lease_expires_at <= clock_timestamp())
    order by x.created_at, x.id
    limit 1
    for update skip locked;
  if not found then return null; end if;

  select * into r from public.cloud_runs where id = d.run_id;
  if not found or r.status <> 'completed' or r.user_id <> d.user_id then
    update public.cloud_run_email_outbox
      set state='cancelled', lease_token=null, lease_expires_at=null,
          last_error='Completed run no longer exists'
      where id=d.id;
    return null;
  end if;

  if not coalesce((select p.cloud_run_email_notifications
                   from public.profiles p where p.user_id = d.user_id), true) then
    update public.cloud_run_email_outbox
      set state='cancelled', lease_token=null, lease_expires_at=null,
          last_error='User disabled cloud-run completion email'
      where id=d.id;
    return null;
  end if;

  -- A lease that expired while sending has an ambiguous provider outcome.
  -- Preserve at-most-once delivery rather than sending the same completion twice.
  if d.state = 'sending' then
    update public.cloud_run_email_outbox
      set state='recovery_required', lease_token=null, lease_expires_at=null,
          last_error='Email acceptance was ambiguous'
      where id=d.id;
    return null;
  end if;

  update public.cloud_run_email_outbox
    set state='sending', lease_token=gen_random_uuid(),
        lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
        last_error=null
    where id=d.id
    returning * into d;

  return jsonb_build_object(
    'id', d.id,
    'run_id', d.run_id,
    'user_id', d.user_id,
    'lease_token', d.lease_token,
    'session_id', r.session_id,
    'mode', r.mode,
    'result', r.result,
    'idempotency_key', 'cloud-run:' || d.run_id::text
  );
end;
$$;

create function public.finish_cloud_run_email(
  p_id uuid, p_user_id uuid, p_lease_token uuid, p_receipt jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare d public.cloud_run_email_outbox%rowtype;
begin
  if jsonb_typeof(p_receipt) is distinct from 'object'
    or p_receipt->>'accepted' is distinct from 'true'
    or nullif(p_receipt->>'id','') is null
    or length(p_receipt::text) > 4000 then
    raise exception 'Invalid email receipt' using errcode = '22023';
  end if;
  select * into d from public.cloud_run_email_outbox
    where id=p_id and user_id=p_user_id for update;
  if not found or d.state <> 'sending' or p_lease_token is null
    or d.lease_token is distinct from p_lease_token
    or d.lease_expires_at <= clock_timestamp() then return false; end if;
  update public.cloud_run_email_outbox
    set state='sent', provider_receipt=p_receipt,
        lease_token=null, lease_expires_at=null, sent_at=clock_timestamp()
    where id=p_id;
  return true;
end;
$$;

revoke all on function public.claim_cloud_run_email(integer) from public, anon, authenticated;
revoke all on function public.finish_cloud_run_email(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_cloud_run_email(integer) to service_role;
grant execute on function public.finish_cloud_run_email(uuid, uuid, uuid, jsonb) to service_role;

comment on column public.profiles.cloud_run_email_notifications is
  'Send a completion email when one of this user''s durable cloud runs finishes. Defaults on.';
comment on table public.cloud_run_email_outbox is
  'At-most-once durable completion-email handoff for cloud runs; service role only.';
