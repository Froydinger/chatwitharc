-- Thinking-indicator orb selection
--
-- Which thinking-orbs animation Arc plays for each thing it can be doing, set
-- by an admin in the "Thinking Orb" section of the admin panel.
--
-- The seeded values reproduce the behaviour that was hard-coded in
-- ThinkingIndicator before this became configurable (searching for the two
-- lookup activities, listening for everything else), so applying this migration
-- changes nothing on its own.

INSERT INTO public.admin_settings (key, value, description) VALUES
  ('thinking_orb_thinking', 'listening',
   'Orb animation while Arc composes a normal chat reply'),
  ('thinking_orb_web',      'searching',
   'Orb animation while Arc searches the web'),
  ('thinking_orb_chats',    'searching',
   'Orb animation while Arc searches the user''s past chats'),
  ('thinking_orb_memory',   'listening',
   'Orb animation while Arc reads or writes long-term memory'),
  ('thinking_orb_image',    'listening',
   'Orb animation while Arc generates or edits an image')
ON CONFLICT (key) DO NOTHING;

-- Every signed-in user's client needs to read these to render the indicator,
-- exactly like the banner keys. Policies are OR'd, so this only widens SELECT
-- for the thinking_orb_* keys and leaves every other admin setting admin-only.
DROP POLICY IF EXISTS "Anyone can read thinking orb settings" ON public.admin_settings;
CREATE POLICY "Anyone can read thinking orb settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (key LIKE 'thinking\_orb\_%');
