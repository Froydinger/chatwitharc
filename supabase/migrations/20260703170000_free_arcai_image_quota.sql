-- ArcAI is free. The only account-level usage limit is 20 successful image
-- generation/edit outputs per UTC day. Admins bypass this quota.

create table if not exists public.daily_image_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.daily_image_usage enable row level security;
revoke all on public.daily_image_usage from anon, authenticated;
grant all on public.daily_image_usage to service_role;

alter table public.image_generation_jobs
  add column if not exists quota_reserved_count integer not null default 0,
  add column if not exists quota_finalized_at timestamptz;

create or replace function public.get_my_image_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  utc_date date := (now() at time zone 'utc')::date;
  used integer := 0;
  admin_user boolean := false;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select exists(select 1 from public.admin_users where user_id = uid)
    into admin_user;

  select coalesce(du.used_count, 0)
    into used
  from (select 1) seed
  left join public.daily_image_usage du
    on du.user_id = uid and du.usage_date = utc_date;

  return jsonb_build_object(
    'used', used,
    'remaining', case when admin_user then null else greatest(0, 20 - used) end,
    'limit', case when admin_user then null else 20 end,
    'isAdmin', admin_user,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
end;
$$;

revoke all on function public.get_my_image_quota() from public, anon;
grant execute on function public.get_my_image_quota() to authenticated;

create or replace function public.reserve_image_quota(
  target_user_id uuid,
  target_job_id uuid,
  requested_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  utc_date date := (now() at time zone 'utc')::date;
  used integer := 0;
  reserved integer := 0;
  job_user uuid;
  admin_user boolean := false;
begin
  if requested_count < 1 or requested_count > 3 then
    raise exception 'requested_count must be between 1 and 3';
  end if;

  select user_id, quota_reserved_count
    into job_user, reserved
  from public.image_generation_jobs
  where id = target_job_id
  for update;

  if job_user is null or job_user <> target_user_id then
    raise exception 'Invalid image job';
  end if;

  if reserved > 0 then
    raise exception 'Quota already reserved for this job';
  end if;

  select exists(select 1 from public.admin_users where user_id = target_user_id)
    into admin_user;

  if admin_user then
    update public.image_generation_jobs
      set quota_finalized_at = now()
    where id = target_job_id;
    return jsonb_build_object(
      'allowed', true, 'used', 0, 'remaining', null,
      'limit', null, 'isAdmin', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  end if;

  insert into public.daily_image_usage(user_id, usage_date, used_count)
  values (target_user_id, utc_date, 0)
  on conflict (user_id, usage_date) do nothing;

  select used_count into used
  from public.daily_image_usage
  where user_id = target_user_id and usage_date = utc_date
  for update;

  if used + requested_count > 20 then
    return jsonb_build_object(
      'allowed', false, 'used', used, 'remaining', greatest(0, 20 - used),
      'limit', 20, 'isAdmin', false,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  end if;

  update public.daily_image_usage
    set used_count = used_count + requested_count, updated_at = now()
  where user_id = target_user_id and usage_date = utc_date;

  update public.image_generation_jobs
    set quota_reserved_count = requested_count
  where id = target_job_id;

  return jsonb_build_object(
    'allowed', true, 'used', used + requested_count,
    'remaining', 20 - used - requested_count,
    'limit', 20, 'isAdmin', false,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
end;
$$;

revoke all on function public.reserve_image_quota(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_image_quota(uuid, uuid, integer) to service_role;

create or replace function public.finalize_image_quota(
  target_job_id uuid,
  successful_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job_user uuid;
  reserved integer;
  finalized timestamptz;
  refund_count integer;
  utc_date date;
begin
  select user_id, quota_reserved_count, quota_finalized_at,
         (created_at at time zone 'utc')::date
    into job_user, reserved, finalized, utc_date
  from public.image_generation_jobs
  where id = target_job_id
  for update;

  if job_user is null or finalized is not null then
    return;
  end if;

  refund_count := greatest(0, reserved - greatest(0, least(successful_count, reserved)));
  if refund_count > 0 then
    update public.daily_image_usage
      set used_count = greatest(0, used_count - refund_count), updated_at = now()
    where user_id = job_user and usage_date = utc_date;
  end if;

  update public.image_generation_jobs
    set quota_finalized_at = now()
  where id = target_job_id;
end;
$$;

revoke all on function public.finalize_image_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.finalize_image_quota(uuid, integer) to service_role;

create or replace function public.refund_stale_image_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale record;
  refunded integer := 0;
begin
  for stale in
    select id
    from public.image_generation_jobs
    where quota_reserved_count > 0
      and quota_finalized_at is null
      and created_at < now() - interval '20 minutes'
  loop
    perform public.finalize_image_quota(stale.id, 0);
    update public.image_generation_jobs
      set status = 'failed',
          error_type = coalesce(error_type, 'processing_timeout'),
          error_message = coalesce(error_message, 'Image job timed out; quota was refunded.')
    where id = stale.id and status in ('pending', 'processing');
    refunded := refunded + 1;
  end loop;
  return refunded;
end;
$$;

revoke all on function public.refund_stale_image_quota() from public, anon, authenticated;
grant execute on function public.refund_stale_image_quota() to service_role;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'refund-stale-image-quota';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end;
$$;

select cron.schedule(
  'refund-stale-image-quota',
  '*/10 * * * *',
  'select public.refund_stale_image_quota();'
);

drop function if exists public.user_has_boost(uuid);
drop function if exists public.count_voice_conversations_30d(uuid);
drop function if exists public.record_voice_conversation(uuid);
drop table if exists public.voice_conversations;
drop table if exists public.subscriptions;

