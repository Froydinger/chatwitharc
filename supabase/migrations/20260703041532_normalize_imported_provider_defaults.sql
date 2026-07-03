update public.profiles
set accent_color = 'noir',
    theme_preference = 'system',
    preferred_model = 'gpt-5.4-nano',
    research_model = 'gpt-5.4-mini';

update public.scheduled_tasks
set model = 'gpt-5.4-nano'
where model is not null;

update public.personas
set default_model_family = 'openai'
where default_model_family is distinct from 'openai';

update public.admin_settings
set value = 'Arc service updates will appear here.'
where key = 'banner_message';

update public.admin_settings
set value = replace(
  replace(
    replace(
      value,
      'Chat: Gemini or GPT if switched in account settings.',
      'Chat: OpenAI GPT-5.4 Nano by default, with GPT-5.4 Mini for advanced tasks.'
    ),
    'Image: Nano Banana 2 (Gemini 3.1 Flash Image) (use /image)',
    'Image: OpenAI GPT-Image-2 (use /image)'
  ),
  'Deep Search™: Tavily + Perplexity (use /deep or /research to open)',
  'Deep Search™: Tavily with OpenAI synthesis (use /deep or /research to open)'
)
where key = 'system_prompt';
