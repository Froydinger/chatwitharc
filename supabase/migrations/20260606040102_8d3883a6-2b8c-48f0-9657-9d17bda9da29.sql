ALTER TABLE public.profiles ALTER COLUMN preferred_model SET DEFAULT 'google/gemini-3-flash-preview';
UPDATE public.profiles SET preferred_model = 'google/gemini-3-flash-preview' WHERE preferred_model LIKE 'google/gemini-2%';
UPDATE public.scheduled_tasks SET model = 'google/gemini-3-flash-preview' WHERE model LIKE 'google/gemini-2%';