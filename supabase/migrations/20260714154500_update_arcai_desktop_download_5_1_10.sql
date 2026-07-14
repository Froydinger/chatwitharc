insert into public.admin_settings (key, value, description)
values
  ('download_version', '5.1.10', 'Current Mac app version number'),
  (
    'download_filename',
    'https://github.com/Froydinger/chatwitharc/releases/download/v5.1.10/ArcAI-5.1.10-arm64.dmg',
    'Current Mac app download URL'
  )
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();
