-- Keep privileged helper functions callable only by the roles that actually use them.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.

alter function public.check_duplicate_image_job() set search_path = public;

create or replace function public.count_user_images(target_user_id uuid)
returns integer
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if target_user_id is null or
     (target_user_id <> auth.uid() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role') then
    raise exception 'Unauthorized';
  end if;

  return (
    select coalesce(sum(cnt), 0)::integer
    from (
      select (
        select count(*)
        from jsonb_array_elements(cs.messages) as msg
        where msg->>'type' = 'image'
          and msg->>'role' = 'assistant'
          and msg->>'imageUrl' is not null
      ) as cnt
      from public.chat_sessions cs
      where cs.user_id = target_user_id
    ) sub
  );
end;
$$;

create or replace function public.count_voice_conversations_30d(target_user_id uuid)
returns integer
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if target_user_id is null or
     (target_user_id <> auth.uid() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role') then
    raise exception 'Unauthorized';
  end if;

  return (
    select count(*)::integer
    from public.voice_conversations
    where user_id = target_user_id
      and created_at > (now() - interval '30 days')
  );
end;
$$;

create or replace function public.user_has_boost(check_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if check_user_id is null or
     (check_user_id <> auth.uid() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role') then
    return false;
  end if;

  if exists (select 1 from public.admin_users where user_id = check_user_id) then
    return true;
  end if;

  return exists (
    select 1
    from public.subscriptions
    where user_id = check_user_id
      and price_id = 'arcai_boost_monthly'
      and (
        status in ('active', 'trialing', 'past_due')
        or (status = 'canceled' and current_period_end is not null and current_period_end > now())
      )
  );
end;
$$;

create or replace function public.user_has_pro_access(check_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  user_email text;
begin
  if check_user_id is null or
     (check_user_id <> auth.uid() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role') then
    return false;
  end if;

  if exists (select 1 from public.admin_users where user_id = check_user_id) then
    return true;
  end if;

  if exists (
    select 1 from public.subscriptions
    where user_id = check_user_id
      and status in ('active', 'trialing', 'past_due')
  ) then
    return true;
  end if;

  select email into user_email from auth.users where id = check_user_id;
  return user_email is not null and exists (
    select 1 from public.comped_users where lower(email) = lower(user_email)
  );
end;
$$;

-- No unauthenticated caller needs a privileged public-schema function.
revoke execute on all functions in schema public from public, anon;

-- Trigger and server-only helpers must not be exposed as REST RPC endpoints.
revoke execute on function public.check_duplicate_image_job() from authenticated;
revoke execute on function public.delete_email(text, bigint) from authenticated;
revoke execute on function public.enqueue_email(text, jsonb) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.make_primary_admin() from authenticated;
revoke execute on function public.move_to_dlq(text, text, bigint, jsonb) from authenticated;
revoke execute on function public.prevent_last_admin_deletion() from authenticated;
revoke execute on function public.prevent_primary_admin_deletion() from authenticated;
revoke execute on function public.read_email_batch(text, integer, integer) from authenticated;
revoke execute on function public.update_ticket_on_message() from authenticated;
revoke execute on function public.update_updated_at_column() from authenticated;

-- Explicitly restore only the client RPCs and RLS helpers used by signed-in users.
grant execute on function public.count_user_images() to authenticated, service_role;
grant execute on function public.count_user_images(uuid) to authenticated, service_role;
grant execute on function public.count_voice_conversations_30d(uuid) to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.is_shared_chat_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_shared_chat_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_chat_sessions_meta(uuid, integer) to authenticated, service_role;
grant execute on function public.record_voice_conversation(uuid) to authenticated, service_role;
grant execute on function public.search_chat_sessions(text, uuid, integer) to authenticated, service_role;
grant execute on function public.user_has_boost(uuid) to authenticated, service_role;
grant execute on function public.user_has_pro_access(uuid) to authenticated, service_role;
grant execute on function public.users_share_shared_chat(uuid, uuid) to authenticated, service_role;

-- Public buckets serve object URLs without a broad SELECT policy. Removing these
-- policies prevents clients from enumerating every stored object.
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Email assets are publicly accessible" on storage.objects;
drop policy if exists "Generated files are publicly accessible" on storage.objects;
drop policy if exists "Anyone can view ticket attachments" on storage.objects;
