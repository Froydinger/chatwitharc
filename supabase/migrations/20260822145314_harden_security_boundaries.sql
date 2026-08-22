begin;

-- Signed-out support is email-only. The browser ticket portal is reserved for
-- real accounts, while service-role Edge Functions continue to bypass RLS for
-- inbound email and administrative automation.
drop policy if exists "Service role can insert tickets" on public.support_tickets;
drop policy if exists "Service role can select tickets" on public.support_tickets;
drop policy if exists "Service role can update tickets" on public.support_tickets;
drop policy if exists "Service role can insert ticket messages" on public.ticket_messages;
drop policy if exists "Service role can select ticket messages" on public.ticket_messages;

revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.ticket_messages from anon, authenticated;
grant select, insert, update on table public.support_tickets to authenticated;
grant select, insert on table public.ticket_messages to authenticated;

drop policy if exists "Users can view their own tickets" on public.support_tickets;
create policy "Users can view their own tickets"
on public.support_tickets for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can create their own tickets" on public.support_tickets;
drop policy if exists "Users can create their own tickets or admins can create for any" on public.support_tickets;
drop policy if exists "Users can create their own tickets or admins can create for anyone" on public.support_tickets;
create policy "Users can create their own tickets or admins can create for anyone"
on public.support_tickets for insert
to authenticated
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users and admins can update tickets" on public.support_tickets;
create policy "Users and admins can update tickets"
on public.support_tickets for update
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can view messages on their tickets" on public.ticket_messages;
create policy "Users can view messages on their tickets"
on public.ticket_messages for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_messages.ticket_id
      and (ticket.user_id = (select auth.uid()) or public.is_admin_user())
  )
);

drop policy if exists "Users can create messages on their tickets" on public.ticket_messages;
create policy "Users can create messages on their tickets"
on public.ticket_messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_messages.ticket_id
      and (ticket.user_id = (select auth.uid()) or public.is_admin_user())
  )
);

-- Owners create their own membership row after creating a chat. Existing-user
-- invitations are inserted by the owner-checked Edge Function using the
-- service role, so ordinary users never need a self-enrollment escape hatch.
drop policy if exists "Owners add members" on public.shared_chat_members;
create policy "Owners add members"
on public.shared_chat_members for insert
to authenticated
with check (public.is_shared_chat_owner(chat_id, (select auth.uid())));

-- Keep existing public ticket URLs working, but constrain every new upload to
-- the caller's own folder and apply conservative media limits at the bucket.
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'ticket-attachments';

drop policy if exists "Authenticated users can upload ticket attachments" on storage.objects;
create policy "Users upload ticket attachments to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Trigger functions do not need to be exposed through the Data API. Revoking
-- direct execution does not affect the auth.users trigger itself.
revoke execute on function public.apply_account_entitlement_grants() from public, anon, authenticated;

-- Only the caller (or the service role) may check an entitlement. Include the
-- annual product offered by the live UI as well as the monthly product.
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
      and price_id in ('arcai_boost_monthly', 'arcai_boost_annual')
      and (
        status in ('active', 'trialing', 'past_due')
        or (status = 'canceled' and current_period_end is not null and current_period_end > now())
      )
  );
end;
$$;

revoke all on function public.user_has_boost(uuid) from public, anon;
grant execute on function public.user_has_boost(uuid) to authenticated, service_role;

commit;
