-- Defense-in-depth: remove dependency on is_admin_user() for admin_settings table protection
-- Use a direct membership check against admin_users in RLS policies.

-- Drop existing policies (names as created previously)
DROP POLICY IF EXISTS "Admins can view admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can create admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can delete admin settings" ON public.admin_settings;

-- Recreate policies using direct admin membership check
CREATE POLICY "Admins can view admin settings"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can create admin settings"
ON public.admin_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can update admin settings"
ON public.admin_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can delete admin settings"
ON public.admin_settings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);
