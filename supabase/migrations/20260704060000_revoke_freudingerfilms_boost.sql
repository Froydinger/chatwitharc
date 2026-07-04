-- Revoke Boost subscription for freudingerfilms@gmail.com
DO $$
DECLARE
  target_uid uuid;
BEGIN
  SELECT id INTO target_uid FROM auth.users WHERE email = 'freudingerfilms@gmail.com';
  IF target_uid IS NOT NULL THEN
    DELETE FROM public.subscriptions WHERE user_id = target_uid;
  END IF;
END $$;
