alter table public.chat_sessions
  add column if not exists persona_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_sessions_persona_id_fkey'
      and conrelid = 'public.chat_sessions'::regclass
  ) then
    alter table public.chat_sessions
      add constraint chat_sessions_persona_id_fkey
      foreign key (persona_id)
      references public.personas(id)
      on delete set null;
  end if;
end
$$;

create index if not exists chat_sessions_persona_id_idx
  on public.chat_sessions(persona_id);

notify pgrst, 'reload schema';
