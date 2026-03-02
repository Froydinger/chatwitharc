
CREATE OR REPLACE FUNCTION public.count_user_images(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cnt), 0)::integer
  FROM (
    SELECT (
      SELECT COUNT(*)
      FROM jsonb_array_elements(cs.messages) AS msg
      WHERE msg->>'type' = 'image'
        AND msg->>'role' = 'assistant'
        AND msg->>'imageUrl' IS NOT NULL
    ) AS cnt
    FROM public.chat_sessions cs
    WHERE cs.user_id = target_user_id
  ) sub;
$$;
