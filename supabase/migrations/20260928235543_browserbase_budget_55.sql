-- Owner-approved shared budget increase; all reservation/concurrency guards remain.
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
  v_budget_minutes constant integer := 55;
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

