-- Add research_model and preferred_voice columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS research_model text DEFAULT 'openai/gpt-5.2',
ADD COLUMN IF NOT EXISTS preferred_voice text DEFAULT 'echo';