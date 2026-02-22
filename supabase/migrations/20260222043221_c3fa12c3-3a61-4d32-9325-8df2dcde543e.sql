
-- Fix 1: Add auth.uid() validation to search_chat_sessions
CREATE OR REPLACE FUNCTION public.search_chat_sessions(search_query text, searching_user_id uuid, max_sessions integer DEFAULT 100)
 RETURNS TABLE(id uuid, title text, messages jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  search_terms text;
BEGIN
  -- Validate that searching_user_id matches authenticated user
  IF searching_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot search other users chat sessions';
  END IF;

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
$function$;

-- Fix 2: Add auth.uid() validation to list_chat_sessions_meta
CREATE OR REPLACE FUNCTION public.list_chat_sessions_meta(searching_user_id uuid, max_sessions integer DEFAULT 500)
 RETURNS TABLE(id uuid, title text, created_at timestamp with time zone, updated_at timestamp with time zone, canvas_content text, message_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate that searching_user_id matches authenticated user
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
    COALESCE(jsonb_array_length(cs.messages), 0)::integer AS message_count
  FROM public.chat_sessions cs
  WHERE cs.user_id = searching_user_id
  ORDER BY cs.updated_at DESC
  LIMIT max_sessions;
END;
$function$;

-- Fix 3: Add public read policy for banner settings, keep admin-only for the rest
-- First drop existing SELECT policy on admin_settings
DROP POLICY IF EXISTS "Admins can view admin settings" ON public.admin_settings;

-- Allow all authenticated users to read banner_* keys
CREATE POLICY "Anyone can read banner settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key LIKE 'banner_%');

-- Admin-only for non-banner settings
CREATE POLICY "Admins can view non-banner admin settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key NOT LIKE 'banner_%' AND is_admin_user());
