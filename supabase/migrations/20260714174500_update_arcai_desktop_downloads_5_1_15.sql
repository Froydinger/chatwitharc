insert into public.admin_settings (key, value)
values
  ('download_version', '5.1.15'),
  ('download_filename', 'https://github.com/Froydinger/chatwitharc/releases/download/v5.1.15/ArcAI-5.1.15-arm64.dmg'),
  ('download_version_windows', '5.1.15'),
  ('download_filename_windows', 'https://github.com/Froydinger/chatwitharc/releases/download/v5.1.15/ArcAI-Setup-5.1.15.exe')
on conflict (key) do update
set value = excluded.value;
