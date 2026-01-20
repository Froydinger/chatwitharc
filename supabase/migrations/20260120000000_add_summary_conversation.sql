-- Add summary_conversation column to search_sessions table
ALTER TABLE public.search_sessions
ADD COLUMN IF NOT EXISTS summary_conversation jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.search_sessions.summary_conversation IS 'Stores follow-up conversation messages for the search summary';
