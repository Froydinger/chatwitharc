-- Fix security issues in admin_users and generated_files tables

-- Issue 1: Restrict admin_users table access to prevent email harvesting
-- Admins should only be able to view their own admin record, not all admin emails
DROP POLICY IF EXISTS "Admin users can view admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can view their own admin record" ON public.admin_users;

-- New policy: Admins can only view their own admin record
CREATE POLICY "Admin users can view their own admin record"
  ON public.admin_users
  FOR SELECT
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- Keep other admin_users policies as-is for insert/update/delete
-- (they already require is_admin_user() which is properly secured)


-- Issue 2: Add UPDATE policy for generated_files table
-- Users should be able to update their own file records (e.g., increment download counts)
CREATE POLICY "Users can update their own files"
  ON public.generated_files
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
