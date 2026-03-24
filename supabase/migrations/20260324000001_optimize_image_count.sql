-- Optimized image count RPC: uses jsonb_path_query_array for faster counting
CREATE OR REPLACE FUNCTION count_user_images()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    jsonb_array_length(
      jsonb_path_query_array(cs.messages, '$[*] ? (@.type == "image" && @.role == "assistant")')
    )
  ), 0)::integer
  FROM chat_sessions cs
  WHERE cs.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION count_user_images() TO authenticated;
