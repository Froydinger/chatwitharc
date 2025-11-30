-- Add color setting for admin banner
INSERT INTO public.admin_settings (key, value, description) VALUES
  ('banner_color', '#00f0ff', 'Background color for the admin banner (hex color code)')
ON CONFLICT (key) DO NOTHING;
