create table if not exists public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_user_idx
  on public.user_blocks (blocked_user_id);

alter table public.user_blocks enable row level security;
revoke all on table public.user_blocks from public, anon;
grant select, insert, delete on table public.user_blocks to authenticated;

drop policy if exists "Users can read their own blocks" on public.user_blocks;
create policy "Users can read their own blocks"
  on public.user_blocks for select to authenticated
  using (blocker_user_id = auth.uid());

drop policy if exists "Users can block accounts" on public.user_blocks;
create policy "Users can block accounts"
  on public.user_blocks for insert to authenticated
  with check (blocker_user_id = auth.uid() and blocked_user_id <> auth.uid());

drop policy if exists "Users can unblock accounts" on public.user_blocks;
create policy "Users can unblock accounts"
  on public.user_blocks for delete to authenticated
  using (blocker_user_id = auth.uid());

-- A user's block hides that account's messages from the blocker in shared chats.
drop policy if exists "Members read messages" on public.shared_chat_messages;
create policy "Members read messages" on public.shared_chat_messages for select to authenticated
  using (
    (public.is_shared_chat_member(chat_id, auth.uid()) or public.is_shared_chat_owner(chat_id, auth.uid()))
    and (
      author_user_id is null
      or not exists (
        select 1
        from public.user_blocks
        where blocker_user_id = auth.uid()
          and blocked_user_id = shared_chat_messages.author_user_id
      )
    )
  );

create or replace function public.create_ugc_report(report_subject text, report_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ticket_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.support_tickets (user_id, subject, priority)
  values (
    auth.uid(),
    '[Content report] ' || left(coalesce(nullif(trim(report_subject), ''), 'Shared content'), 180),
    'high'
  )
  returning id into new_ticket_id;

  insert into public.ticket_messages (ticket_id, sender_id, content, is_admin_reply)
  values (
    new_ticket_id,
    auth.uid(),
    left(coalesce(report_details, ''), 6000),
    false
  );

  return new_ticket_id;
end;
$$;

revoke all on function public.create_ugc_report(text, text) from public, anon;
grant execute on function public.create_ugc_report(text, text) to authenticated;
