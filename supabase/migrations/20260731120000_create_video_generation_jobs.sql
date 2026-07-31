-- Video generation (Sora 2) — Boost/admin only.
--
-- STORAGE POLICY: this table holds TEXT ONLY. The rendered MP4 is never
-- written to Postgres, Supabase Storage, or R2 — it is streamed from the
-- provider straight through to the browser, which keeps it in IndexedDB.
-- Videos are large and we are not going to fill the project up with them.
-- `provider_video_id` is just a handle for the provider's own (1 hour)
-- retention window; once that lapses the only copy is the user's device.

CREATE TABLE public.video_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'text' = text-to-video, 'image' = animate an existing image (first frame)
  mode TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  prompt TEXT NOT NULL,
  -- URL of the still being animated. A reference, not the bytes.
  source_image_url TEXT,
  seconds INT NOT NULL DEFAULT 4,
  size TEXT NOT NULL DEFAULT '1280x720',
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'sora-2',
  -- Provider-side handle used to fetch the MP4 while it is still available.
  provider_video_id TEXT,
  -- When the provider stops serving the content (~1h after render).
  content_expires_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  error_type TEXT,
  -- Seconds of daily allowance held for this job; billing unit is per-second.
  quota_reserved_seconds INT NOT NULL DEFAULT 0,
  quota_reserved_date DATE,
  quota_finalized_at TIMESTAMP WITH TIME ZONE,
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video jobs"
ON public.video_generation_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video jobs"
ON public.video_generation_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update any video job"
ON public.video_generation_jobs
FOR UPDATE
USING (true);

CREATE INDEX idx_video_jobs_user_id ON public.video_generation_jobs(user_id);
CREATE INDEX idx_video_jobs_status_created ON public.video_generation_jobs(status, created_at DESC);

CREATE TRIGGER update_video_jobs_updated_at
  BEFORE UPDATE ON public.video_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Daily allowance is counted in SECONDS, not clips, because that is the unit
-- the provider bills in ($0.10/s at 720p).
CREATE TABLE public.daily_video_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  used_seconds INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.daily_video_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video usage"
ON public.daily_video_usage
FOR SELECT
USING (auth.uid() = user_id);

-- Boost tier: 20 seconds/day — five 4-second clips, ~$2.00/day ceiling per
-- user. Free tier gets nothing. Admins are unmetered. Tune this number here.
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
  admin_user boolean := false;
  has_boost boolean := false;
  second_limit integer := 20;
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

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = target_user_id)
    INTO admin_user;

  IF admin_user THEN
    UPDATE public.video_generation_jobs
      SET quota_finalized_at = now()
    WHERE id = target_job_id;
    RETURN jsonb_build_object(
      'allowed', true, 'usedSeconds', 0, 'remainingSeconds', null,
      'limitSeconds', null, 'isAdmin', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  SELECT public.user_has_boost(target_user_id) INTO has_boost;

  IF NOT has_boost THEN
    RETURN jsonb_build_object(
      'allowed', false, 'usedSeconds', 0, 'remainingSeconds', 0,
      'limitSeconds', 0, 'isAdmin', false,
      'error', 'Video generation is a Boost feature.',
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
      'limitSeconds', second_limit, 'isAdmin', false,
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
    'limitSeconds', second_limit, 'isAdmin', false,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

-- Refund the reservation when a render fails. The provider does sometimes
-- charge for a failed run, but we are not going to bill the user's daily
-- allowance for a clip they never received.
CREATE OR REPLACE FUNCTION public.finalize_video_quota(
  target_job_id uuid,
  succeeded boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_user uuid;
  reserved integer := 0;
  reserved_date date;
  finalized timestamptz;
BEGIN
  SELECT user_id, quota_reserved_seconds, quota_reserved_date, quota_finalized_at
    INTO job_user, reserved, reserved_date, finalized
  FROM public.video_generation_jobs
  WHERE id = target_job_id
  FOR UPDATE;

  IF job_user IS NULL OR finalized IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT succeeded AND reserved > 0 AND reserved_date IS NOT NULL THEN
    UPDATE public.daily_video_usage
    SET used_seconds = greatest(0, used_seconds - reserved)
    WHERE user_id = job_user AND usage_date = reserved_date;
  END IF;

  UPDATE public.video_generation_jobs
  SET quota_finalized_at = now()
  WHERE id = target_job_id;
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
  admin_user boolean := false;
  has_boost boolean := false;
  second_limit integer := 20;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = uid)
    INTO admin_user;
  SELECT public.user_has_boost(uid) INTO has_boost;

  SELECT coalesce(du.used_seconds, 0)
    INTO used
  FROM (SELECT 1) seed
  LEFT JOIN public.daily_video_usage du
    ON du.user_id = uid AND du.usage_date = utc_date;

  IF admin_user THEN
    RETURN jsonb_build_object(
      'usedSeconds', used, 'remainingSeconds', null, 'limitSeconds', null,
      'isAdmin', true, 'hasAccess', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  RETURN jsonb_build_object(
    'usedSeconds', used,
    'remainingSeconds', CASE WHEN has_boost THEN greatest(0, second_limit - used) ELSE 0 END,
    'limitSeconds', CASE WHEN has_boost THEN second_limit ELSE 0 END,
    'isAdmin', false, 'hasAccess', has_boost,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

-- Match the image-quota hardening: only the service role may move the meter,
-- callers may only read their own.
REVOKE ALL ON FUNCTION public.reserve_video_quota(uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_video_quota(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_video_quota(uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_video_quota(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_video_quota() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_video_quota() TO authenticated;
