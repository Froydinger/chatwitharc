ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_is_public ON public.chat_sessions (is_public) WHERE is_public = true;

-- Allow anon (and authenticated) to read sessions that the owner has explicitly made public
GRANT SELECT ON public.chat_sessions TO anon;

DROP POLICY IF EXISTS "Public chat sessions are viewable by anyone" ON public.chat_sessions;
CREATE POLICY "Public chat sessions are viewable by anyone"
  ON public.chat_sessions
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);