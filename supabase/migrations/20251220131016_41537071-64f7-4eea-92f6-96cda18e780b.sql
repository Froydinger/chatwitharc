-- Strengthen is_admin_user() function with explicit authentication validation
-- This adds defense-in-depth by ensuring auth.uid() is not null before checking admin status
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get the current user ID with explicit null check
  current_user_id := auth.uid();
  
  -- If no authenticated user, deny access immediately
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if the authenticated user exists in admin_users table
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = current_user_id
  );
END;
$$;

-- Add comment documenting the security design
COMMENT ON FUNCTION public.is_admin_user() IS 
'Validates if current authenticated user is an admin. 
Security features:
- SECURITY DEFINER with fixed search_path prevents injection attacks
- Explicit null check on auth.uid() prevents unauthenticated access
- Uses parameterized query (variable binding) to prevent SQL injection
- Called by RLS policies on admin_settings and admin_users tables';