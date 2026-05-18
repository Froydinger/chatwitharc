-- Subscriptions table (Paddle-backed)
CREATE TABLE public.subscriptions (
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_paddle_customer_id ON public.subscriptions(paddle_customer_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin_user());

CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comped users table
CREATE TABLE public.comped_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comped_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage comped users" ON public.comped_users
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

CREATE POLICY "Users can check if comped" ON public.comped_users
  FOR SELECT TO authenticated USING (true);

-- Helper: does the current user have Pro access?
CREATE OR REPLACE FUNCTION public.user_has_pro_access(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  IF check_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Admin?
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = check_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Active subscription?
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = check_user_id
      AND status IN ('active', 'trialing', 'past_due')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Comped?
  SELECT email INTO user_email FROM auth.users WHERE id = check_user_id;
  IF user_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.comped_users WHERE lower(email) = lower(user_email)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;