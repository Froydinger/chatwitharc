-- Migration: browser_test_runs
-- Tracks Playwright "watch the bot work" runs executed inside an existing Git-mode
-- cloud sandbox. Frames themselves are NOT stored here: they live in the sandbox
-- filesystem for its 20-minute window and are read back through browser-test-status.
-- This table only maps a run to the sandbox that owns it.

CREATE TABLE IF NOT EXISTS public.browser_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_id text NOT NULL,
  repo text,
  target_url text,
  device text NOT NULL DEFAULT 'desktop', -- 'desktop' | 'mobile' | 'both'
  goal text,
  step_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running', -- 'preparing' | 'running' | 'passed' | 'failed' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes')
);

CREATE INDEX IF NOT EXISTS browser_test_runs_run_id_idx ON public.browser_test_runs(run_id);
CREATE INDEX IF NOT EXISTS browser_test_runs_user_idx ON public.browser_test_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS browser_test_runs_expires_idx ON public.browser_test_runs(expires_at);

ALTER TABLE public.browser_test_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'browser_test_runs' AND policyname = 'Users can view their own browser test runs'
  ) THEN
    CREATE POLICY "Users can view their own browser test runs"
      ON public.browser_test_runs FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON public.browser_test_runs TO service_role;
GRANT SELECT ON public.browser_test_runs TO authenticated;
