alter table public.profiles
  alter column accent_color set default 'noir',
  alter column theme_preference set default 'system';

-- This development project has only a handful of users. Normalize everyone to
-- the new shipped experience once; colors and explicit light/dark remain
-- available as opt-in settings afterward.
update public.profiles
set accent_color = 'noir',
    theme_preference = 'system';
