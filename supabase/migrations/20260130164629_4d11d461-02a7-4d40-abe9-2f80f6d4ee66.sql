-- Create a fast full-text search function for chat sessions
-- This searches at the database level instead of fetching all data to the client

CREATE OR REPLACE FUNCTION public.search_chat_sessions(
  search_query text,
  searching_user_id uuid,
  max_sessions integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  title text,
  messages jsonb,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_terms text;
BEGIN
  -- Convert query to tsquery format (handle multiple words)
  search_terms := plainto_tsquery('english', search_query)::text;
  
  RETURN QUERY
  SELECT 
    cs.id,
    cs.title,
    cs.messages,
    cs.updated_at
  FROM public.chat_sessions cs
  WHERE cs.user_id = searching_user_id
    AND (
      -- Search in title
      to_tsvector('english', COALESCE(cs.title, '')) @@ plainto_tsquery('english', search_query)
      OR
      -- Search in messages content (JSONB array)
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(cs.messages) AS msg
        WHERE to_tsvector('english', COALESCE(msg->>'content', '')) @@ plainto_tsquery('english', search_query)
      )
    )
  ORDER BY cs.updated_at DESC
  LIMIT max_sessions;
END;
$$;

-- Also create an index to speed up the JSONB search
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated 
ON public.chat_sessions(user_id, updated_at DESC);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_chat_sessions TO authenticated;