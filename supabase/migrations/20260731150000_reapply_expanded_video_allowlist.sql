-- Forward-only reapplication of the expanded private Sora allowlist.
--
-- 20260731130000 was edited after it had already run in production. Supabase
-- does not rerun an applied migration when its file changes, so production
-- retained the original single address until this new migration.

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

  SELECT lower(trim(email)) INTO user_email
  FROM auth.users
  WHERE id = check_user_id;

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
