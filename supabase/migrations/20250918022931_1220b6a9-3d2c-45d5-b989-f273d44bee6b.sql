-- Create a security definer function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND email = 'j@froydinger.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Drop all existing policies on admin_users
DROP POLICY IF EXISTS "Users can view their own admin record" ON public.admin_users;
DROP POLICY IF EXISTS "Existing admins can view all admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Primary admin can manage admin users" ON public.admin_users;

-- Create simple, non-recursive policies using the security definer function
CREATE POLICY "Admin users can view admin records" 
ON public.admin_users 
FOR SELECT 
USING (public.is_admin_user());

CREATE POLICY "Admin users can manage admin records" 
ON public.admin_users 
FOR ALL 
USING (public.is_admin_user());

-- Update admin_settings policies to use the security definer function
DROP POLICY IF EXISTS "Admins can view admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can insert admin settings" ON public.admin_settings;

CREATE POLICY "Admin users can view settings" 
ON public.admin_settings 
FOR SELECT 
USING (public.is_admin_user());

CREATE POLICY "Admin users can update settings" 
ON public.admin_settings 
FOR UPDATE 
USING (public.is_admin_user());

CREATE POLICY "Admin users can insert settings" 
ON public.admin_settings 
FOR INSERT 
WITH CHECK (public.is_admin_user());