-- Optional publication rollback for 20261009224516 only, after reverting the
-- frontend to the previous polling build. Preflight established this table was
-- not previously published. Do not use if another consumer now depends on it.
-- No notification rows, policies, or grants are changed.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'desktop_notifications'
  ) then
    alter publication supabase_realtime drop table public.desktop_notifications;
  end if;
end;
$$;
