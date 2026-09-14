-- Git integration starts as a server-enforced beta. Keep the rollout switch in
-- admin_settings so it can move from allowlist -> all without shipping code.
INSERT INTO public.admin_settings (key, value, description)
VALUES
  ('git_rollout_mode', 'allowlist', 'Git integration rollout: off, allowlist, or all.'),
  ('git_rollout_emails', 'jakefroydinger@gmail.com,jakefreudinger@gmail.com', 'Comma-separated normalized emails allowed during the Git beta.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.git_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'github',
  provider_user_id bigint,
  provider_login text,
  access_token_ciphertext text NOT NULL,
  scopes text,
  selected_repo text,
  selected_branch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX git_connections_user_idx ON public.git_connections(user_id);

CREATE TABLE public.git_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_path text NOT NULL DEFAULT '/dashboard',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX git_oauth_states_expiry_idx ON public.git_oauth_states(expires_at);

ALTER TABLE public.git_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.git_oauth_states ENABLE ROW LEVEL SECURITY;

-- Tokens and OAuth state are Edge Function-only. No browser role receives
-- access, even though the tables live in the exposed public schema.
REVOKE ALL ON public.git_connections, public.git_oauth_states FROM public, anon, authenticated;
GRANT ALL ON public.git_connections, public.git_oauth_states TO service_role;

CREATE TRIGGER update_git_connections_updated_at
BEFORE UPDATE ON public.git_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
