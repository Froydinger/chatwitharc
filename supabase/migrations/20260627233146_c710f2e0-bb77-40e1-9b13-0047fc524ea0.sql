
TRUNCATE TABLE cron.job_run_details;

DELETE FROM net._http_response WHERE created < now() - interval '1 day';

DELETE FROM public.image_generation_jobs
WHERE status IN ('completed','failed')
  AND created_at < now() - interval '24 hours';

SELECT cron.schedule(
  'prune-cron-history-daily',
  '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';$$
);

SELECT cron.schedule(
  'prune-http-response-daily',
  '22 3 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '1 day';$$
);

SELECT cron.schedule(
  'prune-image-jobs-daily',
  '27 3 * * *',
  $$DELETE FROM public.image_generation_jobs WHERE status IN ('completed','failed') AND created_at < now() - interval '24 hours';$$
);
