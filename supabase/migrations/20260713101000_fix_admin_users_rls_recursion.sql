-- Remove the self-referential admin_users policies introduced by the
-- historical defense-in-depth migration. Querying admin_users from an RLS
-- policy on admin_users causes PostgreSQL to reject the request as recursive.
-- is_admin_user() is SECURITY DEFINER and performs the membership lookup
-- outside the caller's RLS context.

drop policy if exists "Admins can view admin users" on public.admin_users;
drop policy if exists "Admins can create admin users" on public.admin_users;
drop policy if exists "Admins can update admin users" on public.admin_users;
drop policy if exists "Admins can delete admin users" on public.admin_users;
drop policy if exists "Admin users can view admin records" on public.admin_users;
drop policy if exists "Admin users can create admin records" on public.admin_users;
drop policy if exists "Admin users can insert admin records" on public.admin_users;
drop policy if exists "Admin users can update admin records" on public.admin_users;
drop policy if exists "Admin users can delete admin records" on public.admin_users;

create policy "Admin users can view admin records"
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin_user());

create policy "Admin users can insert admin records"
  on public.admin_users
  for insert
  to authenticated
  with check (public.is_admin_user());

create policy "Admin users can update admin records"
  on public.admin_users
  for update
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "Admin users can delete admin records"
  on public.admin_users
  for delete
  to authenticated
  using (public.is_admin_user());

