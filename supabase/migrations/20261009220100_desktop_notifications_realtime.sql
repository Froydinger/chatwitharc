-- Desktop delivery uses INSERT signals plus owner-scoped backlog recovery.
-- Preserve the existing RLS policies and grants; this changes no row access.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'desktop_notifications'
  ) then
    alter publication supabase_realtime add table public.desktop_notifications;
  end if;
end;
$$;
