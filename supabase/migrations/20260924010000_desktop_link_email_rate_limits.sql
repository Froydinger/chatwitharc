-- Store only a keyed one-way hash of the requested address, not the address
-- itself. The public form can request one link per address every 10 minutes,
-- with a global ceiling of 100 requests per UTC-hour bucket.
CREATE TABLE IF NOT EXISTS public.desktop_link_email_rate_limits (
  recipient_hash TEXT PRIMARY KEY
    CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  last_requested_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.desktop_link_email_hourly_limit (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  hour_bucket TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0)
);

ALTER TABLE public.desktop_link_email_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desktop_link_email_hourly_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.desktop_link_email_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.desktop_link_email_hourly_limit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.desktop_link_email_rate_limits TO service_role;
GRANT ALL ON TABLE public.desktop_link_email_hourly_limit TO service_role;

CREATE OR REPLACE FUNCTION public.consume_desktop_link_email_request(p_recipient_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_hour_bucket TIMESTAMPTZ := date_trunc('hour', now());
  v_last_requested_at TIMESTAMPTZ;
  v_stored_bucket TIMESTAMPTZ;
  v_request_count INTEGER;
BEGIN
  IF p_recipient_hash IS NULL OR p_recipient_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN FALSE;
  END IF;

  -- Serialize the tiny rate-limit transaction to make the per-address and
  -- hourly caps correct under concurrent requests.
  PERFORM pg_advisory_xact_lock(734219);

  SELECT last_requested_at
    INTO v_last_requested_at
    FROM public.desktop_link_email_rate_limits
    WHERE recipient_hash = p_recipient_hash
    FOR UPDATE;

  IF FOUND AND v_last_requested_at > v_now - INTERVAL '10 minutes' THEN
    RETURN FALSE;
  END IF;

  SELECT hour_bucket, request_count
    INTO v_stored_bucket, v_request_count
    FROM public.desktop_link_email_hourly_limit
    WHERE singleton = TRUE
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.desktop_link_email_hourly_limit(singleton, hour_bucket, request_count)
    VALUES (TRUE, v_hour_bucket, 1);
  ELSIF v_stored_bucket <> v_hour_bucket THEN
    UPDATE public.desktop_link_email_hourly_limit
      SET hour_bucket = v_hour_bucket, request_count = 1
      WHERE singleton = TRUE;
  ELSIF v_request_count >= 100 THEN
    RETURN FALSE;
  ELSE
    UPDATE public.desktop_link_email_hourly_limit
      SET request_count = request_count + 1
      WHERE singleton = TRUE;
  END IF;

  INSERT INTO public.desktop_link_email_rate_limits(recipient_hash, last_requested_at)
  VALUES (p_recipient_hash, v_now)
  ON CONFLICT (recipient_hash) DO UPDATE
    SET last_requested_at = EXCLUDED.last_requested_at;

  DELETE FROM public.desktop_link_email_rate_limits
    WHERE last_requested_at < v_now - INTERVAL '30 days';

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_desktop_link_email_request(p_recipient_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient_hash IS NULL OR p_recipient_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(734219);
  DELETE FROM public.desktop_link_email_rate_limits
    WHERE recipient_hash = p_recipient_hash
      AND last_requested_at > now() - INTERVAL '2 minutes';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_desktop_link_email_request(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_desktop_link_email_request(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_desktop_link_email_request(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_desktop_link_email_request(TEXT) TO service_role;
