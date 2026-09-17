-- Add the synchronous boundary needed to distinguish router work from the
-- browser's first-paint/compositor stall during dashboard navigation.
alter table public.dashboard_nav_timings
  drop constraint if exists dashboard_nav_timings_phase_check;

alter table public.dashboard_nav_timings
  add constraint dashboard_nav_timings_phase_check check (phase in (
    'button_start',
    'canvas_save_scheduled',
    'navigate_called',
    'navigate_returned',
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
  ));
