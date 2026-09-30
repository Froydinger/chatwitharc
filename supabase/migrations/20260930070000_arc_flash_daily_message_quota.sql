-- Count accepted user submissions, not assistant replies or individual tool turns.
-- Additive migration: existing history, image quotas and voice remain untouched.
CREATE TABLE IF NOT EXISTS public.arc_flash_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 20),
  PRIMARY KEY (user_id, usage_date)
);
CREATE TABLE IF NOT EXISTS public.arc_flash_message_reservations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  usage_date date NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.arc_flash_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_flash_message_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arc_flash_daily_usage, public.arc_flash_message_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_arc_flash_message(target_user_id uuid, submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  current_used integer;
  reserved uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR target_user_id IS NULL OR submission_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF public.user_has_boost(target_user_id) THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'usage_percent', 0);
  END IF;
  INSERT INTO public.arc_flash_daily_usage(user_id, usage_date)
    VALUES (target_user_id, today) ON CONFLICT DO NOTHING;
  -- One short account/day lock serializes concurrent admissions; provider work
  -- happens after this transaction commits, never while holding this lock.
  SELECT used INTO current_used FROM public.arc_flash_daily_usage
    WHERE user_id = target_user_id AND usage_date = today FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.arc_flash_message_reservations
      WHERE user_id = target_user_id AND request_id = submission_id) THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'replayed', true,
      'usage_percent', current_used * 5);
  END IF;
  IF current_used >= 20 THEN
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'usage_percent', 100);
  END IF;
  INSERT INTO public.arc_flash_message_reservations(user_id, request_id, usage_date)
    VALUES (target_user_id, submission_id, today)
    ON CONFLICT DO NOTHING RETURNING request_id INTO reserved;
  -- A duplicate crossing UTC midnight can race under another day's lock.
  -- Only the transaction which inserted the unique reservation increments usage.
  IF reserved IS NOT NULL THEN
    UPDATE public.arc_flash_daily_usage SET used = used + 1
      WHERE user_id = target_user_id AND usage_date = today RETURNING used INTO current_used;
  END IF;
  RETURN jsonb_build_object('allowed', true, 'unlimited', false,
    'replayed', reserved IS NULL, 'usage_percent', current_used * 5);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_arc_flash_message(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_arc_flash_message(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_arc_flash_usage_today()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  current_used integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF public.user_has_boost(caller) THEN
    RETURN jsonb_build_object('unlimited', true, 'usage_percent', 0);
  END IF;
  SELECT used INTO current_used FROM public.arc_flash_daily_usage
    WHERE user_id = caller AND usage_date = (now() AT TIME ZONE 'UTC')::date;
  RETURN jsonb_build_object('unlimited', false, 'usage_percent', COALESCE(current_used, 0) * 5);
END;
$$;
REVOKE ALL ON FUNCTION public.get_arc_flash_usage_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_arc_flash_usage_today() TO authenticated;
