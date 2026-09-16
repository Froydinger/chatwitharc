-- 3 images total period on Free plan, unlimited image generation & editing on Boost.
-- Everyone uses GPT-Image-2.5 Flare for generation, Sunburst for edits.

DROP FUNCTION IF EXISTS public.get_my_image_quota();

CREATE OR REPLACE FUNCTION public.reserve_image_quota(
  target_user_id uuid,
  target_job_id uuid,
  requested_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  utc_date date := (now() at time zone 'utc')::date;
  total_used integer := 0;
  job_user uuid;
  admin_user boolean := false;
  has_boost boolean := false;
  reserved integer := 0;
  job_model text := 'gpt-image-2.5-flare';
BEGIN
  IF requested_count < 1 or requested_count > 3 THEN
    RAISE EXCEPTION 'requested_count must be between 1 and 3';
  END IF;

  SELECT user_id, quota_reserved_count, preferred_model
    INTO job_user, reserved, job_model
  FROM public.image_generation_jobs
  WHERE id = target_job_id
  FOR UPDATE;

  IF job_user IS NULL OR job_user <> target_user_id THEN
    RAISE EXCEPTION 'Invalid image job';
  END IF;

  IF reserved > 0 THEN
    RAISE EXCEPTION 'Quota already reserved for this job';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = target_user_id)
    INTO admin_user;

  SELECT public.user_has_boost(target_user_id) INTO has_boost;

  -- Admin & Boost subscribers get UNLIMITED image generation and editing
  IF admin_user OR has_boost THEN
    INSERT INTO public.daily_image_usage(user_id, usage_date, used_count)
    VALUES (target_user_id, utc_date, 0)
    ON CONFLICT (user_id, usage_date) DO NOTHING;

    UPDATE public.daily_image_usage
    SET used_count = used_count + requested_count, updated_at = now()
    WHERE user_id = target_user_id AND usage_date = utc_date;

    UPDATE public.image_generation_jobs
    SET quota_reserved_count = requested_count,
        quota_usage_date = utc_date,
        quota_finalized_at = CASE WHEN admin_user THEN now() ELSE quota_finalized_at END
    WHERE id = target_job_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'used', 0,
      'remaining', null,
      'limit', null,
      'isAdmin', admin_user,
      'isBoost', has_boost,
      'resetAt', null
    );
  END IF;

  -- Free accounts get 3 images total period
  SELECT coalesce(sum(used_count), 0)
    INTO total_used
  FROM public.daily_image_usage
  WHERE user_id = target_user_id;

  IF total_used + requested_count > 3 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', total_used,
      'remaining', greatest(0, 3 - total_used),
      'limit', 3,
      'isAdmin', false,
      'isBoost', false,
      'error', 'Free plan includes 3 images total. Upgrade to ArcAI Boost for unlimited image generation and edits.',
      'resetAt', null
    );
  END IF;

  INSERT INTO public.daily_image_usage(user_id, usage_date, used_count)
  VALUES (target_user_id, utc_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  UPDATE public.daily_image_usage
  SET used_count = used_count + requested_count, updated_at = now()
  WHERE user_id = target_user_id AND usage_date = utc_date;

  UPDATE public.image_generation_jobs
  SET quota_reserved_count = requested_count,
      quota_usage_date = utc_date
  WHERE id = target_job_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', total_used + requested_count,
    'remaining', greatest(0, 3 - (total_used + requested_count)),
    'limit', 3,
    'isAdmin', false,
    'isBoost', false,
    'resetAt', null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_image_quota(uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_image_quota(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_image_quota(chosen_model text DEFAULT 'gpt-image-2.5-flare')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total_used integer := 0;
  admin_user boolean := false;
  has_boost boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = uid)
    INTO admin_user;

  SELECT public.user_has_boost(uid) INTO has_boost;

  IF admin_user OR has_boost THEN
    RETURN jsonb_build_object(
      'used', 0,
      'remaining', null,
      'limit', null,
      'isAdmin', admin_user,
      'isBoost', has_boost,
      'resetAt', null
    );
  END IF;

  SELECT coalesce(sum(du.used_count), 0)
    INTO total_used
  FROM public.daily_image_usage du
  WHERE du.user_id = uid;

  RETURN jsonb_build_object(
    'used', total_used,
    'remaining', greatest(0, 3 - total_used),
    'limit', 3,
    'isAdmin', false,
    'isBoost', false,
    'resetAt', null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_image_quota(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_image_quota(text) TO authenticated;
