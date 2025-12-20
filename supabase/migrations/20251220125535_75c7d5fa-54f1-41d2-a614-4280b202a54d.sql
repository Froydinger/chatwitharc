-- Update make_primary_admin function to use admin_settings table instead of hardcoded email
CREATE OR REPLACE FUNCTION public.make_primary_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_admin_email text;
BEGIN
  -- Get primary admin email from admin_settings table
  SELECT value INTO primary_admin_email 
  FROM public.admin_settings 
  WHERE key = 'primary_admin_email';
  
  -- If we have a configured primary admin email and it matches, grant admin
  IF primary_admin_email IS NOT NULL AND NEW.email = primary_admin_email THEN
    INSERT INTO public.admin_users (user_id, email, role, is_primary_admin)
    VALUES (NEW.id, NEW.email, 'admin', true)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Insert the primary admin email setting (only if it doesn't exist)
INSERT INTO public.admin_settings (key, value, description)
VALUES ('primary_admin_email', 'j@froydinger.com', 'Email address that will be auto-granted primary admin on signup')
ON CONFLICT (key) DO NOTHING;