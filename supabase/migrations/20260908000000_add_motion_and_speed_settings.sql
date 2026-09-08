-- Motion speed, orb speed multipliers, and transition settings
--
-- Adds:
--   * thinking_orb_speed: chat indicator speed multiplier (0.5 to 2.5, default 1.0)
--   * voice_orb_speed: voice mode orb speed multiplier (0.5 to 2.5, default 1.0)
--   * motion_speed: global UI transition & motion speed multiplier (0.5 to 2.0, default 1.0)

INSERT INTO public.admin_settings (key, value, description) VALUES
  ('thinking_orb_speed', '1',
   'Chat thinking orb animation speed multiplier (0.5 = relaxed, 1 = normal, 2 = fast)'),
  ('voice_orb_speed', '1',
   'Voice mode orb animation speed multiplier (0.5 = relaxed, 1 = normal, 2 = fast)'),
  ('motion_speed', '1',
   'Global transitions and motion duration multiplier (0.5 = snappy, 1 = normal, 2 = slow/cinematic)')
ON CONFLICT (key) DO NOTHING;

-- Allow authenticated users to read motion settings
DROP POLICY IF EXISTS "Anyone can read motion settings" ON public.admin_settings;
CREATE POLICY "Anyone can read motion settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key LIKE 'motion\_%');
