-- A rejected completion is a deterministic lease conflict, not a transient
-- serialization failure. PT409 returns HTTP 409 without PostgREST's 40001
-- transaction retry path. Keep the exception so preceding IDE writes roll back.
-- Patch only this exact signature and error; preserve its deployed guards,
-- SECURITY INVOKER, owner, search_path, defaults, and existing execution grants.
do $migration$
declare
  definition text;
  old_raise constant text := 'raise exception ''Completion lease expired'' using errcode=''40001'';';
  new_raise constant text := 'raise exception ''Completion lease expired'' using errcode=''PT409'';';
begin
  select pg_get_functiondef('public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure)
    into definition;

  if strpos(definition, old_raise) > 0 then
    if (length(definition) - length(replace(definition, old_raise, ''))) / length(old_raise) <> 1
      or strpos(definition, new_raise) > 0 then
      raise exception 'Unexpected cloud_app_step completion-error definition; review before applying';
    end if;
    execute replace(definition, old_raise, new_raise);
  elsif (length(definition) - length(replace(definition, new_raise, ''))) / length(new_raise) <> 1 then
    raise exception 'Expected cloud_app_step completion lease error was not found; review before applying';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
