BEGIN;
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '20s';
-- Staged rollout; no existing conversation is rewritten or promoted.
CREATE TABLE public.ordinary_chat_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 enabled boolean NOT NULL DEFAULT false,
 allowed_users uuid[] NOT NULL DEFAULT '{}'
);
INSERT INTO public.ordinary_chat_policy DEFAULT VALUES;
ALTER TABLE public.ordinary_chat_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_chat_policy FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ordinary_chat_policy TO service_role;
CREATE TABLE public.ordinary_chat_turns (
 submission_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
 request_hash text NOT NULL,
 user_message jsonb NOT NULL,
 assistant_message jsonb,
 response jsonb,
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 lease_expires_at timestamptz NOT NULL DEFAULT now()+interval '45 seconds',
 invalidated_at timestamptz
);
CREATE INDEX ordinary_chat_turns_session ON public.ordinary_chat_turns(user_id,session_id,created_at);
ALTER TABLE public.ordinary_chat_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_chat_turns FROM PUBLIC,anon,authenticated;
GRANT SELECT (submission_id,user_id,session_id,user_message,assistant_message,status,error,created_at,finished_at,invalidated_at) ON public.ordinary_chat_turns TO authenticated;
GRANT UPDATE (status) ON public.ordinary_chat_turns TO authenticated;
GRANT ALL ON public.ordinary_chat_turns TO service_role;
CREATE POLICY ordinary_chat_owner_read ON public.ordinary_chat_turns FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY ordinary_chat_owner_cancel ON public.ordinary_chat_turns FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid()) AND status='running') WITH CHECK (user_id=(SELECT auth.uid()) AND status='cancelled');
CREATE TABLE public.ordinary_chat_cancellations (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 submission_id uuid NOT NULL, invalidated boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,submission_id)
);
ALTER TABLE public.ordinary_chat_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_chat_cancellations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ordinary_chat_cancellations TO service_role;
CREATE FUNCTION public.cancel_ordinary_chat_turn(p_submission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caller uuid:=auth.uid();
BEGIN
 IF caller IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=caller AND NOT coalesce(is_anonymous,false)) THEN
  RAISE EXCEPTION 'Sign in to stop chat' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(caller::text||p_submission::text,0));
 INSERT INTO public.ordinary_chat_cancellations(user_id,submission_id) VALUES(caller,p_submission) ON CONFLICT DO NOTHING;
 UPDATE public.ordinary_chat_turns SET status='cancelled',finished_at=now() WHERE user_id=caller AND submission_id=p_submission AND status='running';
END $$;
REVOKE ALL ON FUNCTION public.cancel_ordinary_chat_turn(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_ordinary_chat_turn(uuid) TO authenticated;

-- Deleted conversations cannot be recreated by delayed intake or retry.
CREATE TABLE public.ordinary_chat_deleted_sessions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, PRIMARY KEY(user_id,session_id)
);
ALTER TABLE public.ordinary_chat_deleted_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_chat_deleted_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ordinary_chat_deleted_sessions TO service_role;
CREATE FUNCTION public.fence_deleted_ordinary_chat_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.user_id IS NULL THEN RETURN OLD; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.user_id::text||OLD.id::text,1));
 INSERT INTO public.ordinary_chat_deleted_sessions VALUES(OLD.user_id,OLD.id) ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.fence_deleted_ordinary_chat_session() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ordinary_chat_session_delete BEFORE DELETE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION public.fence_deleted_ordinary_chat_session();
