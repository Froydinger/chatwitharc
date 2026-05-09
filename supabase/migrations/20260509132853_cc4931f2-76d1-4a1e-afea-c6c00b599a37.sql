CREATE TABLE IF NOT EXISTS public.voice_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  event_type text NOT NULL,
  message text,
  tool_name text,
  tool_call_id text,
  connection_state text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice diagnostics"
ON public.voice_diagnostics
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own voice diagnostics"
ON public.voice_diagnostics
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice diagnostics"
ON public.voice_diagnostics
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_voice_diagnostics_user_created
ON public.voice_diagnostics (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_diagnostics_event_type_created
ON public.voice_diagnostics (event_type, created_at DESC);