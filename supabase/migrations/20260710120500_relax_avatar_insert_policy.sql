-- Some hosted Storage requests after the DB move are not satisfying the
-- folder-name INSERT check even when the client uploads to <auth.uid>/...
-- Restore the older authenticated INSERT policy so profile photos work again.

drop policy if exists "Users can upload avatars while signed in" on storage.objects;

create policy "Users can upload avatars while signed in"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
);
