-- Add is_git column to chat_sessions table to irreversibly lock conversations to Git mode
ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS is_git boolean NOT NULL DEFAULT false;

-- Index for fast lookup of git sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_is_git ON public.chat_sessions(user_id, is_git) WHERE is_git = true;

-- Update list_chat_sessions_meta RPC to return is_git
DROP FUNCTION IF EXISTS public.list_chat_sessions_meta(uuid, integer);

CREATE OR REPLACE FUNCTION public.list_chat_sessions_meta(searching_user_id uuid, max_sessions integer DEFAULT 500)
RETURNS TABLE(id uuid, title text, created_at timestamp with time zone, updated_at timestamp with time zone, canvas_content text, folder_id uuid, message_count integer, is_git boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF searching_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot list other users chat sessions';
  END IF;

  RETURN QUERY
  SELECT
    cs.id,
    cs.title,
    cs.created_at,
    cs.updated_at,
    cs.canvas_content,
    cs.folder_id,
    COALESCE(jsonb_array_length(cs.messages), 0)::integer AS message_count,
    COALESCE(cs.is_git, false) AS is_git
  FROM public.chat_sessions cs
  WHERE cs.user_id = searching_user_id
  ORDER BY cs.updated_at DESC
  LIMIT max_sessions;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_chat_sessions_meta(uuid, integer) TO authenticated, service_role;
