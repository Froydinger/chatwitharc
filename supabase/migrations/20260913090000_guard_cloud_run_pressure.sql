-- Keep a client bug or repeated Work click from creating an unbounded queue.
-- Legacy Ask runs remain recoverable; the cap applies to explicit Work only.
-- The per-user advisory lock makes the count safe across concurrent sessions.
create index if not exists cloud_runs_user_active_idx
  on public.cloud_runs(user_id, status)
  where mode = 'auto' and status in ('queued', 'running', 'awaiting_input');

create or replace function public.guard_cloud_run_pressure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if NEW.mode <> 'auto' then
    return NEW;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text, 0)
  );

  select count(*)::integer into v_active
   from public.cloud_runs
   where user_id = NEW.user_id
     and mode = 'auto'
     and status in ('queued', 'running', 'awaiting_input');

  if v_active >= 4 then
    raise exception 'Cloud request limit reached'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

revoke all on function public.guard_cloud_run_pressure() from public, anon, authenticated, service_role;

drop trigger if exists guard_cloud_run_pressure_before_insert on public.cloud_runs;
create trigger guard_cloud_run_pressure_before_insert
  before insert on public.cloud_runs
  for each row execute function public.guard_cloud_run_pressure();
