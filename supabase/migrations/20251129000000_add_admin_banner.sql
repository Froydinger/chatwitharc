-- Add admin banner settings to admin_settings
INSERT INTO public.admin_settings (key, value, description) VALUES
('banner_enabled', 'false', 'Enable or disable the admin announcement banner'),
('banner_message', '', 'Message to display in the admin banner'),
('banner_icon', 'alert', 'Icon to display in the banner (construction, alert, or celebrate)')
ON CONFLICT (key) DO NOTHING;
