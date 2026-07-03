alter table public.profiles
  alter column preferred_model set default 'gpt-5.4-nano';

update public.profiles
set preferred_model = 'gpt-5.4-nano'
where preferred_model is null
   or preferred_model like 'google/%'
   or preferred_model like 'openai/%';
