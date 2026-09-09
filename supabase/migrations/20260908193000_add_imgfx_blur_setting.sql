-- Seed imgfx_blur setting in admin_settings table
-- Controls blur radius (in px) for image generation animations

INSERT INTO public.admin_settings (key, value, description) VALUES
  ('imgfx_blur', '0', 'Blur radius (in pixels) for image generation animations (0 = sharp, up to 30px)')
ON CONFLICT (key) DO NOTHING;
