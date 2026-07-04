-- Create function to claim promo codes for lifetime or trial boost subscription
CREATE OR REPLACE FUNCTION public.claim_boost_promo(promo_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  period_end timestamptz;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  promo_code := upper(trim(promo_code));

  IF promo_code = 'BOOST4LIFE' THEN
    -- Lifetime Boost subscription (ends in year 9999)
    period_end := '9999-12-31 23:59:59+00'::timestamptz;
  ELSIF promo_code = '30DAYSFOFREE' THEN
    -- 30 days trial
    period_end := now() + interval '30 days';
  ELSE
    RETURN FALSE;
  END IF;

  -- Insert or update the subscription row
  INSERT INTO public.subscriptions (
    user_id,
    status,
    price_id,
    product_id,
    current_period_end,
    current_period_start,
    environment,
    stripe_subscription_id
  ) VALUES (
    current_user_id,
    'active',
    'arcai_boost_monthly',
    'arcai_boost',
    period_end,
    now(),
    'sandbox',
    'promo_' || promo_code || '_' || md5(current_user_id::text)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'active',
    price_id = 'arcai_boost_monthly',
    product_id = 'arcai_boost',
    current_period_end = EXCLUDED.current_period_end,
    current_period_start = EXCLUDED.current_period_start,
    environment = 'sandbox',
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    updated_at = now();

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_boost_promo(text) TO authenticated;
