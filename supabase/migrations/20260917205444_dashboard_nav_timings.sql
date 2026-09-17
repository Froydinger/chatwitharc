-- Temporary, user-scoped diagnostics for the iOS dashboard navigation stall.
-- Keep this timing-only: never store chat text, URLs, credentials, or payloads.
create table public.dashboard_nav_timings (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null check (phase in (
    'button_start',
    'canvas_save_scheduled',
    'navigate_called',
    'dashboard_commit',
    'dashboard_frame_1',
    'dashboard_frame_2',
    'chat_sync_start',
    'chat_sync_finish',
    'chat_sync_error',
    'counts_start',
    'apps_query_finish',
    'images_query_finish',
    'reminders_query_finish',
    'counts_finish',
    'counts_error'
  )),
  elapsed_ms integer not null check (elapsed_ms between 0 and 600000),
  created_at timestamptz not null default now()
);

alter table public.dashboard_nav_timings enable row level security;
revoke all on public.dashboard_nav_timings from anon;
grant insert, select on public.dashboard_nav_timings to authenticated;

create policy "Users insert their own dashboard timings"
  on public.dashboard_nav_timings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read their own dashboard timings"
  on public.dashboard_nav_timings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index dashboard_nav_timings_trace_idx
  on public.dashboard_nav_timings (trace_id, elapsed_ms);

create index dashboard_nav_timings_user_created_idx
  on public.dashboard_nav_timings (user_id, created_at desc);
