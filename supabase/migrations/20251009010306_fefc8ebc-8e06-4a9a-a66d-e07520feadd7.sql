-- Add preferred_model column to profiles table
ALTER TABLE public.profiles
ADD COLUMN preferred_model text DEFAULT 'google/gemini-2.5-flash';