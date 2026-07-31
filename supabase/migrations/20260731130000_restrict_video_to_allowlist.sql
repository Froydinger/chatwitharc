-- Narrow video generation from "any Boost account" to a hard email allowlist.
--
-- Rationale: OpenAI removes the Videos API and every sora-2 model on
-- 2026-09-24. Shipping a paid feature with an eight-week life would mean
-- selling Boost on something that disappears, so video stays private until
-- there is a provider that will still exist.
--
-- To open it up later: add addresses to the array in
-- public.user_can_generate_video, and mirror the list in
-- src/hooks/useVideoAccess.tsx.

CREATE OR REPLACE FUNCTION public.user_can_generate_video(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  IF check_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(email) INTO user_email FROM auth.users WHERE id = check_user_id;
  IF user_email IS NULL THEN
    RETURN false;
  END IF;

  RETURN user_email = ANY (ARRAY[
    'jkrd09@gmail.com',
    'jakefroydinger@gmail.com',
    'j@froydinger.com'
  ]);
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_generate_video(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_can_generate_video(uuid) TO authenticated, service_role;

-- The daily allowance is no longer a fairness rule — with one user it is a
-- runaway-spend guard. 60 seconds/day is fifteen 4-second clips, a $6.00/day
-- ceiling, high enough not to interrupt real use and low enough that a
-- retry loop can't quietly bill hundreds of dollars.
--
-- Note this now applies to admins too. The image quota exempts them, but an
-- unmetered path to a per-second billed API is exactly the thing worth
-- capping, so video meters everyone.
CREATE OR REPLACE FUNCTION public.reserve_video_quota(
  target_user_id uuid,
  target_job_id uuid,
  requested_seconds integer
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
  can_generate boolean := false;
  second_limit integer := 60;
BEGIN
  IF requested_seconds < 1 OR requested_seconds > 12 THEN
    RAISE EXCEPTION 'requested_seconds must be between 1 and 12';
  END IF;

  SELECT user_id, quota_reserved_seconds
    INTO job_user, reserved
  FROM public.video_generation_jobs
  WHERE id = target_job_id
  FOR UPDATE;

  IF job_user IS NULL OR job_user <> target_user_id THEN
    RAISE EXCEPTION 'Invalid video job';
  END IF;

  IF reserved > 0 THEN
    RAISE EXCEPTION 'Quota already reserved for this job';
  END IF;

  SELECT public.user_can_generate_video(target_user_id) INTO can_generate;

  IF NOT can_generate THEN
    RETURN jsonb_build_object(
      'allowed', false, 'usedSeconds', 0, 'remainingSeconds', 0,
      'limitSeconds', 0, 'hasAccess', false,
      'error', 'Video generation is not enabled on this account.',
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  INSERT INTO public.daily_video_usage(user_id, usage_date, used_seconds)
  VALUES (target_user_id, utc_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_seconds INTO used
  FROM public.daily_video_usage
  WHERE user_id = target_user_id AND usage_date = utc_date
  FOR UPDATE;

  IF used + requested_seconds > second_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'usedSeconds', used,
      'remainingSeconds', greatest(0, second_limit - used),
      'limitSeconds', second_limit, 'hasAccess', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  UPDATE public.video_generation_jobs
  SET quota_reserved_seconds = requested_seconds,
      quota_reserved_date = utc_date
  WHERE id = target_job_id;

  UPDATE public.daily_video_usage
  SET used_seconds = used_seconds + requested_seconds
  WHERE user_id = target_user_id AND usage_date = utc_date;

  RETURN jsonb_build_object(
    'allowed', true, 'usedSeconds', used + requested_seconds,
    'remainingSeconds', greatest(0, second_limit - (used + requested_seconds)),
    'limitSeconds', second_limit, 'hasAccess', true,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_video_quota()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  utc_date date := (now() at time zone 'utc')::date;
  used integer := 0;
  can_generate boolean := false;
  second_limit integer := 60;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.user_can_generate_video(uid) INTO can_generate;

  SELECT coalesce(du.used_seconds, 0)
    INTO used
  FROM (SELECT 1) seed
  LEFT JOIN public.daily_video_usage du
    ON du.user_id = uid AND du.usage_date = utc_date;

  RETURN jsonb_build_object(
    'usedSeconds', used,
    'remainingSeconds', CASE WHEN can_generate THEN greatest(0, second_limit - used) ELSE 0 END,
    'limitSeconds', CASE WHEN can_generate THEN second_limit ELSE 0 END,
    'hasAccess', can_generate,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_video_quota(uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_quota(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_video_quota() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_video_quota() TO authenticated;
