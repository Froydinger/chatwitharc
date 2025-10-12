-- Strengthen admin_users RLS policies to prevent any potential data harvesting
-- The existing is_admin_user() function is secure (SECURITY DEFINER), but we add extra protection

-- Drop existing policies
DROP POLICY IF EXISTS "Admin users can view admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can insert admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can update admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can delete admin records" ON public.admin_users;

-- Recreate with same logic but more explicit security
CREATE POLICY "Admin users can view admin records"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin_user());

CREATE POLICY "Admin users can insert admin records"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_user());

CREATE POLICY "Admin users can update admin records"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY "Admin users can delete admin records"
ON public.admin_users
FOR DELETE
TO authenticated
USING (public.is_admin_user());

-- Add comment explaining the security model
COMMENT ON TABLE public.admin_users IS 'Admin user records protected by RLS. Access controlled via is_admin_user() security definer function which safely checks admin status without exposing data.';