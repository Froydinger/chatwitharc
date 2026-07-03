-- 1. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT UNIQUE,
  paddle_product_id TEXT,
  paddle_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  product_id text,
  price_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_start timestamptz
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env ON public.subscriptions(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions(stripe_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())));

CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Update function update_updated_at_column if trigger set_subscriptions_updated_at is used
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_subscriptions_updated_at') THEN
    CREATE TRIGGER set_subscriptions_updated_at
      BEFORE UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- 2. Create voice_conversations table
CREATE TABLE IF NOT EXISTS public.voice_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_conversations_user_created ON public.voice_conversations(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.voice_conversations TO authenticated;
GRANT ALL ON public.voice_conversations TO service_role;

ALTER TABLE public.voice_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice conversations"
  ON public.voice_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voice conversations"
  ON public.voice_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Count voice conversations in last 30 days
CREATE OR REPLACE FUNCTION public.count_voice_conversations_30d(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.voice_conversations
  WHERE user_id = target_user_id
    AND created_at > (now() - interval '30 days');
$$;

GRANT EXECUTE ON FUNCTION public.count_voice_conversations_30d(uuid) TO authenticated, service_role;

-- 4. Record one voice conversation
CREATE OR REPLACE FUNCTION public.record_voice_conversation(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_user_id IS NULL OR target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO public.voice_conversations (user_id) VALUES (target_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_voice_conversation(uuid) TO authenticated, service_role;

-- 5. Boost entitlement check (used both client- and server-side)
CREATE OR REPLACE FUNCTION public.user_has_boost(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF check_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Admins always have Boost
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = check_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Active Boost subscription (any environment)
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = check_user_id
      AND price_id = 'arcai_boost_monthly'
      AND (
        status IN ('active', 'trialing', 'past_due')
        OR (status = 'canceled' AND current_period_end IS NOT NULL AND current_period_end > now())
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_boost(uuid) TO authenticated, service_role;

-- 6. Dynamic image quota checks (Admin = Unlimited, Boost = 30, Free = 10)
CREATE OR REPLACE FUNCTION public.get_my_image_quota()
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

  IF has_boost THEN
    image_limit := 30;
  END IF;

  SELECT coalesce(du.used_count, 0)
    INTO used
  FROM (SELECT 1) seed
  LEFT JOIN public.daily_image_usage du
    ON du.user_id = uid AND du.usage_date = utc_date;

  RETURN jsonb_build_object(
    'used', used,
    'remaining', CASE WHEN admin_user THEN null ELSE greatest(0, image_limit - used) END,
    'limit', CASE WHEN admin_user THEN null ELSE image_limit END,
    'isAdmin', admin_user,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_image_quota() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_image_quota() TO authenticated;

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
BEGIN
  IF requested_count < 1 or requested_count > 3 THEN
    RAISE EXCEPTION 'requested_count must be between 1 and 3';
  END IF;

  SELECT user_id, quota_reserved_count
    INTO job_user, reserved
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
      SET quota_finalized_at = now()
    WHERE id = target_job_id;
    RETURN jsonb_build_object(
      'allowed', true, 'used', 0, 'remaining', null,
      'limit', null, 'isAdmin', true,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  SELECT public.user_has_boost(target_user_id) INTO has_boost;

  IF has_boost THEN
    image_limit := 30;
  END IF;

  INSERT INTO public.daily_image_usage(user_id, usage_date, used_count)
  VALUES (target_user_id, utc_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count INTO used
  from public.daily_image_usage
  WHERE user_id = target_user_id AND usage_date = utc_date
  FOR UPDATE;

  IF used + requested_count > image_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'used', used, 'remaining', greatest(0, image_limit - used),
      'limit', image_limit, 'isAdmin', false,
      'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
    );
  END IF;

  UPDATE public.daily_image_usage
    SET used_count = used_count + requested_count, updated_at = now()
  WHERE user_id = target_user_id AND usage_date = utc_date;

  UPDATE public.image_generation_jobs
    SET quota_reserved_count = requested_count
  WHERE id = target_job_id;

  RETURN jsonb_build_object(
    'allowed', true, 'used', used + requested_count,
    'remaining', image_limit - used - requested_count,
    'limit', image_limit, 'isAdmin', false,
    'resetAt', ((utc_date + 1)::timestamp at time zone 'UTC')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_image_quota(uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_image_quota(uuid, uuid, integer) TO service_role;
