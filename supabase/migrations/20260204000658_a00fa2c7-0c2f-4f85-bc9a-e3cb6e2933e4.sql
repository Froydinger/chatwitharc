-- Create RPC to list chat sessions with metadata only (no messages payload)
CREATE OR REPLACE FUNCTION public.list_chat_sessions_meta(
  searching_user_id uuid,
  max_sessions integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  canvas_content text,
  message_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.title,
    cs.created_at,
    cs.updated_at,
    cs.canvas_content,
    COALESCE(jsonb_array_length(cs.messages), 0)::integer AS message_count
  FROM public.chat_sessions cs
  WHERE cs.user_id = searching_user_id
  ORDER BY cs.updated_at DESC
  LIMIT max_sessions;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.list_chat_sessions_meta(uuid, integer) TO authenticated;