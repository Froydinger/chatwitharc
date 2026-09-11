-- Raise the internal free voice allowance to ten sessions per UTC day.
-- The product intentionally describes this as generous/"tons" of free usage;
-- the numeric cap is enforcement detail and is not exposed in UI copy.

CREATE OR REPLACE FUNCTION public.reserve_voice_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  today_utc date := (timezone('utc', now()))::date;
  free_limit integer := 10;
  used integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

REVOKE ALL ON FUNCTION public.reserve_voice_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_voice_session() TO authenticated, service_role;
