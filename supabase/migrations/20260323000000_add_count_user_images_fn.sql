-- Fast image count RPC: counts assistant image messages across all sessions for a user
CREATE OR REPLACE FUNCTION count_user_images()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    (SELECT COUNT(*)
     FROM jsonb_array_elements(cs.messages::jsonb) AS msg
     WHERE msg->>'type' = 'image'
       AND msg->>'role' = 'assistant')
  ), 0)::integer
  FROM chat_sessions cs
  WHERE cs.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION count_user_images() TO authenticated;
