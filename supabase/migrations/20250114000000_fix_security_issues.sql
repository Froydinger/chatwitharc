-- This historical security patch predates the migrations that create these
-- tables. Guard it so the complete migration chain is replayable from zero.
-- Later migrations recreate and further harden both policy sets.
do $$
begin
  if to_regclass('public.admin_users') is not null then
    execute 'drop policy if exists "Admin users can view admin records" on public.admin_users';
    execute 'drop policy if exists "Admin users can view their own admin record" on public.admin_users';
    execute $policy$
      create policy "Admin users can view their own admin record"
        on public.admin_users for select
        using (
          auth.uid() = user_id
          and exists (
            select 1 from public.admin_users where user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.generated_files') is not null then
    execute $policy$
      create policy "Users can update their own files"
        on public.generated_files for update to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $policy$;
  end if;
end
$$;
