-- Noir is Arc's single, shared black-and-white palette. Normalize every
-- existing profile and reject attempts from older clients to restore colors.
update public.profiles
set accent_color = 'noir'
where accent_color is distinct from 'noir';

alter table public.profiles
  alter column accent_color set default 'noir',
  alter column accent_color set not null;

alter table public.profiles
  drop constraint if exists profiles_accent_color_noir_check,
  add constraint profiles_accent_color_noir_check
    check (accent_color = 'noir');

comment on column public.profiles.accent_color is
  'Fixed to Noir; Arc uses a single black-and-white palette.';
