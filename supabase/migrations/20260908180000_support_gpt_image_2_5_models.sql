-- Support GPT Image 2.5 Flare (Quick) and Sunburst (Pro) in quota checks.

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
  used integer := 0;
  reserved integer := 0;
  job_user uuid;
  admin_user boolean := false;
  has_boost boolean := false;
  image_limit integer := 10;
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

  IF admin_user THEN
    UPDATE public.image_generation_jobs
      SET quota_usage_date = utc_date,
          quota_finalized_at = now()
    WHERE id = target_job_id;
    RETURN jsonb_build_object(
      'allowed', true, 'used', 0, 'remaining', null,
      'limit', null, 'isAdmin', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  SELECT public.user_has_boost(target_user_id) INTO has_boost;

  INSERT INTO public.daily_image_usage(user_id, usage_date, used_count)
  VALUES (target_user_id, utc_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count INTO used
  FROM public.daily_image_usage
  WHERE user_id = target_user_id AND usage_date = utc_date
  FOR UPDATE;

  -- Apply limits based on model:
  -- gpt-image-2.5-sunburst / gpt-image-2: Boost/Admin ONLY, 20 images per day
  -- gpt-image-1-mini: 40 images per day
  -- gpt-image-2.5-flare (default): 10 images per day for Free, 20 images per day for Boost
  IF job_model IN ('gpt-image-2.5-sunburst', 'gpt-image-2') THEN
    IF NOT has_boost THEN
      RETURN jsonb_build_object(
        'allowed', false, 'used', used, 'remaining', 0,
        'limit', 20, 'isAdmin', false, 'error', 'GPT-Image-2.5 Pro is only available to Boost tier accounts.',
        'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
      );
    END IF;
    image_limit := 20;
  ELSIF job_model = 'gpt-image-1-mini' THEN
    image_limit := 40;
  ELSE -- gpt-image-2.5-flare, legacy gpt-image-1 or default
    IF has_boost THEN
      image_limit := 20;
    ELSE
      image_limit := 10;
    END IF;
  END IF;

  IF used + requested_count > image_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'used', used, 'remaining', greatest(0, image_limit - used),
      'limit', image_limit, 'isAdmin', false,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  -- reserve it
  UPDATE public.image_generation_jobs
  SET quota_reserved_count = requested_count,
      quota_usage_date = utc_date
  WHERE id = target_job_id;

  UPDATE public.daily_image_usage
  SET used_count = used_count + requested_count, updated_at = now()
  WHERE user_id = target_user_id AND usage_date = utc_date;

  RETURN jsonb_build_object(
    'allowed', true, 'used', used + requested_count, 'remaining', greatest(0, image_limit - (used + requested_count)),
    'limit', image_limit, 'isAdmin', false,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
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
  utc_date date := (now() at time zone 'utc')::date;
  used integer := 0;
  admin_user boolean := false;
  has_boost boolean := false;
  image_limit integer := 10;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = uid)
    INTO admin_user;

  SELECT public.user_has_boost(uid) INTO has_boost;

  SELECT coalesce(du.used_count, 0)
    INTO used
  FROM (SELECT 1) seed
  LEFT JOIN public.daily_image_usage du
    ON du.user_id = uid AND du.usage_date = utc_date;

  IF chosen_model IN ('gpt-image-2.5-sunburst', 'gpt-image-2') THEN
    IF has_boost THEN
      image_limit := 20;
    ELSE
      image_limit := 0;
    END IF;
  ELSIF chosen_model = 'gpt-image-1-mini' THEN
    image_limit := 40;
  ELSE
    IF has_boost THEN
      image_limit := 20;
    ELSE
      image_limit := 10;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'used', used,
    'remaining', CASE WHEN admin_user THEN null ELSE greatest(0, image_limit - used) END,
    'limit', CASE WHEN admin_user THEN null ELSE image_limit END,
    'isAdmin', admin_user,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;