-- An expired worker cannot publish a late answer even before recovery observes it.
CREATE FUNCTION public.fence_expired_ordinary_chat_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status='running' AND OLD.lease_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Chat execution lease expired';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fence_expired_ordinary_chat_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ordinary_chat_completion_lease BEFORE UPDATE ON public.ordinary_chat_turns FOR EACH ROW EXECUTE FUNCTION public.fence_expired_ordinary_chat_completion();
CREATE FUNCTION public.renew_ordinary_chat_lease(p_user uuid,p_submission uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE renewed integer;
BEGIN
 UPDATE public.ordinary_chat_turns SET status='failed',error='Chat interrupted. No automatic retry was performed.',finished_at=clock_timestamp()
 WHERE user_id=p_user AND submission_id=p_submission AND status='running' AND lease_expires_at<=clock_timestamp();
 UPDATE public.ordinary_chat_turns SET lease_expires_at=clock_timestamp()+interval '45 seconds'
 WHERE user_id=p_user AND submission_id=p_submission AND status='running' AND lease_expires_at>clock_timestamp();
 GET DIAGNOSTICS renewed=ROW_COUNT; RETURN renewed=1;
END $$;
REVOKE ALL ON FUNCTION public.renew_ordinary_chat_lease(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renew_ordinary_chat_lease(uuid,uuid) TO service_role;
CREATE FUNCTION public.expire_ordinary_chat_turns(p_session uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.ordinary_chat_turns SET status='failed',error='Chat interrupted. No automatic retry was performed.',finished_at=clock_timestamp()
 WHERE user_id=auth.uid() AND session_id=p_session AND status='running' AND lease_expires_at<=clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.expire_ordinary_chat_turns(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expire_ordinary_chat_turns(uuid) TO authenticated;
-- Edit tombstones also cover a request that has not reached acceptance yet.
CREATE FUNCTION public.invalidate_ordinary_chat_turns(p_session uuid,p_submissions uuid[],p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caller uuid:=auth.uid(); submission uuid;
BEGIN
 IF caller IS NULL OR caller IS DISTINCT FROM p_owner OR cardinality(p_submissions)>500 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=caller AND NOT coalesce(is_anonymous,false)) THEN
  RAISE EXCEPTION 'Invalid chat invalidation' USING ERRCODE='42501';
 END IF;
 FOR submission IN SELECT DISTINCT unnest(p_submissions) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(caller::text||submission::text,0));
  INSERT INTO public.ordinary_chat_cancellations(user_id,submission_id,invalidated) VALUES(caller,submission,true) ON CONFLICT(user_id,submission_id) DO UPDATE SET invalidated=true;
  UPDATE public.ordinary_chat_turns SET status='cancelled',invalidated_at=clock_timestamp(),assistant_message=NULL,response=NULL,finished_at=clock_timestamp()
  WHERE user_id=caller AND session_id=p_session AND submission_id=submission;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_ordinary_chat_turns(uuid,uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invalidate_ordinary_chat_turns(uuid,uuid[],uuid) TO authenticated;

CREATE FUNCTION public.accept_ordinary_chat_turn(p_user uuid,p_session uuid,p_submission uuid,p_hash text,p_message jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE policy public.ordinary_chat_policy; turn public.ordinary_chat_turns; owner uuid; inserted integer;
BEGIN
 SELECT * INTO policy FROM public.ordinary_chat_policy WHERE id;
 IF NOT policy.enabled AND NOT p_user=ANY(policy.allowed_users) THEN RETURN jsonb_build_object('enabled',false); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_session::text,1));
 IF EXISTS(SELECT 1 FROM public.ordinary_chat_deleted_sessions WHERE user_id=p_user AND session_id=p_session) THEN RAISE EXCEPTION 'Conversation deleted' USING ERRCODE='23505'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_submission::text,0));
 IF p_message->>'role' IS DISTINCT FROM 'user' OR jsonb_typeof(p_message->'content') IS DISTINCT FROM 'string'
   OR length(p_message->>'content')>400000 OR (p_message->>'id') IS NULL THEN RAISE EXCEPTION 'Invalid chat message' USING ERRCODE='22023'; END IF;
 -- Create only a missing owned session. Conflicting ownership always rejects.
 INSERT INTO public.chat_sessions(id,user_id,title,messages) VALUES(p_session,p_user,'New Chat','[]') ON CONFLICT(id) DO NOTHING;
 SELECT user_id INTO owner FROM public.chat_sessions WHERE id=p_session FOR KEY SHARE;
 IF owner IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Session ownership mismatch' USING ERRCODE='42501'; END IF;
 INSERT INTO public.ordinary_chat_turns(submission_id,user_id,session_id,request_hash,user_message,status,invalidated_at)
 VALUES(p_submission,p_user,p_session,p_hash,p_message,CASE WHEN EXISTS(SELECT 1 FROM public.ordinary_chat_cancellations WHERE user_id=p_user AND submission_id=p_submission) THEN 'cancelled' ELSE 'running' END, CASE WHEN EXISTS(SELECT 1 FROM public.ordinary_chat_cancellations WHERE user_id=p_user AND submission_id=p_submission AND invalidated) THEN clock_timestamp() ELSE NULL END) ON CONFLICT(submission_id) DO NOTHING;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 SELECT * INTO turn FROM public.ordinary_chat_turns WHERE submission_id=p_submission FOR UPDATE;
 IF turn.user_id IS DISTINCT FROM p_user OR turn.session_id IS DISTINCT FROM p_session OR turn.request_hash IS DISTINCT FROM p_hash THEN
   RAISE EXCEPTION 'Submission conflict' USING ERRCODE='23505';
 END IF;
 IF turn.status='running' AND turn.lease_expires_at<=clock_timestamp() THEN
  UPDATE public.ordinary_chat_turns SET status='failed',error='Chat interrupted. No automatic retry was performed.',finished_at=clock_timestamp() WHERE submission_id=p_submission RETURNING * INTO turn;
 END IF;
 RETURN jsonb_build_object('enabled',true,'created',inserted=1,'status',turn.status,'response',turn.response);
END $$;
REVOKE ALL ON FUNCTION public.accept_ordinary_chat_turn(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ordinary_chat_turn(uuid,uuid,uuid,text,jsonb) TO service_role;
-- Return only the caller's rollout bit; never expose the private allowlist.
CREATE FUNCTION public.get_ordinary_chat_access() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.ordinary_chat_policy p WHERE p.id AND (p.enabled OR auth.uid()=ANY(p.allowed_users)))
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND NOT coalesce(u.is_anonymous,false));
$$;
REVOKE ALL ON FUNCTION public.get_ordinary_chat_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ordinary_chat_access() TO authenticated;
COMMIT;
