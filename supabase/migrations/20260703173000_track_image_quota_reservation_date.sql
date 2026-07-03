-- Track the date of the reservation itself. A job created immediately before
-- UTC midnight can reserve immediately after it, so created_at is not a safe
-- source for deciding which daily usage row receives a refund.

alter table public.image_generation_jobs
  add column if not exists quota_usage_date date;

update public.image_generation_jobs
set quota_usage_date = (created_at at time zone 'utc')::date
where quota_reserved_count > 0
  and quota_usage_date is null;

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
      set quota_usage_date = utc_date,
          quota_finalized_at = now()
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
    set quota_reserved_count = requested_count,
        quota_usage_date = utc_date
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
  reserved_date date;
begin
  select user_id, quota_reserved_count, quota_finalized_at,
         coalesce(quota_usage_date, (created_at at time zone 'utc')::date)
    into job_user, reserved, finalized, reserved_date
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
    where user_id = job_user and usage_date = reserved_date;
  end if;

  update public.image_generation_jobs
    set quota_finalized_at = now()
  where id = target_job_id;
end;
$$;

revoke all on function public.finalize_image_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.finalize_image_quota(uuid, integer) to service_role;
