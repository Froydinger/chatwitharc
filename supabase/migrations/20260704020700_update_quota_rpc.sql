CREATE OR REPLACE FUNCTION public.get_my_image_quota(chosen_model text DEFAULT 'gpt-image-1')
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
  used_gpt_image_2 integer := 0;
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

  SELECT count(*)::integer INTO used_gpt_image_2
  FROM public.image_generation_jobs
  WHERE user_id = uid
    AND preferred_model = 'gpt-image-2'
    AND status = 'completed'
    AND created_at::date = utc_date;

  -- Apply limits based on model:
  -- gpt-image-2: Free tier: 3 images/day. Boost tier: 20 images/day.
  -- gpt-image-1-mini: 40 images/day.
  -- gpt-image-1 (default): 10 images/day.
  IF chosen_model = 'gpt-image-2' THEN
    IF has_boost THEN
      image_limit := 20;
    ELSE
      image_limit := 3;
      used := used_gpt_image_2;
    END IF;
  ELSIF chosen_model = 'gpt-image-1-mini' THEN
    image_limit := 40;
  ELSE -- gpt-image-1 or default
    image_limit := 10;
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
