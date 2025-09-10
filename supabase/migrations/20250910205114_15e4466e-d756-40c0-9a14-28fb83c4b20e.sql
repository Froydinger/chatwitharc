-- Add memory field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN memory_info text;