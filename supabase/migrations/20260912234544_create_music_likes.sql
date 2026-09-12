create table if not exists public.music_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.music_likes enable row level security;

grant select, insert, delete on table public.music_likes to authenticated;

create policy "Users can read their own music likes"
  on public.music_likes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own music likes"
  on public.music_likes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own music likes"
  on public.music_likes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
