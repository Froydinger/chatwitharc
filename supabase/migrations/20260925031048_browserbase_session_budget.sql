-- Browserbase session ownership and an atomic Arc-wide free-tier usage guard.
-- One Browserbase project key is shared by all Arc users, so the 45-minute
-- rolling 31-day cap and concurrency lock are global, not per user.

CREATE TABLE IF NOT EXISTS public.browserbase_quota_lock (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  touched_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.browserbase_quota_lock (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.browserbase_sessions (
  session_handle uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_session_id text UNIQUE,
  target_origin text NOT NULL,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  task_kind text NOT NULL CHECK (task_kind IN ('chat', 'git')),
  device text NOT NULL CHECK (device IN ('desktop', 'mobile')),
  repo text,
  chat_session_id uuid,
  status text NOT NULL CHECK (status IN (
    'provisioning', 'agent_running', 'user_control', 'handed_back',
    'release_requested', 'closed', 'expired', 'failed'
  )),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 60 AND 600),
  reserved_minutes integer NOT NULL CHECK (reserved_minutes BETWEEN 1 AND 10),
  consumed_minutes integer NOT NULL DEFAULT 0 CHECK (consumed_minutes BETWEEN 0 AND reserved_minutes),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  settled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browserbase_sessions_owner_created_idx
  ON public.browserbase_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS browserbase_sessions_quota_idx
  ON public.browserbase_sessions (status, expires_at, created_at);

ALTER TABLE public.browserbase_quota_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browserbase_sessions ENABLE ROW LEVEL SECURITY;

-- All reads/writes go through the authenticated Edge Function. In particular,
-- clients cannot forge usage reservations, provider ids, or ownership changes.
REVOKE ALL ON TABLE public.browserbase_quota_lock FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.browserbase_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.browserbase_quota_lock TO service_role;
GRANT ALL ON TABLE public.browserbase_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_browserbase_session(
  p_session_handle uuid,
  p_user_id uuid,
  p_target_origin text,
  p_allowed_domains text[],
  p_task_kind text,
  p_device text,
  p_repo text,
  p_chat_session_id uuid,
  p_duration_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_budget_minutes constant integer := 45;
  v_max_concurrent constant integer := 3;
  v_reserved integer;
  v_used integer;
  v_active integer;
  v_expires_at timestamptz;
BEGIN
  IF p_session_handle IS NULL OR p_user_id IS NULL OR p_target_origin IS NULL
     OR coalesce(array_length(p_allowed_domains, 1), 0) > 9
     OR p_task_kind NOT IN ('chat', 'git') OR p_device NOT IN ('desktop', 'mobile')
     OR p_duration_seconds NOT BETWEEN 60 AND 600 THEN
    RAISE EXCEPTION 'Invalid Browserbase session reservation';
  END IF;

  v_reserved := ceil(p_duration_seconds::numeric / 60)::integer;

  -- Serialize global quota decisions across users and Edge Function instances.
  UPDATE public.browserbase_quota_lock
     SET touched_at = clock_timestamp()
   WHERE id = true;

  -- Browserbase enforces the timeout. This also reclaims abandoned local rows
  -- and conservatively charges their full reservation before admitting more.
  UPDATE public.browserbase_sessions
     SET status = 'expired',
         consumed_minutes = reserved_minutes,
         settled_at = clock_timestamp(),
         ended_at = expires_at,
         updated_at = clock_timestamp()
   WHERE status IN ('provisioning', 'agent_running', 'user_control', 'handed_back', 'release_requested')
     AND expires_at <= clock_timestamp()
     AND settled_at IS NULL;

  SELECT count(*)::integer
    INTO v_active
    FROM public.browserbase_sessions
   WHERE status IN ('provisioning', 'agent_running', 'user_control', 'handed_back', 'release_requested')
     AND expires_at > clock_timestamp();

  IF v_active >= v_max_concurrent THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'concurrency_limit');
  END IF;

  SELECT coalesce(sum(CASE WHEN settled_at IS NULL THEN reserved_minutes ELSE consumed_minutes END), 0)::integer
    INTO v_used
    FROM public.browserbase_sessions
   WHERE coalesce(ended_at, expires_at, created_at) > clock_timestamp() - interval '31 days';

  IF v_used + v_reserved > v_budget_minutes THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exhausted');
  END IF;

  -- Add a minute around provider startup to the local expiry so cleanup never
  -- reclaims a provider session before its hard Browserbase timeout.
  v_expires_at := clock_timestamp() + make_interval(secs => p_duration_seconds + 60);
  INSERT INTO public.browserbase_sessions (
    session_handle, user_id, target_origin, allowed_domains, task_kind, device, repo,
    chat_session_id, status, duration_seconds, reserved_minutes, expires_at
  ) VALUES (
    p_session_handle, p_user_id, p_target_origin, coalesce(p_allowed_domains, '{}'), p_task_kind, p_device, p_repo,
    p_chat_session_id, 'provisioning', p_duration_seconds, v_reserved, v_expires_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reservedMinutes', v_reserved,
    'expiresAt', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_browserbase_session(
  p_session_handle uuid,
  p_user_id uuid,
  p_status text,
  p_consumed_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_session public.browserbase_sessions%ROWTYPE;
BEGIN
  IF p_status NOT IN ('closed', 'failed') OR p_consumed_minutes < 0 THEN
    RAISE EXCEPTION 'Invalid Browserbase session settlement';
  END IF;

  UPDATE public.browserbase_quota_lock
     SET touched_at = clock_timestamp()
   WHERE id = true;

  SELECT * INTO v_session
    FROM public.browserbase_sessions
   WHERE session_handle = p_session_handle AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_session.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', v_session.status, 'settled', true);
  END IF;

  UPDATE public.browserbase_sessions
     SET status = p_status,
         consumed_minutes = least(v_session.reserved_minutes, p_consumed_minutes),
         ended_at = clock_timestamp(),
         settled_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE session_handle = p_session_handle AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'status', p_status, 'settled', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_browserbase_session_control(
  p_session_handle uuid,
  p_user_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_session public.browserbase_sessions%ROWTYPE;
  v_next text;
BEGIN
  IF p_action NOT IN ('takeover', 'handoff', 'resume') THEN
    RAISE EXCEPTION 'Invalid Browserbase control action';
  END IF;

  SELECT * INTO v_session
    FROM public.browserbase_sessions
   WHERE session_handle = p_session_handle AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_session.settled_at IS NOT NULL OR v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed', 'status', v_session.status);
  END IF;

  v_next := CASE p_action
    WHEN 'takeover' THEN 'user_control'
    WHEN 'handoff' THEN 'handed_back'
    ELSE 'agent_running'
  END;

  IF (p_action = 'takeover' AND v_session.status NOT IN ('agent_running', 'user_control'))
     OR (p_action = 'handoff' AND v_session.status NOT IN ('user_control', 'handed_back'))
     OR (p_action = 'resume' AND v_session.status NOT IN ('handed_back', 'agent_running')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'status', v_session.status);
  END IF;

  UPDATE public.browserbase_sessions
     SET status = v_next, updated_at = clock_timestamp()
   WHERE session_handle = p_session_handle AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'status', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_browserbase_session(uuid, uuid, text, text[], text, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_browserbase_session(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_browserbase_session_control(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_browserbase_session(uuid, uuid, text, text[], text, text, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_browserbase_session(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_browserbase_session_control(uuid, uuid, text) TO service_role;
