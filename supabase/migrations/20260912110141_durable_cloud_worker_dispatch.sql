-- Wake durable chat runs independently of the browser. The edge-function
-- submission also kicks the worker immediately; this minute-level sweep is
-- the recovery path for closed tabs, expired leases, and missed wakeups.
--
-- The worker accepts the existing server-only scheduler secret during the
-- first rollout. A separate CLOUD_WORKER_SECRET can be added later without
-- changing this database job.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_cloud_worker()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $fn$
declare
  worker_secret text;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'scheduled_tasks_cron_secret';

  -- Missing configuration must not break unrelated database work. The
  -- operator can add the secret and enable the edge function independently.
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

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cloud-worker-every-minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'cloud-worker-every-minute',
  '* * * * *',
  $$ select public.invoke_cloud_worker(); $$
);
