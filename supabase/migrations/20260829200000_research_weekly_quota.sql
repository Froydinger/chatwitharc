-- Weekly quota for Deep Search and Ultra Deep Search.
--
-- Free accounts get a taste of both; Boost removes the cap entirely. Counting
-- lives server-side because the client copy only decides what UI to offer.
CREATE TABLE IF NOT EXISTS public.research_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('deep', 'ultra')),
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_usage_user_time_idx
  ON public.research_usage (user_id, used_at DESC);

ALTER TABLE public.research_usage ENABLE ROW LEVEL SECURITY;

-- Users may read their own usage so the UI can show what is left. Writes only
-- ever happen through the reserve function below, which runs as definer.
DROP POLICY IF EXISTS "read own research usage" ON public.research_usage;
CREATE POLICY "read own research usage"
  ON public.research_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reserve_research_quota(
  target_user_id uuid,
  research_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_deep_limit constant integer := 4;
  free_ultra_limit constant integer := 1;
  window_start timestamptz := now() - interval '7 days';
  admin_user boolean := false;
  has_boost boolean := false;
  used integer := 0;
  allowed_count integer;
BEGIN
  IF research_mode NOT IN ('deep', 'ultra') THEN
    RAISE EXCEPTION 'research_mode must be deep or ultra';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = target_user_id)
    INTO admin_user;
  SELECT public.user_has_boost(target_user_id) INTO has_boost;

  IF admin_user OR has_boost THEN
    INSERT INTO public.research_usage(user_id, mode) VALUES (target_user_id, research_mode);
    RETURN jsonb_build_object(
      'allowed', true, 'unlimited', true, 'used', 0,
      'remaining', null, 'limit', null, 'mode', research_mode
    );
  END IF;

  allowed_count := CASE WHEN research_mode = 'ultra' THEN free_ultra_limit ELSE free_deep_limit END;

  SELECT count(*) INTO used
  FROM public.research_usage
  WHERE user_id = target_user_id
    AND mode = research_mode
    AND used_at >= window_start;

  IF used >= allowed_count THEN
    RETURN jsonb_build_object(
      'allowed', false, 'unlimited', false, 'used', used,
      'remaining', 0, 'limit', allowed_count, 'mode', research_mode,
      'resetAt', (
        SELECT min(used_at) + interval '7 days'
        FROM public.research_usage
        WHERE user_id = target_user_id AND mode = research_mode AND used_at >= window_start
      )
    );
  END IF;

  INSERT INTO public.research_usage(user_id, mode) VALUES (target_user_id, research_mode);

  RETURN jsonb_build_object(
    'allowed', true, 'unlimited', false, 'used', used + 1,
    'remaining', allowed_count - used - 1, 'limit', allowed_count, 'mode', research_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_research_quota(uuid, text) TO service_role;
