create table public.anon_usage (
  ip_hash text not null,
  usage_date date not null,
  replies_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ip_hash, usage_date)
);

alter table public.anon_usage enable row level security;
grant all on public.anon_usage to service_role;

create table public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index chat_folders_user_id_idx on public.chat_folders (user_id);

alter table public.chat_folders enable row level security;

create policy "Users can view their own chat folders"
on public.chat_folders for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own chat folders"
on public.chat_folders for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own chat folders"
on public.chat_folders for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own chat folders"
on public.chat_folders for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.chat_folders to authenticated;
grant all on public.chat_folders to service_role;

alter table public.chat_sessions add column folder_id uuid;

alter table public.chat_sessions
  add constraint chat_sessions_folder_id_fkey
  foreign key (folder_id) references public.chat_folders(id) on delete set null;
