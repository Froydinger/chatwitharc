-- Activity and expiry claiming lock the same row: idle cleanup cannot race a new action.
create or replace function public.touch_browserbase_session(p_session_handle uuid,p_user_id uuid)
returns boolean language sql set search_path='' as $$
 with touched as (
 update public.browserbase_sessions set updated_at=clock_timestamp()
 where session_handle=p_session_handle and user_id=p_user_id
 and status in ('agent_running','handed_back','user_control')
 and expires_at>clock_timestamp()
 and (status='user_control' or updated_at>clock_timestamp()-interval '5 minutes')
 returning 1) select exists(select 1 from touched);
$$;
revoke all on function public.touch_browserbase_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.touch_browserbase_session(uuid,uuid) to service_role;

create or replace function public.claim_idle_browserbase_sessions()
returns setof public.browserbase_sessions language sql set search_path='' as $$
 update public.browserbase_sessions set status='release_requested'
 where session_handle in (
 select session_handle from public.browserbase_sessions
 where provider_session_id is not null and settled_at is null
 and (status='release_requested' or expires_at<=clock_timestamp()
 or (status in ('agent_running','handed_back') and updated_at<=clock_timestamp()-interval '5 minutes'))
 order by updated_at for update skip locked limit 10)
 returning *;
$$;
revoke all on function public.claim_idle_browserbase_sessions() from public,anon,authenticated;
grant execute on function public.claim_idle_browserbase_sessions() to service_role;

create or replace function public.invoke_browserbase_cleanup() returns void language plpgsql security definer set search_path='' as $$
declare secret text; begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='content_review_cron_secret';
 if secret is null then raise exception 'Worker secret unavailable'; end if;
 perform net.http_post(url:='https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/browserbase-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=50000);
end $$;
revoke all on function public.invoke_browserbase_cleanup() from public,anon,authenticated;
do $$ begin if exists(select 1 from cron.job where jobname='browserbase-cleanup') then perform cron.unschedule('browserbase-cleanup'); end if; end $$;
select cron.schedule('browserbase-cleanup','* * * * *','select public.invoke_browserbase_cleanup()');
