-- Voice-mode orb selection, code/writing thinking orbs, and img-fx settings
--
-- Extends the thinking-indicator config added in
-- 20260811120000_add_thinking_orb_settings.sql with:
--   * a per-phase orb for voice mode (connecting / listening / thinking / speaking)
--   * two more chat activities, code and writing, picked from the stream mode
--     the model's request resolves to
--   * the img-fx WebGL image-generation loader settings
--
-- As before, the seeded values reproduce current behaviour, so applying this
-- changes nothing until an admin picks something.

INSERT INTO public.admin_settings (key, value, description) VALUES
  ('thinking_orb_code',    'solving',
   'Orb animation while Arc generates code into a Canvas'),
  ('thinking_orb_writing', 'composing',
   'Orb animation while Arc drafts long-form prose into a Canvas'),

  ('voice_orb_connecting', 'connecting',
   'Voice mode orb while the realtime session is opening'),
  ('voice_orb_listening',  'listening',
   'Voice mode orb while the mic is live and Arc is waiting'),
  ('voice_orb_thinking',   'working',
   'Voice mode orb while Arc composes its spoken reply'),
  ('voice_orb_speaking',   'composing',
   'Voice mode orb while Arc is talking back'),

  ('imgfx_enabled',     'true',
   'Enable the img-fx WebGL image generation effect'),
  ('imgfx_preset',      'pixels-organic',
   'img-fx preset: pixels-organic, pixels-mechanic or sweep-gradient'),
  ('imgfx_pixel_scale', '1',
   'img-fx pixel cell size multiplier (0.25 = finest, 4 = chunkiest)')
ON CONFLICT (key) DO NOTHING;

-- Every signed-in user's client reads these to render the indicator. Policies
-- are OR'd, so these only widen SELECT for the two new prefixes and leave every
-- other admin setting admin-only.
DROP POLICY IF EXISTS "Anyone can read voice orb settings" ON public.admin_settings;
CREATE POLICY "Anyone can read voice orb settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key LIKE 'voice\_orb\_%');

DROP POLICY IF EXISTS "Anyone can read imgfx settings" ON public.admin_settings;
CREATE POLICY "Anyone can read imgfx settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key LIKE 'imgfx\_%');
