CREATE TABLE public.arc_maya_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.arc_maya_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arc_maya_daily_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_arc_maya_turn(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_used integer;
BEGIN
  IF auth.role() <> 'service_role' OR target_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF public.user_has_boost(target_user_id) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'remaining', 20);
  END IF;

  INSERT INTO public.arc_maya_daily_usage (user_id, usage_date, used)
  VALUES (target_user_id, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET used = public.arc_maya_daily_usage.used + 1
    WHERE public.arc_maya_daily_usage.used < 20
  RETURNING used INTO next_used;

  RETURN jsonb_build_object(
    'allowed', next_used IS NOT NULL,
    'used', COALESCE(next_used, 20),
    'remaining', GREATEST(0, 20 - COALESCE(next_used, 20))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_arc_maya_turn(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_arc_maya_turn(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_arc_maya_usage_today()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT used INTO result FROM public.arc_maya_daily_usage
    WHERE user_id = auth.uid() AND usage_date = (now() AT TIME ZONE 'UTC')::date;
  RETURN COALESCE(result, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_arc_maya_usage_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_arc_maya_usage_today() TO authenticated;
