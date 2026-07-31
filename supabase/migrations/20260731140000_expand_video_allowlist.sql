-- Add Jake's other existing ArcAI accounts to the private Sora allowlist.
--
-- The lookup starts from auth.users, so only an account that exists in the
-- database can pass this check. Keep this list in sync with
-- src/hooks/useVideoAccess.tsx and the canonical function definition in
-- 20260731130000_restrict_video_to_allowlist.sql.

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
