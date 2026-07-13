-- search_sessions is created by 20260111000000. This historical follow-up also
-- introduced saved_links; retain only that non-duplicate portion.
create table if not exists public.saved_links (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  list_id text not null default 'default',
  list_name text not null default 'Saved Links',
  title text not null,
  url text not null,
  snippet text,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.saved_links enable row level security;

create policy "Users can view their own saved links"
  on public.saved_links for select using (auth.uid() = user_id);
create policy "Users can create their own saved links"
  on public.saved_links for insert with check (auth.uid() = user_id);
create policy "Users can update their own saved links"
  on public.saved_links for update using (auth.uid() = user_id);
create policy "Users can delete their own saved links"
  on public.saved_links for delete using (auth.uid() = user_id);

create index idx_saved_links_user_id on public.saved_links(user_id);
create index idx_saved_links_list_id on public.saved_links(user_id, list_id);
