-- Automated checks only create leads for a human reviewer. No account or
-- content enforcement is connected to these tables or functions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.content_review_runs (
  id uuid primary key default gen_random_uuid(),
  range_start timestamptz not null,
  range_end timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  r2_inventoried boolean not null default false,
  status text not null default 'running' check (status in ('running','complete','partial')),
  scanned_count integer not null default 0,
  flagged_count integer not null default 0,
  failed_count integer not null default 0
);
create table if not exists public.content_review_queue (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.content_review_runs(id) on delete cascade,
  source_type text not null check (source_type in ('chat','shared_chat','image')),
  source_id text not null,
  owner_id uuid not null,
  bucket text,
  object_path text,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique (run_id, source_type, source_id)
);
create index if not exists content_review_queue_ready_idx
  on public.content_review_queue (run_id, lease_until, id);
create table if not exists public.content_review_flags (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('chat','shared_chat','image')),
  source_id text not null,
  owner_id uuid not null,
  bucket text,
  object_path text,
  signals text[] not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  unique (source_type, source_id)
);
create index if not exists content_review_flags_open_idx
  on public.content_review_flags (created_at desc) where reviewed_at is null;

alter table public.content_review_runs enable row level security;
alter table public.content_review_queue enable row level security;
alter table public.content_review_flags enable row level security;
revoke all on public.content_review_runs, public.content_review_queue, public.content_review_flags from public, anon, authenticated;
grant all on public.content_review_runs, public.content_review_queue, public.content_review_flags to service_role;
grant usage, select on sequence public.content_review_queue_id_seq to service_role;

-- Only service_role can start a scan. The primary admin's account is excluded
-- before any transcript or object is queued, including their turns in shared chats.
create or replace function public.content_review_ensure_week()
returns table (run_id uuid, needs_r2 boolean)
language plpgsql security definer set search_path = public, storage
as $fn$
declare
  previous_end timestamptz;
  active_run uuid;
  excluded uuid[];
  window_end timestamptz := now();
begin
  if not pg_try_advisory_xact_lock(20360928) then return; end if;
  select id into active_run from public.content_review_runs
    where status = 'running' order by started_at desc limit 1;
  if active_run is not null then
    return query select r.id, not r.r2_inventoried from public.content_review_runs r where r.id = active_run;
    return;
  end if;
  select max(range_end) into previous_end from public.content_review_runs;
  if previous_end is not null and previous_end > window_end - interval '7 days' then return; end if;
  select coalesce(array_agg(user_id), array[]::uuid[]) into excluded
    from public.admin_users where is_primary_admin = true;
  insert into public.content_review_runs (range_start, range_end)
    values (coalesce(previous_end, '1970-01-01'::timestamptz), window_end)
    returning id into active_run;

  insert into public.content_review_queue (run_id, source_type, source_id, owner_id)
  select active_run, 'chat', s.id::text || '/' || coalesce(nullif(m.item->>'id',''), m.ordinality::text), s.user_id
  from public.chat_sessions s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.messages) = 'array' then s.messages else '[]'::jsonb end)
    with ordinality as m(item, ordinality)
  where s.updated_at >= coalesce(previous_end, '1970-01-01'::timestamptz)
    and s.updated_at < window_end and not (s.user_id = any(excluded))
    and m.item->>'role' in ('user','assistant')
    and length(trim(coalesce(m.item->>'content',''))) > 0
  on conflict do nothing;

  insert into public.content_review_queue (run_id, source_type, source_id, owner_id)
  select active_run, 'shared_chat', m.id::text, coalesce(m.author_user_id, s.owner_id)
  from public.shared_chat_messages m join public.shared_chats s on s.id = m.chat_id
  where m.created_at >= coalesce(previous_end, '1970-01-01'::timestamptz)
    and m.created_at < window_end
    and not (coalesce(m.author_user_id, s.owner_id) = any(excluded))
    and m.role in ('user','assistant') and length(trim(coalesce(m.content,''))) > 0
  on conflict do nothing;

  insert into public.content_review_queue (run_id, source_type, source_id, owner_id, bucket, object_path)
  select active_run, 'image', o.bucket_id || '/' || o.name,
    (case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(o.name, '/', 1)::uuid end), o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('avatars','private-user-images','cloud-chat-inputs','generated-files','ticket-attachments')
    and o.created_at >= coalesce(previous_end, '1970-01-01'::timestamptz)
    and o.created_at < window_end
    and split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not ((case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(o.name, '/', 1)::uuid end) = any(excluded))
    and (lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
      or o.name ~* '[.](avif|bmp|gif|heic|heif|jpe?g|png|webp)$')
  on conflict do nothing;
  return query select active_run, true;
