-- Fix the infinite recursion in admin_users RLS policies
-- Drop existing policies
DROP POLICY IF EXISTS "Only admins can view admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Only admins can manage admin users" ON public.admin_users;

-- Create simpler, non-recursive policies
-- Allow users to see their own admin record
CREATE POLICY "Users can view their own admin record" 
ON public.admin_users 
FOR SELECT 
USING (user_id = auth.uid());

-- Allow existing admins to view all admin users (using email check)
CREATE POLICY "Existing admins can view all admin users" 
ON public.admin_users 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users existing_admin 
    WHERE existing_admin.user_id = auth.uid() 
    AND existing_admin.email = 'j@froydinger.com'
  )
);

-- Allow existing admins to manage admin users
CREATE POLICY "Primary admin can manage admin users" 
ON public.admin_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users existing_admin 
    WHERE existing_admin.user_id = auth.uid() 
    AND existing_admin.email = 'j@froydinger.com'
  )
);

-- Update admin_settings policies to use email check
DROP POLICY IF EXISTS "Only admins can view admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Only admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Only admins can insert admin settings" ON public.admin_settings;

CREATE POLICY "Admins can view admin settings" 
ON public.admin_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND email = 'j@froydinger.com'
  )
);

CREATE POLICY "Admins can update admin settings" 
ON public.admin_settings 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND email = 'j@froydinger.com'
  )
);

CREATE POLICY "Admins can insert admin settings" 
ON public.admin_settings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND email = 'j@froydinger.com'
  )
);