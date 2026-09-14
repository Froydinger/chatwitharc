-- Update git rollout mode to 'all' for all users
INSERT INTO public.admin_settings (key, value, description)
VALUES ('git_rollout_mode', 'all', 'Git integration rollout: off, allowlist, or all.')
ON CONFLICT (key) DO UPDATE SET value = 'all';

-- Add repository access control to git_connections
ALTER TABLE public.git_connections
ADD COLUMN IF NOT EXISTS repo_access_mode text NOT NULL DEFAULT 'all',
ADD COLUMN IF NOT EXISTS allowed_repos jsonb NOT NULL DEFAULT '[]'::jsonb;
