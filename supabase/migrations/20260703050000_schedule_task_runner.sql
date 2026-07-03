create extension if not exists pg_cron;
create extension if not exists pg_net;

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
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/run-scheduled-tasks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'scheduled_tasks_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);
