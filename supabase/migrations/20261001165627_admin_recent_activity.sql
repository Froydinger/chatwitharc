-- Aggregate existing saved activity; no presence tracking or new client writes.
-- Only the already-authorized admin-users Edge Function may call this RPC.
create or replace function public.admin_recent_activity_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with activity as (
    select user_id, updated_at as occurred_at from public.chat_sessions
    where updated_at >= now() - interval '24 hours'
    union all
    select author_user_id, created_at from public.shared_chat_messages
    where role = 'user' and created_at >= now() - interval '24 hours'
    union all
    select user_id, created_at from public.image_generation_jobs
    where created_at >= now() - interval '24 hours'
    union all
    select user_id, created_at from public.voice_conversations
    where created_at >= now() - interval '24 hours'
  ), latest as (
    select user_id, max(occurred_at) as occurred_at from activity
    where user_id is not null group by user_id
  )
  select jsonb_build_object(
    'lastHour', count(*) filter (where occurred_at >= now() - interval '1 hour'),
    'lastThreeHours', count(*) filter (where occurred_at >= now() - interval '3 hours'),
    'lastDay', count(*),
    'measuredAt', now()
  ) from latest;
$$;

revoke all on function public.admin_recent_activity_counts() from public, anon, authenticated;
grant execute on function public.admin_recent_activity_counts() to service_role;
