-- New shared credit ledger; legacy image counts/history remain intact.
CREATE TABLE IF NOT EXISTS public.arc_image_credit_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  used_credits integer NOT NULL DEFAULT 0 CHECK (used_credits BETWEEN 0 AND 8),
  PRIMARY KEY (user_id, usage_date)
);
CREATE TABLE IF NOT EXISTS public.arc_image_credit_reservations (
  job_id uuid PRIMARY KEY REFERENCES public.image_generation_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  credits_per_image integer NOT NULL CHECK (credits_per_image IN (1, 2)),
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 3),
  charged_credits integer NOT NULL CHECK (charged_credits BETWEEN 0 AND 6),
  finalized_at timestamptz
);
CREATE INDEX IF NOT EXISTS arc_image_credit_reservations_user_idx ON public.arc_image_credit_reservations(user_id);
ALTER TABLE public.arc_image_credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_image_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arc_image_credit_usage, public.arc_image_credit_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_arc_image_credits(target_user_id uuid, target_job_id uuid, requested_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  job_user uuid;
  job_model text;
  unit_cost integer;
  charge integer;
  current_used integer;
  unlimited boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR target_user_id IS NULL OR target_job_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF requested_count IS NULL OR requested_count NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid image count'; END IF;
  SELECT user_id, preferred_model INTO job_user, job_model FROM public.image_generation_jobs WHERE id = target_job_id FOR UPDATE;
  IF job_user IS NULL OR job_user <> target_user_id THEN RAISE EXCEPTION 'Invalid image job'; END IF;
  unit_cost := CASE job_model WHEN 'gpt-image-2.5-flare' THEN 1 WHEN 'gpt-image-2.5-sunburst' THEN 1 WHEN 'gemini-3.1-flash-image' THEN 2 ELSE NULL END;
  IF unit_cost IS NULL THEN RAISE EXCEPTION 'Unsupported image model'; END IF;
  IF EXISTS (SELECT 1 FROM public.arc_image_credit_reservations WHERE job_id = target_job_id) THEN
    RAISE EXCEPTION 'Image credits already reserved for this job';
  END IF;
  unlimited := COALESCE(public.user_has_boost(target_user_id), false);
  charge := CASE WHEN unlimited THEN 0 ELSE unit_cost * requested_count END;
  INSERT INTO public.arc_image_credit_usage(user_id, usage_date) VALUES(target_user_id, today) ON CONFLICT DO NOTHING;
  SELECT used_credits INTO current_used FROM public.arc_image_credit_usage WHERE user_id = target_user_id AND usage_date = today FOR UPDATE;
  IF current_used + charge > 8 THEN
    RETURN jsonb_build_object('allowed', false, 'used', current_used, 'remaining', 8-current_used, 'limit', 8,
      'isBoost', false, 'usage_percent', round(current_used * 100.0 / 8),
      'error', 'Image usage limit reached. Upgrade to Boost for unlimited usage.',
      'resetAt', (today + 1)::timestamp AT TIME ZONE 'UTC');
  END IF;
  INSERT INTO public.arc_image_credit_reservations(job_id,user_id,usage_date,credits_per_image,requested_count,charged_credits)
    VALUES(target_job_id,target_user_id,today,unit_cost,requested_count,charge);
  UPDATE public.arc_image_credit_usage SET used_credits = used_credits + charge WHERE user_id = target_user_id AND usage_date = today;
  RETURN jsonb_build_object('allowed', true, 'used', current_used + charge, 'remaining', CASE WHEN unlimited THEN NULL ELSE 8-current_used-charge END,
    'limit', CASE WHEN unlimited THEN NULL ELSE 8 END, 'isBoost', unlimited,
    'usage_percent', CASE WHEN unlimited THEN 0 ELSE round((current_used+charge) * 100.0 / 8) END,
    'resetAt', (today + 1)::timestamp AT TIME ZONE 'UTC');
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_arc_image_credits(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_arc_image_credits(uuid,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_arc_image_credits(target_job_id uuid, successful_count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  reservation public.arc_image_credit_reservations%ROWTYPE;
  refund integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR target_job_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO reservation FROM public.arc_image_credit_reservations WHERE job_id = target_job_id FOR UPDATE;
  IF NOT FOUND OR reservation.finalized_at IS NOT NULL THEN RETURN; END IF;
  IF successful_count IS NULL OR successful_count NOT BETWEEN 0 AND reservation.requested_count THEN RAISE EXCEPTION 'Invalid successful image count'; END IF;
  refund := GREATEST(0,reservation.charged_credits-reservation.credits_per_image*successful_count);
  UPDATE public.arc_image_credit_usage SET used_credits = used_credits - refund
    WHERE user_id = reservation.user_id AND usage_date = reservation.usage_date;
  UPDATE public.arc_image_credit_reservations SET charged_credits = charged_credits-refund, finalized_at = now() WHERE job_id = target_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_arc_image_credits(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_arc_image_credits(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_arc_image_credits()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date;
  current_used integer;
  unlimited boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  unlimited := COALESCE(public.user_has_boost(caller),false);
  SELECT used_credits INTO current_used FROM public.arc_image_credit_usage WHERE user_id = caller AND usage_date = today;
  current_used := COALESCE(current_used,0);
  RETURN jsonb_build_object('used',CASE WHEN unlimited THEN 0 ELSE current_used END,
    'remaining', CASE WHEN unlimited THEN NULL ELSE 8-current_used END, 'limit', CASE WHEN unlimited THEN NULL ELSE 8 END,
    'isBoost', unlimited, 'usage_percent',CASE WHEN unlimited THEN 0 ELSE round(current_used*100.0/8) END,
    'resetAt',(today+1)::timestamp AT TIME ZONE 'UTC');
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_arc_image_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_arc_image_credits() TO authenticated;
