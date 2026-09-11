-- Free accounts may start three GPT-Live sessions per UTC day. Boost and
-- admins remain unlimited. The reservation is made inside the authenticated
-- Edge Function before OpenAI negotiation, so multiple devices cannot bypass
-- the cap by racing client-side counters.

CREATE TABLE IF NOT EXISTS public.voice_daily_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.voice_daily_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.voice_daily_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.voice_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION public.count_voice_sessions_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT used_count
    FROM public.voice_daily_usage
    WHERE user_id = auth.uid()
      AND usage_date = (timezone('utc', now()))::date
  ), 0)::integer;
$$;

CREATE OR REPLACE FUNCTION public.reserve_voice_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  today_utc date := (timezone('utc', now()))::date;
  free_limit integer := 3;
  used integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Boost/admin users do not need a daily reservation row.
  IF public.user_has_boost(caller_id) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'unlimited', true,
      'used', null,
      'remaining', null,
      'limit', null,
      'usage_date', today_utc
    );
  END IF;

  -- Create the row first, then increment only while below the limit. The
  -- primary-key row lock makes concurrent starts consume at most three slots.
  INSERT INTO public.voice_daily_usage (user_id, usage_date, used_count)
  VALUES (caller_id, today_utc, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  UPDATE public.voice_daily_usage
  SET used_count = used_count + 1,
      updated_at = now()
  WHERE user_id = caller_id
    AND usage_date = today_utc
    AND used_count < free_limit
  RETURNING used_count INTO used;

  IF NOT FOUND THEN
    SELECT used_count INTO used
    FROM public.voice_daily_usage
    WHERE user_id = caller_id
      AND usage_date = today_utc;

    RETURN jsonb_build_object(
      'allowed', false,
      'unlimited', false,
      'used', used,
      'remaining', 0,
      'limit', free_limit,
      'usage_date', today_utc
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'unlimited', false,
    'used', used,
    'remaining', greatest(0, free_limit - used),
    'limit', free_limit,
    'usage_date', today_utc
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_voice_sessions_today() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_voice_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_voice_sessions_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_voice_session() TO authenticated, service_role;
