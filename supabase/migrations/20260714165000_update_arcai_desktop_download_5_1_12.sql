insert into public.admin_settings (key, value)
values
  ('download_version', '5.1.12'),
  ('download_filename', 'https://github.com/Froydinger/chatwitharc/releases/download/v5.1.12/ArcAI-5.1.12-arm64.dmg')
on conflict (key) do update
set value = excluded.value;
