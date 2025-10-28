-- Add accent_color and theme_preference columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN accent_color text DEFAULT 'blue',
ADD COLUMN theme_preference text DEFAULT 'dark';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.accent_color IS 'User preferred accent color (red, blue, green, yellow, purple, orange)';
COMMENT ON COLUMN public.profiles.theme_preference IS 'User preferred theme (dark, light, or system)';