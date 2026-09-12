-- Cloud attachments are short-lived private inputs for detached Arc Cloud runs.
-- The client may create/read/delete only its own immutable object path. Workers
-- use the service role and re-check the claimed session plus object bytes/hash.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cloud-chat-inputs',
  'cloud-chat-inputs',
  false,
  41943040,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/markdown', 'text/html',
    'text/csv', 'application/json', 'application/xml', 'text/xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Cloud users upload own input objects" on storage.objects;
create policy "Cloud users upload own input objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cloud-chat-inputs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Cloud users read own input objects" on storage.objects;
create policy "Cloud users read own input objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'cloud-chat-inputs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Cloud users delete own input objects" on storage.objects;
create policy "Cloud users delete own input objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cloud-chat-inputs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
