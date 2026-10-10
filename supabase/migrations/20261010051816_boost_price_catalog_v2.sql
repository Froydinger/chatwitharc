-- Additive billing recognition for the approved new $15/month and $115/year
-- offers. Existing Stripe prices, subscriptions and renewal terms are untouched.
-- Keep this compatibility migration when rolling back model or Workspace UI.
CREATE OR REPLACE FUNCTION public.arc_is_boost_billing_price(price text, product text DEFAULT NULL)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(price IN (
 'arcai_boost_monthly','arcai_boost_annual',
 'arcai_boost_monthly_202610','arcai_boost_annual_202610',
 'price_1TpXatAB32948AKD6EmXcZo0','price_1TpXf9AB32948AKDtKNThFaZ',
 'price_1TcFYeAB32948AKDObaHk0fz','price_1TpKUdAB32948AKD4CUxINQY',
 'price_1UOrq0AB32948AKDzDqPg1vp','price_1UOrqPAB32948AKDjnqWyyC4'
 ) OR product='prod_UbSTljFnpRfR8v',false)
$$;
REVOKE ALL ON FUNCTION public.arc_is_boost_billing_price(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arc_is_boost_billing_price(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.user_has_boost(check_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF check_user_id IS NULL OR (check_user_id IS DISTINCT FROM auth.uid() AND coalesce(auth.jwt()->>'role','')<>'service_role') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=check_user_id) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=check_user_id
  AND public.arc_is_boost_billing_price(price_id,product_id)
  AND (status IN ('active','trialing','past_due') OR (status='canceled' AND current_period_end IS NOT NULL AND current_period_end>now())))
 OR EXISTS(SELECT 1 FROM public.google_play_subscriptions WHERE user_id=check_user_id
  AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
  AND expiry_time IS NOT NULL AND expiry_time>now());
END $$;
REVOKE ALL ON FUNCTION public.user_has_boost(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.user_has_boost(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arc_image_tier(u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM admin_users WHERE user_id=u) THEN 'admin'
 WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id=u AND public.arc_is_boost_billing_price(price_id,product_id)
 AND (status IN ('active','trialing','past_due') OR (status='canceled' AND current_period_end>now())))
 OR EXISTS(SELECT 1 FROM google_play_subscriptions WHERE user_id=u AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') AND expiry_time>now())
 THEN 'boost' ELSE 'free' END
$$;

CREATE OR REPLACE FUNCTION public.arc_image_transition_candidates() RETURNS TABLE(user_id uuid,expires_at timestamptz,date_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.id,CASE WHEN arc_image_transition_is_granted(u.id) OR d.expires_at>='9999-01-01T00:00:00Z'::timestamptz THEN NULL ELSE d.expires_at END,
 CASE WHEN arc_image_transition_is_granted(u.id) THEN 'grant' WHEN d.expires_at IS NULL OR d.expires_at>='9999-01-01T00:00:00Z'::timestamptz THEN 'missing' WHEN d.expires_at<=now() THEN 'expired' ELSE 'valid' END
 FROM auth.users u LEFT JOIN LATERAL (
 SELECT max(e.expiry) expires_at FROM (
 SELECT s.current_period_end expiry FROM subscriptions s WHERE s.user_id=u.id
 AND public.arc_is_boost_billing_price(s.price_id,s.product_id)
 AND (s.status IN ('active','trialing','past_due') OR (s.status='canceled' AND s.current_period_end>now()))
 UNION ALL SELECT g.expiry_time FROM google_play_subscriptions g WHERE g.user_id=u.id
 AND g.subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') AND g.expiry_time>now()
 ) e
 ) d ON true WHERE NOT coalesce(u.is_anonymous,false) AND arc_image_tier(u.id)='boost'
$$;
-- CREATE OR REPLACE retains the existing service-only ACLs of image helpers.
