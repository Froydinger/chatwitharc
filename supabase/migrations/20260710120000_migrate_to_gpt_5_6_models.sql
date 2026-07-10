-- Move all stored model references from the retired GPT-5.4/5.5 family
-- to the GPT-5.6 family: nano→luna, mini→terra, 5.4/5.5→sol.

alter table public.profiles
  alter column preferred_model set default 'gpt-5.6-luna';

update public.profiles
set preferred_model = case preferred_model
  when 'gpt-5.4-nano' then 'gpt-5.6-luna'
  when 'gpt-5.4-mini' then 'gpt-5.6-terra'
  when 'gpt-5.4' then 'gpt-5.6-sol'
  when 'gpt-5.5' then 'gpt-5.6-sol'
  else preferred_model
end
where preferred_model in ('gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5');

update public.profiles
set preferred_model = 'gpt-5.6-luna'
where preferred_model is null;

update public.profiles
set research_model = case research_model
  when 'gpt-5.4-nano' then 'gpt-5.6-luna'
  when 'gpt-5.4-mini' then 'gpt-5.6-terra'
  when 'gpt-5.4' then 'gpt-5.6-sol'
  when 'gpt-5.5' then 'gpt-5.6-sol'
  else research_model
end
where research_model in ('gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5');

update public.scheduled_tasks
set model = case model
  when 'gpt-5.4-nano' then 'gpt-5.6-luna'
  when 'gpt-5.4-mini' then 'gpt-5.6-terra'
  when 'gpt-5.4' then 'gpt-5.6-sol'
  when 'gpt-5.5' then 'gpt-5.6-sol'
  else model
end
where model in ('gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5');

update public.admin_settings
set value = replace(
  value,
  'Chat: OpenAI GPT-5.4 Nano by default, with GPT-5.4 Mini for advanced tasks.',
  'Chat: OpenAI GPT-5.6 Luna by default, with GPT-5.6 Terra for advanced tasks and GPT-5.6 Sol for frontier reasoning.'
)
where key = 'system_prompt';
