-- Application conflicts must not use serialization_failure (40001).
-- PostgREST 14 retries that SQLSTATE indefinitely, even for a deterministic
-- precondition failure. PT409 returns one HTTP 409 without retrying the SQL.
-- Preserve the deployed bodies, ownership, grants, and all write guards.
-- Restricted to the four RPCs that deliberately raised this application error.
do $migration$
declare
  rpc record;
begin
  for rpc in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('apply_chat_session_operation', 'submit_cloud_run',
        'cloud_app_step', 'save_cloud_app_project')
      and p.prosrc like '%40001%'
  loop
    execute replace(rpc.definition, quote_literal('40001'), quote_literal('PT409'));
  end loop;
end;
$migration$;
notify pgrst, 'reload schema';
