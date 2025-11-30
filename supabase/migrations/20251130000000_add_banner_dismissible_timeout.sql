-- Add dismissible and timeout settings for admin banner
INSERT INTO public.admin_settings (key, value, description) VALUES
  ('banner_dismissible', 'false', 'Allow users to dismiss the banner with an X button'),
  ('banner_timeout', '0', 'Auto-hide banner after N seconds (0 = no timeout)')
ON CONFLICT (key) DO NOTHING;
