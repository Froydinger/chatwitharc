-- Step 1: Add unique constraint on user_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_users_user_id_key'
  ) THEN
    ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Step 2: Ensure current admin user exists in admin_users table
INSERT INTO public.admin_users (user_id, email, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE email = 'j@froydinger.com'
ON CONFLICT (user_id) DO NOTHING;

-- Step 3: Fix is_admin_user function - remove hardcoded email check
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid()
  );
END;
$$;

-- Step 4: Create function to prevent deleting the last admin
CREATE OR REPLACE FUNCTION public.prevent_last_admin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_count integer;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.admin_users;
  
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last administrator. At least one admin must remain.';
  END IF;
  
  RETURN OLD;
END;
$$;

-- Step 5: Create trigger for last admin protection
DROP TRIGGER IF EXISTS protect_last_admin ON public.admin_users;
CREATE TRIGGER protect_last_admin
  BEFORE DELETE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_deletion();

-- Step 6: Drop all existing policies
DROP POLICY IF EXISTS "Admin users can manage admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can view admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can insert admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can update admin records" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can delete admin records" ON public.admin_users;

-- Step 7: Create specific granular policies for better security control
CREATE POLICY "Admin users can view admin records"
  ON public.admin_users
  FOR SELECT
  USING (is_admin_user());

CREATE POLICY "Admin users can insert admin records"
  ON public.admin_users
  FOR INSERT
  WITH CHECK (is_admin_user());

CREATE POLICY "Admin users can update admin records"
  ON public.admin_users
  FOR UPDATE
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE POLICY "Admin users can delete admin records"
  ON public.admin_users
  FOR DELETE
  USING (is_admin_user());