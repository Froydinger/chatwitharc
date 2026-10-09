-- Rollback idle-worker gate functions to verified production base 14c650d75a8f3e1f722885cb4292e183295ed728.
-- Apply only if rolling back 20261009224456_gate_idle_worker_wakeups.
-- Leaves cron schedules, outboxes, claims, and publication unchanged.

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

create or replace function public.invoke_browserbase_cleanup() returns void language plpgsql security definer set search_path='' as $$
declare secret text; begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='content_review_cron_secret';
 if secret is null then raise exception 'Worker secret unavailable'; end if;
 perform net.http_post(url:='https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/browserbase-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=50000);
end $$;
revoke all on function public.invoke_browserbase_cleanup() from public, anon, authenticated;
