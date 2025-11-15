-- Fix security issues: Add primary admin flag and missing UPDATE policy

-- 1. Add is_primary_admin column to admin_users table
ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS is_primary_admin BOOLEAN DEFAULT FALSE;

-- 2. Mark the existing primary admin
UPDATE public.admin_users 
SET is_primary_admin = TRUE 
WHERE email = 'j@froydinger.com';

-- 3. Create trigger to prevent primary admin deletion
CREATE OR REPLACE FUNCTION public.prevent_primary_admin_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_primary_admin = TRUE THEN
    RAISE EXCEPTION 'Cannot delete the primary administrator account.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_primary_admin_deletion_trigger
BEFORE DELETE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_primary_admin_deletion();

-- 4. Add missing UPDATE policy to generated_files table
CREATE POLICY "Users can update their own files"
ON public.generated_files
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);