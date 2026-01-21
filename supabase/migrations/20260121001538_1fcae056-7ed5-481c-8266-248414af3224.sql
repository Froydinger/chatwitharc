-- Add summary_conversation column to search_sessions table to persist follow-up conversations
ALTER TABLE public.search_sessions 
ADD COLUMN IF NOT EXISTS summary_conversation jsonb DEFAULT '[]'::jsonb;