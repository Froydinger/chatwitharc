create table if not exists public.desktop_notification_devices (
  device_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists desktop_notification_devices_user_id_idx
  on public.desktop_notification_devices(user_id);

alter table public.desktop_notification_devices enable row level security;

create policy "Users can read their desktop notification devices"
  on public.desktop_notification_devices for select
  using (auth.uid() = user_id);

create policy "Users can register their desktop notification devices"
  on public.desktop_notification_devices for insert
  with check (auth.uid() = user_id);

create policy "Users can update their desktop notification devices"
  on public.desktop_notification_devices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their desktop notification devices"
  on public.desktop_notification_devices for delete
  using (auth.uid() = user_id);

create table if not exists public.desktop_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default '/dashboard',
  tag text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists desktop_notifications_pending_idx
  on public.desktop_notifications(user_id, created_at)
  where delivered_at is null;

alter table public.desktop_notifications enable row level security;

create policy "Users can read their desktop notifications"
  on public.desktop_notifications for select
  using (auth.uid() = user_id);

create policy "Users can claim their desktop notifications"
  on public.desktop_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their desktop notifications"
  on public.desktop_notifications for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.desktop_notification_devices to authenticated;
grant select, update, delete on public.desktop_notifications to authenticated;
grant all on public.desktop_notification_devices, public.desktop_notifications to service_role;
