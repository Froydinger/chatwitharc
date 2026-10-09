-- Keep the minute-level database recovery clock, but do not start an Edge
-- Function when it cannot claim any work. These checks are advisory only:
-- the existing worker claims still recheck eligibility and fence side effects.
-- In particular, do not enable or switch to the unreleased scheduled worker.

create or replace function public.invoke_cloud_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  worker_secret text;
begin
  if not exists (select 1 from public.list_claimable_cloud_runs(1))
    and not exists (
      select 1 from public.cloud_run_email_outbox
      where state in ('ready', 'sending')
        and (lease_expires_at is null or lease_expires_at <= statement_timestamp())
    )
    and not exists (
      select 1 from public.cloud_run_push_outbox
      where state in ('ready', 'sending')
        and (lease_expires_at is null or lease_expires_at <= statement_timestamp())
    )
    -- Runtime feature flags live outside SQL. Conservatively retain wakeups
    -- for the optional durable scheduler if it is already enabled. Its
    -- occurrence claim is driven by active due tasks (including accepted work
    -- awaiting recovery). This does not enable it or change the legacy cron.
    and not exists (
      select 1 from public.scheduled_tasks
      where status = 'active' and next_run_at <= statement_timestamp()
    )
    and not exists (
      select 1 from public.cloud_scheduled_outbox
      where state in ('ready', 'sending')
        and (lease_expires_at is null or lease_expires_at <= statement_timestamp())
    ) then
    return;
  end if;

  -- Expired sending outboxes must wake the worker too. Their existing claims
  -- move ambiguous deliveries to recovery_required, never blindly resend.
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'scheduled_tasks_cron_secret';

  if worker_secret is null or length(worker_secret) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/cloud-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.invoke_cloud_worker() from public, anon, authenticated;

create or replace function public.invoke_run_scheduled_tasks()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cron_secret text;
begin
  if not exists (
    select 1 from public.scheduled_tasks
    where status = 'active' and next_run_at <= statement_timestamp()
  ) then
    return;
  end if;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'scheduled_tasks_cron_secret';

  if cron_secret is null or length(cron_secret) = 0 then
    raise exception
      'vault secret "scheduled_tasks_cron_secret" is missing; run-scheduled-tasks cannot authenticate. Create it with vault.create_secret(<value>, ''scheduled_tasks_cron_secret'') using the same value as the SCHEDULED_TASKS_CRON_SECRET edge function secret.';
  end if;

  perform net.http_post(
    url := 'https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/run-scheduled-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.invoke_run_scheduled_tasks() from public, anon, authenticated;

create or replace function public.invoke_browserbase_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  secret text;
begin
  -- Mirror claim_idle_browserbase_sessions without claiming here. A user
  -- taking control after this check is still protected by the atomic claim.
  if not exists (
    select 1 from public.browserbase_sessions
    where provider_session_id is not null and settled_at is null
      and (
        status = 'release_requested'
        or expires_at <= statement_timestamp()
        or (status in ('agent_running', 'handed_back')
          and updated_at <= statement_timestamp() - interval '5 minutes')
      )
  ) then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'content_review_cron_secret';
  if secret is null then raise exception 'Worker secret unavailable'; end if;

  perform net.http_post(
    url := 'https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/browserbase-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$fn$;

revoke all on function public.invoke_browserbase_cleanup() from public, anon, authenticated;

-- Existing cron jobs and schedules are deliberately unchanged. Rolling back
-- only requires restoring these three invoke functions; no data is changed.
