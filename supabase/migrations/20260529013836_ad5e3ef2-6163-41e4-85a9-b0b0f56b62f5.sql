-- 1. Extend subscriptions table with Stripe-native columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env ON public.subscriptions(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions(stripe_subscription_id);

-- 2. Voice conversation usage tracking (rolling 30-day quota)
CREATE TABLE public.voice_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_voice_conversations_user_created ON public.voice_conversations(user_id, created_at DESC);

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

-- 4. Record one voice conversation (idempotent at the call-site; this is a simple insert)
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