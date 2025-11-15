-- Add image generation restrictions setting to admin_settings
INSERT INTO public.admin_settings (key, value, description) VALUES
('image_restrictions', '', 'Negative prompts/restrictions for image generation (e.g., specific likenesses, buildings, events to exclude)')
ON CONFLICT (key) DO NOTHING;
