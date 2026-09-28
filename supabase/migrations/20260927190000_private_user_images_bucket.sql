-- New chat uploads and generated images are private by default. The legacy
-- public avatars bucket remains available for profile avatars and explicit
-- public shares; no existing bucket or object is changed by this migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-user-images',
  'private-user-images',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own private images" on storage.objects;
create policy "Users upload own private images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'private-user-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and case
    when (storage.foldername(name))[2] = 'team' then
      case
        when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          public.is_shared_chat_owner(((storage.foldername(name))[3])::uuid, (select auth.uid()))
          or public.is_shared_chat_member(((storage.foldername(name))[3])::uuid, (select auth.uid()))
        else false
      end
    else true
  end
);

drop policy if exists "Users read own private images" on storage.objects;
create policy "Users read own private images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'private-user-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Shared chat members read shared private images" on storage.objects;
create policy "Shared chat members read shared private images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'private-user-images'
  and (storage.foldername(name))[2] = 'team'
  and case
    when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      public.is_shared_chat_owner(((storage.foldername(name))[3])::uuid, (select auth.uid()))
      or public.is_shared_chat_member(((storage.foldername(name))[3])::uuid, (select auth.uid()))
    else false
  end
);

drop policy if exists "Users delete own private images" on storage.objects;
create policy "Users delete own private images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'private-user-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
