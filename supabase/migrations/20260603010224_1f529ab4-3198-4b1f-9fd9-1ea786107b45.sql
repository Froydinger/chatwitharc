create or replace function public.users_share_shared_chat(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shared_chat_members m1
    join public.shared_chat_members m2 on m1.chat_id = m2.chat_id
    where m1.user_id = _a and m2.user_id = _b
  );
$$;

drop policy if exists "Shared chat co-members view profile" on public.profiles;
create policy "Shared chat co-members view profile" on public.profiles
for select to authenticated
using (public.users_share_shared_chat(auth.uid(), user_id));