end;
$fn$;
revoke all on function public.content_review_ensure_week() from public, anon, authenticated;
grant execute on function public.content_review_ensure_week() to service_role;

create or replace function public.content_review_claim(p_run_id uuid, p_limit integer default 32)
returns setof public.content_review_queue
language sql security definer set search_path = public
as $fn$
  update public.content_review_queue q
  set lease_until = now() + interval '4 minutes', attempts = attempts + 1
  where q.id in (
    select id from public.content_review_queue
    where run_id = p_run_id and (lease_until is null or lease_until < now()) and attempts < 4
    order by id limit least(greatest(p_limit,1),32) for update skip locked
  ) returning q.*;
$fn$;
revoke all on function public.content_review_claim(uuid,integer) from public, anon, authenticated;
grant execute on function public.content_review_claim(uuid,integer) to service_role;

create or replace function public.content_review_finish(p_id bigint, p_flagged boolean, p_failed boolean)
returns void language plpgsql security definer set search_path = public
as $fn$
declare target_run uuid;
begin
  delete from public.content_review_queue where id = p_id returning run_id into target_run;
  if target_run is null then return; end if;
  update public.content_review_runs set
    scanned_count = scanned_count + case when p_failed then 0 else 1 end,
    flagged_count = flagged_count + case when p_flagged then 1 else 0 end,
    failed_count = failed_count + case when p_failed then 1 else 0 end
  where id = target_run;
end;
$fn$;
revoke all on function public.content_review_finish(bigint,boolean,boolean) from public, anon, authenticated;
grant execute on function public.content_review_finish(bigint,boolean,boolean) to service_role;

-- A worker may crash after its final lease. Retire those items so the run can
-- finish and its failure count remains visible to the human reviewer.
create or replace function public.content_review_reap_exhausted(p_run_id uuid)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare retired integer;
begin
  with gone as (
    delete from public.content_review_queue
    where run_id = p_run_id and attempts >= 4 and lease_until < now()
    returning id
  ) select count(*) into retired from gone;
  update public.content_review_runs set failed_count = failed_count + retired where id = p_run_id;
  return retired;
end;
$fn$;
revoke all on function public.content_review_reap_exhausted(uuid) from public, anon, authenticated;
grant execute on function public.content_review_reap_exhausted(uuid) to service_role;

-- Cron only calls a secret-authenticated worker; it never receives user content.
create or replace function public.invoke_content_review_worker()
returns void language plpgsql security definer set search_path = public, vault, net
as $fn$
declare cron_secret text;
begin
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'content_review_cron_secret';
  if cron_secret is null or length(cron_secret) < 32 then
    raise exception 'content_review_cron_secret is not configured';
  end if;
  perform net.http_post(
    url := 'https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/content-review-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',cron_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
end;
$fn$;
revoke all on function public.invoke_content_review_worker() from public, anon, authenticated;

do $do$ begin
  if exists (select 1 from cron.job where jobname = 'content-review-worker-every-two-minutes') then
    perform cron.unschedule('content-review-worker-every-two-minutes');
  end if;
end $do$;
select cron.schedule('content-review-worker-every-two-minutes','*/2 * * * *',
  $cron$ select public.invoke_content_review_worker(); $cron$);
