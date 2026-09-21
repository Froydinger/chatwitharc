-- Persist one row per user for each push dispatch so the dashboard bell can
-- show the same notification history as the browser/device delivery channel.
create table public.push_notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default '/dashboard',
  tag text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index push_notification_history_user_created_idx
  on public.push_notification_history(user_id, created_at desc);

create index push_notification_history_unread_idx
  on public.push_notification_history(user_id, created_at desc)
  where read_at is null;

alter table public.push_notification_history enable row level security;

create policy "Users can read their push notification history"
  on public.push_notification_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can mark their push notifications read"
  on public.push_notification_history for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can clear their push notification history"
  on public.push_notification_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, update, delete on public.push_notification_history to authenticated;
grant all on public.push_notification_history to service_role;

alter publication supabase_realtime add table public.push_notification_history;
