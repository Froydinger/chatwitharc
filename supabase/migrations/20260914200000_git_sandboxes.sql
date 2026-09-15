-- Migration: git_sandboxes
-- Tracks active cloud sandbox sessions for Git mode (20-minute persistence, max 20 concurrency limit)

CREATE TABLE IF NOT EXISTS public.git_sandboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_id text NOT NULL,
  repo text NOT NULL,
  branch text NOT NULL DEFAULT 'main',
  preview_url text,
  preview_port integer,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'idle' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes')
);

CREATE INDEX IF NOT EXISTS git_sandboxes_user_repo_idx ON public.git_sandboxes(user_id, repo, branch, status);
CREATE INDEX IF NOT EXISTS git_sandboxes_status_expires_idx ON public.git_sandboxes(status, expires_at);
CREATE INDEX IF NOT EXISTS git_sandboxes_last_active_idx ON public.git_sandboxes(last_active_at);

ALTER TABLE public.git_sandboxes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own sandbox sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'git_sandboxes' AND policyname = 'Users can view their own sandboxes'
  ) THEN
    CREATE POLICY "Users can view their own sandboxes"
      ON public.git_sandboxes FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'git_sandboxes' AND policyname = 'Users can update their own sandboxes'
  ) THEN
    CREATE POLICY "Users can update their own sandboxes"
      ON public.git_sandboxes FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON public.git_sandboxes TO service_role;
GRANT SELECT, UPDATE ON public.git_sandboxes TO authenticated;
