-- Fix: 20260704020600_update_quota_rules.sql wrote to a nonexistent column
-- `quota_reserved_date`; the real column (added in
-- 20260703173000_track_image_quota_reservation_date.sql) is `quota_usage_date`.
-- Every non-admin reserve_image_quota call raised 42703, breaking image
-- generation for all free users ("Could not check today's image allowance").
-- Admins returned before the broken UPDATE, which is why admin accounts were
-- unaffected.

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
  job_model text := 'gpt-image-1';
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
  from public.daily_image_usage
  WHERE user_id = target_user_id AND usage_date = utc_date
  FOR UPDATE;

  -- Apply limits based on model:
  -- gpt-image-2: Paid/Admin ONLY, 20 images per day
  -- gpt-image-1-mini: 40 images per day
  -- gpt-image-1 (default): 10 images per day
  IF job_model = 'gpt-image-2' THEN
    IF NOT has_boost THEN
      RETURN jsonb_build_object(
        'allowed', false, 'used', used, 'remaining', 0,
        'limit', 20, 'isAdmin', false, 'error', 'GPT-Image-2 is only available to Boost tier accounts.',
        'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
      );
    END IF;
    image_limit := 20;
  ELSIF job_model = 'gpt-image-1-mini' THEN
    image_limit := 40;
  ELSE -- gpt-image-1 or default
    image_limit := 10;
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
