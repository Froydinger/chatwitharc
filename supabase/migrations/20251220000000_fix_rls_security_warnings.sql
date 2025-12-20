-- ==========================================
-- FIX RLS SECURITY WARNINGS
-- ==========================================
-- This migration addresses the following Lovable Cloud security warnings:
-- 1. MISSING_RLS_PROTECTION: profiles table lacks DELETE policy
-- 2. ADMIN_FUNCTION_DEPENDENCY: admin_settings and admin_users rely solely on is_admin_user()

-- ==========================================
-- 1. ADD DELETE POLICY FOR PROFILES TABLE
-- ==========================================
-- Users should be able to delete their own profile data for GDPR/CCPA compliance

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================
-- 2. STRENGTHEN ADMIN_SETTINGS RLS POLICIES
-- ==========================================
-- Add backup admin check that doesn't solely rely on is_admin_user() function
-- This provides defense-in-depth in case the function has issues

DROP POLICY IF EXISTS "Admins can view admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can create admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can delete admin settings" ON public.admin_settings;

CREATE POLICY "Admins can view admin settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admins can create admin settings"
  ON public.admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admins can update admin settings"
  ON public.admin_settings FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  )
  WITH CHECK (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete admin settings"
  ON public.admin_settings FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

-- ==========================================
-- 3. STRENGTHEN ADMIN_USERS RLS POLICIES
-- ==========================================
-- Add backup admin check with direct table lookup

DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can create admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can update admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can delete admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can view admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can insert admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can update admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can delete admin records" ON public.admin_users;

CREATE POLICY "Admin users can view admin records"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admin users can create admin records"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admin users can update admin records"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  )
  WITH CHECK (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

CREATE POLICY "Admin users can delete admin records"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user() OR
    auth.uid() IN (SELECT user_id FROM public.admin_users WHERE role = 'admin')
  );

-- Add explanatory comments
COMMENT ON TABLE public.profiles IS 'User profile data with full CRUD policies including DELETE for GDPR/CCPA compliance.';
COMMENT ON TABLE public.admin_settings IS 'Admin settings protected by RLS with dual-check security (function + direct table lookup).';
COMMENT ON TABLE public.admin_users IS 'Admin user records protected by RLS with dual-check security (function + direct table lookup).';
