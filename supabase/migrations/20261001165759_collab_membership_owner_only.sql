-- Collab rooms are invite-only. Knowing a room UUID never permits self-enrollment.
drop policy if exists "Owners add members" on public.shared_chat_members;
create policy "Owners add members" on public.shared_chat_members
for insert to authenticated
with check (public.is_shared_chat_owner(chat_id, auth.uid()));
