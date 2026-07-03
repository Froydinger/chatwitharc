create table public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  system_prompt text not null,
  starter_prompts jsonb not null default '[]'::jsonb,
  knowledge text,
  emoji text,
  default_model_family text not null default 'openai',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personas_user_id_idx on public.personas (user_id);

alter table public.personas enable row level security;

create policy "Users can view their own personas"
on public.personas for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own personas"
on public.personas for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own personas"
on public.personas for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own personas"
on public.personas for delete
to authenticated
using ((select auth.uid()) = user_id);

create trigger update_personas_updated_at
before update on public.personas
for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.personas to authenticated;
