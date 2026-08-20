-- The original schedule_task_runner migration built the cron request from two
-- vault secrets (project_url, scheduled_tasks_cron_secret) that no migration
-- ever created. When they are absent, net.http_post() receives url => NULL and
-- the job fails every single minute, so no scheduled task ever runs and the
-- failure is only visible in cron.job_run_details. Two fixes here:
--   1. Inline the project URL. It is not a secret (it is already in config.toml)
--      and it removes one silent-NULL failure mode.
--   2. Raise a clear exception when the cron secret is missing, instead of
--      posting a request that the edge function will reject as unauthorized.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_run_scheduled_tasks()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $fn$
declare
  cron_secret text;
begin
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

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'run-scheduled-tasks-every-minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'run-scheduled-tasks-every-minute',
  '* * * * *',
  $cron$ select public.invoke_run_scheduled_tasks(); $cron$
);
