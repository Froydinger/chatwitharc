-- Version 2: monthly image balances. Legacy rows remain for in-flight settlement.
CREATE TABLE public.arc_image_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), free_limit integer NOT NULL DEFAULT 30 CHECK(free_limit BETWEEN 1 AND 10000),
 boost_limit integer NOT NULL DEFAULT 250 CHECK(boost_limit BETWEEN 1 AND 100000),
 free_refill_enabled boolean NOT NULL DEFAULT true, boost_refill_enabled boolean NOT NULL DEFAULT true,
 builder_daily_limit integer NOT NULL DEFAULT 50 CHECK(builder_daily_limit BETWEEN 1 AND 1000),
 builder_run_limit integer NOT NULL DEFAULT 10 CHECK(builder_run_limit BETWEEN 1 AND 100),
 builder_pro_daily_limit integer NOT NULL DEFAULT 5 CHECK(builder_pro_daily_limit BETWEEN 0 AND 100),
 builder_pro_run_limit integer NOT NULL DEFAULT 3 CHECK(builder_pro_run_limit BETWEEN 0 AND 20)
);
INSERT INTO public.arc_image_policy(id) VALUES(true);
CREATE TABLE public.arc_image_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 tier text NOT NULL CHECK(tier IN ('free','boost')), kind text NOT NULL CHECK(kind IN ('bonus','refill','unlimited')),
 amount integer NOT NULL DEFAULT 0 CHECK(amount BETWEEN 0 AND 100000), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','revoked')), created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at), CHECK(kind<>'bonus' OR amount>0)
);
CREATE TABLE public.arc_image_balances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 period date NOT NULL, kind text NOT NULL CHECK(kind IN ('base','bonus')), offer_id uuid REFERENCES public.arc_image_offers(id),
 capacity integer NOT NULL CHECK(capacity>=0), remaining integer NOT NULL CHECK(remaining>=0 AND remaining<=capacity),
 generation integer NOT NULL DEFAULT 0, consumed integer NOT NULL DEFAULT 0 CHECK(consumed>=0), expires_at timestamptz NOT NULL, UNIQUE(user_id,offer_id)
);
CREATE UNIQUE INDEX arc_image_base_period ON public.arc_image_balances(user_id,period) WHERE kind='base';
CREATE TABLE public.arc_image_refill_claims (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, period date NOT NULL,
 claim_key text NOT NULL, offer_id uuid REFERENCES public.arc_image_offers(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,claim_key), UNIQUE(user_id,period,offer_id)
);
CREATE UNIQUE INDEX arc_image_base_refill_once ON public.arc_image_refill_claims(user_id,period) WHERE offer_id IS NULL;
CREATE TABLE public.arc_image_reservations_v2 (
 job_id uuid PRIMARY KEY REFERENCES public.image_generation_jobs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, period date NOT NULL,
 unit_cost integer NOT NULL, requested_count integer NOT NULL CHECK(requested_count BETWEEN 1 AND 3),
 allocations jsonb NOT NULL DEFAULT '[]', configuration jsonb NOT NULL, quota jsonb NOT NULL,
 scope text NOT NULL CHECK(scope IN ('standard','builder')), run_id uuid REFERENCES public.cloud_runs(id),
 created_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz, successful_count integer
);
CREATE TABLE public.arc_image_admin_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid NOT NULL REFERENCES auth.users(id), key text NOT NULL,
 action text NOT NULL, payload jsonb NOT NULL, recipients uuid[] NOT NULL DEFAULT '{}', preview jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz, UNIQUE(actor,key)
);
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_request_key uuid;
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_request_hash text;
CREATE UNIQUE INDEX arc_image_request_once ON public.image_generation_jobs(user_id,image_request_key);
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_quality text;
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_size text;
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_run_id uuid REFERENCES public.cloud_runs(id);
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS image_builder_context boolean NOT NULL DEFAULT false;
DO $$DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['arc_image_policy','arc_image_offers','arc_image_balances','arc_image_refill_claims','arc_image_reservations_v2','arc_image_admin_actions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;

CREATE FUNCTION public.arc_image_tier(u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM admin_users WHERE user_id=u) THEN 'admin'
 WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id=u AND price_id IN ('arcai_boost_monthly','arcai_boost_annual') AND
 (status IN ('active','trialing','past_due') OR (status='canceled' AND current_period_end>now())))
 OR EXISTS(SELECT 1 FROM google_play_subscriptions WHERE user_id=u AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') AND expiry_time>now())
 THEN 'boost' ELSE 'free' END
$$;
CREATE FUNCTION public.arc_image_weight(model text, quality text, size text) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF model='gemini-3.1-flash-lite-image' AND size='1K' THEN RETURN 3; END IF;
 IF model='gemini-3.1-flash-image' AND size='1K' THEN RETURN 5; END IF;
 IF model='gpt-image-2.5-flare' AND quality IN ('low','medium') AND size IN ('1024x1024','1536x1024','1024x1536','1536x864','auto') THEN
 RETURN CASE WHEN size='1024x1024' OR quality='low' THEN 1 ELSE 2 END; END IF;
 IF model='gpt-image-2.5-sunburst' AND quality='high' AND size IN ('1024x1024','1536x1024','1024x1536','1536x864','auto') THEN
 RETURN CASE WHEN size='1024x1024' THEN 4 ELSE 6 END; END IF;
 RAISE EXCEPTION 'Unsupported image configuration';
END $$;
-- All mutable balance operations share this lock, including administrative changes.
CREATE FUNCTION public.arc_image_prepare(u uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<arc_image_prepare>>
DECLARE tier text:=arc_image_tier(u); p date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date; lim integer; o record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,740));
 SELECT CASE WHEN tier='free' THEN free_limit ELSE boost_limit END INTO lim FROM arc_image_policy WHERE id;
 INSERT INTO arc_image_balances(user_id,period,kind,capacity,remaining,expires_at)
 VALUES(u,p,'base',lim,lim,(p+interval '1 month') AT TIME ZONE 'UTC') ON CONFLICT DO NOTHING;
 -- Preserve consumption through plan changes; never grant a fresh bucket for changing tier.
 UPDATE arc_image_balances SET remaining=greatest(0,lim-consumed),capacity=lim
 WHERE user_id=u AND period=p AND kind='base' AND capacity<>lim;
 FOR o IN SELECT offer.* FROM arc_image_offers offer WHERE offer.kind='bonus' AND offer.tier=arc_image_prepare.tier AND status='active' AND starts_at<=now() AND ends_at>now() LOOP
 INSERT INTO arc_image_balances(user_id,period,kind,offer_id,capacity,remaining,expires_at)
 VALUES(u,p,'bonus',o.id,o.amount,o.amount,o.ends_at) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
CREATE FUNCTION public.arc_image_snapshot(u uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<arc_image_snapshot>>
DECLARE tier text:=arc_image_tier(u); p date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date; b record; bonus integer; unlimited boolean; enabled boolean; refill boolean;
BEGIN
 PERFORM arc_image_prepare(u);
 SELECT * INTO b FROM arc_image_balances WHERE user_id=u AND period=p AND kind='base';
 SELECT coalesce(sum(x.remaining),0) INTO bonus FROM arc_image_balances x JOIN arc_image_offers o ON o.id=x.offer_id
 WHERE x.user_id=u AND x.kind='bonus' AND x.expires_at>now() AND o.status='active' AND o.starts_at<=now() AND o.tier=arc_image_snapshot.tier;
 unlimited:=tier='admin' OR EXISTS(SELECT 1 FROM arc_image_offers o WHERE o.tier=arc_image_snapshot.tier AND kind='unlimited' AND status='active' AND starts_at<=now() AND ends_at>now());
 SELECT CASE WHEN tier='free' THEN free_refill_enabled ELSE boost_refill_enabled END INTO enabled FROM arc_image_policy WHERE id;
 refill:=tier<>'admin' AND enabled AND NOT EXISTS(SELECT 1 FROM arc_image_refill_claims WHERE user_id=u AND period=p AND offer_id IS NULL);
 RETURN jsonb_build_object('tier',tier,'isAdmin',tier='admin','isBoost',tier='boost','unlimited',unlimited,
 'used',b.capacity-b.remaining,'baseRemaining',b.remaining,'bonusRemaining',bonus,
 'remaining',CASE WHEN unlimited THEN NULL ELSE b.remaining+bonus END,'limit',CASE WHEN unlimited THEN NULL ELSE b.capacity END,
 'usage_percent',CASE WHEN unlimited THEN 0 ELSE round((b.capacity-b.remaining)*100.0/b.capacity) END,
 'resetAt',(p+interval '1 month') AT TIME ZONE 'UTC','refillEnabled',tier<>'admin' AND enabled,'canRefill',refill,
 'refillOffers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'endsAt',o.ends_at)),'[]') FROM arc_image_offers o
 WHERE o.tier=arc_image_snapshot.tier AND kind='refill' AND status='active' AND starts_at<=now() AND ends_at>now()
 AND NOT EXISTS(SELECT 1 FROM arc_image_refill_claims c WHERE c.user_id=u AND c.offer_id=o.id)));
END $$;
CREATE OR REPLACE FUNCTION public.get_my_arc_image_credits() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND NOT coalesce(is_anonymous,false)) THEN RAISE EXCEPTION 'Registered account required'; END IF; RETURN arc_image_snapshot(auth.uid()); END $$;
CREATE FUNCTION public.claim_arc_image_refill(claim_key text, campaign_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<claim_arc_image_refill>>
DECLARE u uuid:=auth.uid(); p date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date; tier text; enabled boolean;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND NOT coalesce(is_anonymous,false)) OR claim_key IS NULL OR length(claim_key) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Invalid refill claim'; END IF;
 PERFORM arc_image_prepare(u); tier:=arc_image_tier(u);
 IF EXISTS(SELECT 1 FROM arc_image_refill_claims c WHERE c.user_id=u AND c.claim_key=$1) THEN RETURN arc_image_snapshot(u); END IF;
 IF tier='admin' THEN RAISE EXCEPTION 'Already unlimited'; END IF;
 IF campaign_id IS NULL THEN
 SELECT CASE WHEN tier='free' THEN free_refill_enabled ELSE boost_refill_enabled END INTO enabled FROM arc_image_policy WHERE id FOR SHARE;
 IF NOT enabled OR EXISTS(SELECT 1 FROM arc_image_refill_claims WHERE user_id=u AND period=p AND offer_id IS NULL) THEN RAISE EXCEPTION 'Monthly refill unavailable'; END IF;
 ELSE
 PERFORM 1 FROM arc_image_offers WHERE id=campaign_id AND kind='refill' AND arc_image_offers.tier=claim_arc_image_refill.tier
 AND status='active' AND starts_at<=now() AND ends_at>now() FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM arc_image_refill_claims WHERE user_id=u AND offer_id=campaign_id) THEN RAISE EXCEPTION 'Offer unavailable'; END IF;
 END IF;
 INSERT INTO arc_image_refill_claims(user_id,period,claim_key,offer_id) VALUES(u,p,claim_key,campaign_id);
 -- Generation fences pending refunds: an old failed job must not refill the replacement bucket.
 UPDATE arc_image_balances SET remaining=capacity,consumed=0,generation=generation+1 WHERE user_id=u AND period=p AND kind='base';
 RETURN arc_image_snapshot(u);
END $$;

CREATE FUNCTION public.arc_builder_better_images(request jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce((SELECT m->>'content' FROM jsonb_array_elements(coalesce(request->'messages','[]')) WITH ORDINALITY t(m,n)
 WHERE m->>'role'='user' ORDER BY n DESC LIMIT 1),request->>'prompt','') ~* '(better|higher quality|premium|pro) (images?|pictures?|assets?)|sunburst'
$$;
REVOKE ALL ON FUNCTION public.arc_builder_better_images(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arc_builder_better_images(jsonb) TO service_role;

-- Rename v1 finalizer for old jobs; v2 delegates when no v2 reservation exists.
ALTER FUNCTION public.finalize_arc_image_credits(uuid,integer) RENAME TO finalize_arc_image_credits_v1;
CREATE OR REPLACE FUNCTION public.reserve_arc_image_credits(target_user_id uuid,target_job_id uuid,requested_count integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<reserve_arc_image_credits>>
DECLARE j public.image_generation_jobs%ROWTYPE; r public.arc_image_reservations_v2%ROWTYPE; tier text; p date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date;
 cost integer; charge integer; outstanding integer; take integer; alloc jsonb:='[]'; b record; snapshot jsonb; builder boolean:=false; run public.cloud_runs%ROWTYPE; cfg record;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' OR requested_count IS NULL OR requested_count NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Not authorized or invalid count'; END IF;
 -- Lock user before job everywhere to avoid a lock-order inversion with settlement/admin.
 PERFORM arc_image_prepare(target_user_id);
 SELECT * INTO j FROM image_generation_jobs WHERE id=target_job_id AND user_id=target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid image job'; END IF;
 SELECT * INTO r FROM arc_image_reservations_v2 WHERE job_id=target_job_id;
 IF FOUND THEN
 IF r.requested_count<>requested_count OR r.configuration<>jsonb_build_object('model',j.preferred_model,'quality',j.image_quality,'size',j.image_size) THEN RAISE EXCEPTION 'Reservation conflict'; END IF;
 RETURN r.quota; END IF;
 tier:=arc_image_tier(target_user_id); snapshot:=arc_image_snapshot(target_user_id);
 IF j.image_size IS DISTINCT FROM (CASE WHEN j.preferred_model LIKE 'gemini-%' THEN '1K'
 WHEN j.aspect_ratio='1:1' THEN '1024x1024' WHEN j.job_type='edit' THEN 'auto'
 WHEN j.aspect_ratio='16:9' THEN '1536x864' WHEN j.aspect_ratio IN ('2:3','3:4','9:16') THEN '1024x1536' ELSE '1536x1024' END) THEN RAISE EXCEPTION 'Image size mismatch'; END IF;
 cost:=arc_image_weight(j.preferred_model,j.image_quality,j.image_size);
 IF j.image_builder_context THEN
 SELECT * INTO run FROM cloud_runs WHERE id=j.image_run_id AND user_id=target_user_id AND kind='app' AND status='running' AND lease_expires_at>clock_timestamp();
 builder:=FOUND AND EXISTS(SELECT 1 FROM ide_projects WHERE id=(run.request->>'projectId')::uuid AND user_id=target_user_id) AND user_has_boost(target_user_id);
 IF NOT builder THEN RAISE EXCEPTION 'Builder context unavailable'; END IF;
 IF NOT ((j.preferred_model='gpt-image-2.5-flare' AND j.image_quality='low') OR
 (j.preferred_model='gpt-image-2.5-sunburst' AND j.image_quality='high' AND public.arc_builder_better_images(run.request))) THEN RAISE EXCEPTION 'Builder image configuration denied'; END IF;
 SELECT * INTO cfg FROM arc_image_policy WHERE id;
 IF tier<>'admin' AND (
 (SELECT coalesce(sum(arc_image_reservations_v2.requested_count),0) FROM arc_image_reservations_v2 WHERE user_id=target_user_id AND scope='builder' AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+requested_count > cfg.builder_daily_limit OR
 (SELECT coalesce(sum(arc_image_reservations_v2.requested_count),0) FROM arc_image_reservations_v2 WHERE run_id=j.image_run_id AND scope='builder')+requested_count > cfg.builder_run_limit OR
 (j.preferred_model='gpt-image-2.5-sunburst' AND (
 (SELECT coalesce(sum(arc_image_reservations_v2.requested_count),0) FROM arc_image_reservations_v2 WHERE user_id=target_user_id AND scope='builder' AND configuration->>'model'=j.preferred_model AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+requested_count > cfg.builder_pro_daily_limit OR
 (SELECT coalesce(sum(arc_image_reservations_v2.requested_count),0) FROM arc_image_reservations_v2 WHERE run_id=j.image_run_id AND scope='builder' AND configuration->>'model'=j.preferred_model)+requested_count > cfg.builder_pro_run_limit))) THEN
 RETURN jsonb_build_object('allowed',false,'error','Builder image safety limit reached'); END IF;
 ELSE
 IF tier='free' AND (j.preferred_model<>'gpt-image-2.5-flare' OR j.image_quality<>'low') THEN RETURN jsonb_build_object('allowed',false,'error','Free images use Flare Low. Choose Flare or upgrade to Boost.'); END IF;
 END IF;
 charge:=CASE WHEN builder OR (snapshot->>'unlimited')::boolean THEN 0 ELSE requested_count*cost END;
 IF charge>coalesce((snapshot->>'remaining')::integer,0) THEN RETURN snapshot||jsonb_build_object('allowed',false,'error','Monthly image allowance reached. Check your refill or choose a lower-cost model.'); END IF;
 outstanding:=charge;
 FOR b IN SELECT x.* FROM arc_image_balances x LEFT JOIN arc_image_offers o ON o.id=x.offer_id
 WHERE x.user_id=target_user_id AND x.remaining>0 AND x.expires_at>now() AND
 ((x.kind='base' AND x.period=p) OR (x.kind='bonus' AND o.status='active' AND o.starts_at<=now() AND o.tier=reserve_arc_image_credits.tier))
 ORDER BY x.expires_at,CASE WHEN x.kind='bonus' THEN 0 ELSE 1 END,x.id FOR UPDATE OF x LOOP
 EXIT WHEN outstanding=0; take:=least(b.remaining,outstanding);
 UPDATE arc_image_balances SET remaining=remaining-take,consumed=consumed+take WHERE id=b.id;
 alloc:=alloc||jsonb_build_array(jsonb_build_object('id',b.id,'generation',b.generation,'amount',take)); outstanding:=outstanding-take;
 END LOOP;
 IF outstanding<>0 THEN RAISE EXCEPTION 'Balance changed'; END IF;
 snapshot:=arc_image_snapshot(target_user_id)||jsonb_build_object('allowed',true,'unitCost',cost,'quality',j.image_quality,'size',j.image_size,'scope',CASE WHEN builder THEN 'builder' ELSE 'standard' END);
 INSERT INTO arc_image_reservations_v2(job_id,user_id,period,unit_cost,requested_count,allocations,configuration,quota,scope,run_id)
 VALUES(target_job_id,target_user_id,p,cost,requested_count,alloc,jsonb_build_object('model',j.preferred_model,'quality',j.image_quality,'size',j.image_size),snapshot,CASE WHEN builder THEN 'builder' ELSE 'standard' END,j.image_run_id);
 RETURN snapshot;
END $$;
CREATE FUNCTION public.finalize_arc_image_credits(target_job_id uuid,successful_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<finalize_arc_image_credits>>
DECLARE r public.arc_image_reservations_v2%ROWTYPE; owner uuid; refund integer; a jsonb; take integer;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT user_id INTO owner FROM arc_image_reservations_v2 WHERE job_id=target_job_id;
 IF owner IS NULL THEN PERFORM finalize_arc_image_credits_v1(target_job_id,successful_count); RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,740));
 SELECT * INTO r FROM arc_image_reservations_v2 WHERE job_id=target_job_id FOR UPDATE;
 IF r.finalized_at IS NOT NULL THEN RETURN; END IF;
 IF successful_count IS NULL OR successful_count NOT BETWEEN 0 AND r.requested_count THEN RAISE EXCEPTION 'Invalid successful count'; END IF;
 refund:=r.unit_cost*(r.requested_count-successful_count);
 -- Reverse allocation order: retain earliest-expiring credits for successful outputs.
 FOR a IN SELECT value FROM jsonb_array_elements(r.allocations) WITH ORDINALITY t(value,n) ORDER BY n DESC LOOP
 take:=least(refund,(a->>'amount')::integer);
 UPDATE arc_image_balances SET remaining=greatest(0,capacity-greatest(0,consumed-take)),consumed=greatest(0,consumed-take) WHERE id=(a->>'id')::uuid AND generation=(a->>'generation')::integer;
 refund:=refund-take;
 END LOOP;
 UPDATE arc_image_reservations_v2 SET finalized_at=now(),successful_count=finalize_arc_image_credits.successful_count WHERE job_id=target_job_id;
END $$;
-- Internal functions never callable by browser roles.
REVOKE ALL ON FUNCTION public.arc_image_tier(uuid),public.arc_image_prepare(uuid),public.arc_image_snapshot(uuid),public.arc_image_weight(text,text,text),public.reserve_arc_image_credits(uuid,uuid,integer),public.finalize_arc_image_credits(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arc_image_tier(uuid),public.arc_image_prepare(uuid),public.arc_image_snapshot(uuid),public.arc_image_weight(text,text,text),public.reserve_arc_image_credits(uuid,uuid,integer),public.finalize_arc_image_credits(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_arc_image_credits(),public.claim_arc_image_refill(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_arc_image_credits(),public.claim_arc_image_refill(text,uuid) TO authenticated;

CREATE FUNCTION public.admin_arc_images(action text,payload jsonb DEFAULT '{}',request_key text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<admin_arc_images>>
DECLARE actor uuid:=auth.uid(); record public.arc_image_admin_actions%ROWTYPE; recipients uuid[]; tier text; operation text; amount integer; start_time timestamptz; end_time timestamptz; u uuid; result jsonb; lim integer; page_offset integer:=greatest(0,least(coalesce((payload->>'offset')::integer,0),100000)); p date:=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM admin_users WHERE user_id=actor) THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF action='dashboard' THEN
 RETURN jsonb_build_object('policy',(SELECT to_jsonb(x) FROM arc_image_policy x WHERE id),
 'offers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY created_at DESC),'[]') FROM arc_image_offers x),
 'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY created_at DESC),'[]') FROM (SELECT aa.id,aa.actor,aa.action,aa.payload,aa.preview,aa.created_at,aa.applied_at FROM arc_image_admin_actions aa ORDER BY created_at DESC LIMIT 100) x),
 'pageOffset',page_offset,
 'usage',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
 SELECT r.user_id,arc_image_tier(r.user_id) tier,r.configuration->>'model' model,r.configuration->>'quality' quality,r.scope,
 sum(r.requested_count) reserved_outputs,sum(coalesce(r.successful_count,0)) saved_outputs,
 sum(CASE WHEN r.finalized_at IS NULL THEN r.requested_count ELSE 0 END) pending_outputs,
 sum(CASE WHEN r.finalized_at IS NOT NULL THEN r.requested_count-coalesce(r.successful_count,0) ELSE 0 END) failed_outputs,
 sum(r.unit_cost*r.requested_count) reserved_cost FROM arc_image_reservations_v2 r WHERE r.period=p GROUP BY r.user_id,r.configuration,r.scope ORDER BY r.user_id,r.configuration::text,r.scope LIMIT 200 OFFSET page_offset) x),
 'balances',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT b.*,arc_image_tier(b.user_id) tier FROM arc_image_balances b WHERE b.expires_at>now() ORDER BY user_id,b.id LIMIT 200 OFFSET page_offset) x),
 'claims',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT * FROM arc_image_refill_claims WHERE period=p ORDER BY created_at DESC LIMIT 200 OFFSET page_offset) x));
 END IF;
 IF action='preview' THEN
 IF request_key IS NULL OR length(request_key) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Request key required'; END IF;
 SELECT * INTO record FROM arc_image_admin_actions WHERE arc_image_admin_actions.actor=admin_arc_images.actor AND key=request_key;
 IF FOUND THEN IF record.payload<>payload THEN RAISE EXCEPTION 'Request conflict'; END IF; RETURN to_jsonb(record); END IF;
 operation:=payload->>'operation'; tier:=payload->>'tier';
 IF operation NOT IN ('reset','offer','offer_status','policy') OR operation IS NULL OR length(coalesce(payload->>'reason','')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Operation and reason required'; END IF;
 IF operation IN ('reset','offer') THEN
 IF tier IS NULL OR tier NOT IN ('free','boost') THEN RAISE EXCEPTION 'Choose Free or Boost'; END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO recipients FROM auth.users WHERE NOT coalesce(is_anonymous,false) AND email IS NOT NULL AND arc_image_tier(id)=tier;
 IF cardinality(recipients)>10000 THEN RAISE EXCEPTION 'Cohort too large; use a paginated campaign'; END IF;
 END IF;
 IF operation='offer' THEN
 IF payload->>'kind' IS NULL OR payload->>'kind' NOT IN ('bonus','refill','unlimited') OR length(coalesce(payload->>'title','')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid offer'; END IF;
 amount:=coalesce((payload->>'amount')::integer,0); start_time:=(payload->>'startsAt')::timestamptz; end_time:=(payload->>'endsAt')::timestamptz;
 IF start_time IS NULL OR end_time IS NULL OR end_time<=start_time OR end_time>now()+interval '1 year' OR amount NOT BETWEEN 0 AND 100000 OR (payload->>'kind'='bonus' AND amount=0) THEN RAISE EXCEPTION 'Invalid offer period or amount'; END IF;
 END IF;
 IF operation='offer_status' AND (payload->>'status' IS NULL OR payload->>'status' NOT IN ('active','paused','revoked') OR NOT EXISTS(SELECT 1 FROM arc_image_offers WHERE id=(payload->>'offerId')::uuid)) THEN RAISE EXCEPTION 'Invalid offer status'; END IF;
 IF operation='policy' THEN
 IF (payload-'operation'-'reason') - ARRAY['free_refill_enabled','boost_refill_enabled','builder_daily_limit','builder_run_limit','builder_pro_daily_limit','builder_pro_run_limit'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Unknown policy setting'; END IF;
 END IF;
 SELECT CASE WHEN tier='free' THEN free_limit ELSE boost_limit END INTO lim FROM arc_image_policy WHERE id;
 result:=jsonb_build_object('affectedUsers',coalesce(cardinality(recipients),0),'tier',tier,'operation',operation,
 'audience',CASE WHEN operation='offer' THEN 'Current tier at claim/use; preview count is current membership' ELSE 'Snapshot at preview' END,
 'credits',CASE WHEN operation='reset' THEN coalesce(cardinality(recipients),0)*lim WHEN payload->>'kind'='bonus' THEN coalesce(cardinality(recipients),0)*amount ELSE NULL END,
 'estimatedOutputEnvelopeUSD',CASE WHEN payload->>'kind'='unlimited' THEN NULL ELSE round(coalesce(cardinality(recipients),0)*CASE WHEN operation='reset' OR payload->>'kind'='refill' THEN lim ELSE coalesce(amount,0) END*0.01344,2) END,
 'exposure',CASE WHEN payload->>'kind'='unlimited' THEN 'Uncapped; excludes Builder and provider input costs' ELSE 'Output estimate only; inputs, Builder and larger outputs additional' END,
 'unusedBaseForfeited',CASE WHEN operation='reset' THEN (SELECT coalesce(sum(remaining),0) FROM arc_image_balances WHERE user_id=ANY(recipients) AND period=p AND kind='base') ELSE 0 END);
 INSERT INTO arc_image_admin_actions(actor,key,action,payload,recipients,preview) VALUES(actor,request_key,operation,payload,coalesce(recipients,'{}'),result) RETURNING * INTO record;
 RETURN to_jsonb(record);
 END IF;
 IF action='confirm' THEN
 SELECT * INTO record FROM arc_image_admin_actions WHERE id=($2->>'previewId')::uuid AND arc_image_admin_actions.actor=admin_arc_images.actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preview unavailable'; END IF;
 IF record.applied_at IS NOT NULL THEN RETURN to_jsonb(record); END IF;
 IF record.created_at<now()-interval '10 minutes' THEN RAISE EXCEPTION 'Preview expired; preview again'; END IF;
 IF coalesce((payload->>'confirm')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Explicit confirmation required'; END IF;
 IF record.action='reset' THEN
 FOREACH u IN ARRAY record.recipients LOOP
 PERFORM arc_image_prepare(u);
 IF arc_image_tier(u)=record.payload->>'tier' THEN UPDATE arc_image_balances SET remaining=capacity,consumed=0,generation=generation+1 WHERE user_id=u AND period=p AND kind='base'; END IF;
 END LOOP;
 ELSIF record.action='offer' THEN
 INSERT INTO arc_image_offers(title,tier,kind,amount,starts_at,ends_at,created_by)
 VALUES(record.payload->>'title',record.payload->>'tier',record.payload->>'kind',coalesce((record.payload->>'amount')::integer,0),(record.payload->>'startsAt')::timestamptz,(record.payload->>'endsAt')::timestamptz,actor);
 ELSIF record.action='offer_status' THEN
 UPDATE arc_image_offers SET status=record.payload->>'status' WHERE id=(record.payload->>'offerId')::uuid AND status<>'revoked';
 ELSIF record.action='policy' THEN
 UPDATE arc_image_policy SET free_refill_enabled=coalesce((record.payload->>'free_refill_enabled')::boolean,free_refill_enabled),
 boost_refill_enabled=coalesce((record.payload->>'boost_refill_enabled')::boolean,boost_refill_enabled),
 builder_daily_limit=coalesce((record.payload->>'builder_daily_limit')::integer,builder_daily_limit),
 builder_run_limit=coalesce((record.payload->>'builder_run_limit')::integer,builder_run_limit),
 builder_pro_daily_limit=coalesce((record.payload->>'builder_pro_daily_limit')::integer,builder_pro_daily_limit),
 builder_pro_run_limit=coalesce((record.payload->>'builder_pro_run_limit')::integer,builder_pro_run_limit) WHERE id;
 END IF;
 UPDATE arc_image_admin_actions SET applied_at=now() WHERE id=record.id RETURNING * INTO record;
 RETURN to_jsonb(record);
 END IF;
 RAISE EXCEPTION 'Unknown admin action';
END $$;
REVOKE ALL ON FUNCTION public.admin_arc_images(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_arc_images(text,jsonb,text) TO authenticated;

-- Keep existing receipt fencing; unify new reservations, retain legacy settlement.
create or replace function public.cloud_image_step(
  p_run_id uuid, p_user_id uuid, p_lease_token uuid, p_receipt_key text,
  p_call jsonb, p_action text, p_args jsonb default null,
  p_index integer default 0, p_value text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  m public.cloud_image_receipts%rowtype;
  slot jsonb; q jsonb; jid uuid; n integer; model text; urls text[];
  dispatch boolean := false;
begin
  if p_action not in ('begin','start','accept','finish','fail','cancel_ready') or p_action is null
    or p_index is null or p_index not between 0 and 2 then raise exception 'Invalid image action'; end if;
  if p_action in ('begin','start') then
    select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id;
    if not found then raise exception 'Image run fenced'; end if;
    perform 1 from public.chat_sessions where id=r.session_id and user_id=p_user_id for update;
    if not found then raise exception 'Image session fenced'; end if;
    select * into r from public.cloud_runs where id=p_run_id and user_id=p_user_id for update;
    if r.status <> 'running' or p_lease_token is null or r.lease_token is distinct from p_lease_token
      or r.lease_expires_at <= clock_timestamp() then raise exception 'Image lease fenced'; end if;
    if p_receipt_key is distinct from (p_run_id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id'))
      or p_call->>'name' not in ('generate_image','edit_image')
      or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
      then raise exception 'Image call mismatch'; end if;
    if not public.cloud_image_account_active(p_user_id) then raise exception 'Image account required'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,739));
  select * into m from public.cloud_image_receipts where receipt_key=p_receipt_key for update;
  if found and (m.user_id is distinct from p_user_id or m.run_id is distinct from p_run_id or m.call is distinct from p_call)
    then raise exception 'Image receipt conflict'; end if;
  if m.receipt_key is null then
    if p_action <> 'begin' then raise exception 'Missing image receipt'; end if;
    n := (p_args->>'count')::integer;
    model := p_args->>'model';
    if n is null or n not between 1 and 3 or model is null or model not in ('gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2')
      or p_args->>'kind' not in ('generate','edit') or length(p_args->>'prompt') not between 1 and 12000 then raise exception 'Invalid image arguments'; end if;
    -- Same owner/content cannot silently replace an unresolved paid operation.
    if exists(select 1 from public.cloud_image_receipts x where x.user_id=p_user_id and x.args=p_args and not x.settled)
      then raise exception 'Image recovery required for existing request'; end if;
    insert into public.image_generation_jobs(user_id,job_type,prompt,aspect_ratio,preferred_model,status)
      values(p_user_id,p_args->>'kind',p_args->>'prompt',p_args->>'aspectRatio',model,'processing') returning id into jid;
    update public.image_generation_jobs set image_run_id=p_run_id,
      image_builder_context=(r.kind='app'),
      image_quality=case when model='gpt-image-2.5-sunburst' then 'high' when r.kind='app' then 'low' else 'medium' end,
      image_size=case when p_args->>'aspectRatio'='1:1' then '1024x1024' when p_args->>'kind'='edit' then 'auto'
        when p_args->>'aspectRatio'='16:9' then '1536x864' when p_args->>'aspectRatio' in ('2:3','3:4','9:16') then '1024x1536' else '1536x1024' end where id=jid;
    if r.kind='app' and model='gpt-image-2.5-sunburst' and not public.arc_builder_better_images(r.request) then raise exception 'Builder premium images require explicit request'; end if;
    q := public.reserve_arc_image_credits(p_user_id,jid,n);
    insert into public.cloud_image_receipts(receipt_key,run_id,user_id,call,args,job_id,slots,quota,settled)
      values(p_receipt_key,p_run_id,p_user_id,p_call,p_args,jid,
        (select jsonb_agg(jsonb_build_object('state',case when (q->>'allowed')::boolean then 'ready' else 'failed' end)) from generate_series(1,n)),q,not (q->>'allowed')::boolean)
      returning * into m;
    if m.settled then update public.image_generation_jobs set status='failed',error_type='daily_limit',error_message='Image quota or model entitlement denied' where id=jid; end if;
  end if;
  if p_args is not null and m.args is distinct from p_args then raise exception 'Image argument conflict'; end if;
  if p_action='begin' or m.settled then return to_jsonb(m)||jsonb_build_object('dispatch',false); end if;
  if p_index >= jsonb_array_length(m.slots) then raise exception 'Invalid image slot'; end if;
  slot := m.slots->p_index;
  if p_action='start' and slot->>'state'='ready' then
    if r.lease_expires_at <= clock_timestamp() then raise exception 'Image lease expired'; end if;
    if m.args->>'model' in ('gpt-image-2.5-sunburst','gpt-image-2') and not public.user_has_boost(p_user_id)
      and not exists(select 1 from public.admin_users where user_id=p_user_id) then raise exception 'Image entitlement changed'; end if;
    slot := jsonb_build_object('state','submitting'); dispatch := true;
  elsif p_action='accept' then
    if p_value is null or p_value !~ '^resp_[A-Za-z0-9_-]+$' then raise exception 'Invalid provider response'; end if;
    if slot->>'responseId' is not null and slot->>'responseId' <> p_value then raise exception 'Provider response conflict'; end if;
    if slot->>'state'='submitting' then slot := jsonb_build_object('state','pending','responseId',p_value); end if;
  elsif p_action='finish' then
    if slot->>'state'='pending' then
      if p_value is null or length(p_value)>2048 or p_value !~ '^https://' then raise exception 'Invalid image URL'; end if;
      slot := slot || jsonb_build_object('state','done','url',p_value);
    elsif slot->>'state'='done' and slot->>'url' is distinct from p_value then raise exception 'Image output conflict'; end if;
  elsif p_action='fail' and slot->>'state' in ('ready','submitting','pending') then
    -- Caller only invokes for confirmed provider rejection/terminal failure.
    slot := slot || jsonb_build_object('state','failed');
  elsif p_action='cancel_ready' and slot->>'state'='ready' then
    slot := jsonb_build_object('state','failed');
  end if;
  m.slots := jsonb_set(m.slots,array[p_index::text],slot);
  if not exists(select 1 from jsonb_array_elements(m.slots) s where s->>'state' not in ('done','failed')) then
    select coalesce(array_agg(s->>'url' order by ord),'{}') into urls
      from jsonb_array_elements(m.slots) with ordinality as t(s,ord) where s->>'state'='done';
    if exists(select 1 from public.arc_image_reservations_v2 where job_id=m.job_id) then
      perform public.finalize_arc_image_credits(m.job_id,cardinality(urls));
    else perform public.finalize_image_quota(m.job_id,cardinality(urls)); end if;
    update public.image_generation_jobs set status=case when cardinality(urls)>0 then 'completed' else 'failed' end,
      result_image_url=urls[1],result_image_urls=urls,error_type=case when cardinality(urls)=0 then 'provider_error' else null end
      where id=m.job_id and user_id=p_user_id;
    m.settled := true;
  end if;
  update public.cloud_image_receipts set slots=m.slots,settled=m.settled where receipt_key=p_receipt_key returning * into m;
  return to_jsonb(m)||jsonb_build_object('dispatch',dispatch);
end;
$$;
revoke all on function public.cloud_image_step(uuid,uuid,uuid,text,jsonb,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.cloud_image_step(uuid,uuid,uuid,text,jsonb,text,jsonb,integer,text) to service_role;

-- Staged by default: installing this migration does not activate a finite Boost
-- transition or assert that the provider account can use Lite.
ALTER TABLE public.arc_image_policy
 ADD COLUMN owner_confirmed_transition_grants uuid[] NOT NULL DEFAULT '{}'::uuid[],
 ADD COLUMN transition_mode text NOT NULL DEFAULT 'staged' CHECK(transition_mode IN ('staged','grandfather','immediate')),
 ADD COLUMN transition_captured_at timestamptz,
 ADD COLUMN transition_missing_action text CHECK(transition_missing_action IN ('reject','finite')),
 ADD COLUMN lite_available boolean NOT NULL DEFAULT false,
 ADD COLUMN lite_evidence jsonb,
 ADD COLUMN lite_checked_at timestamptz;
CREATE TABLE public.arc_image_transition_cohort (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 captured_at timestamptz NOT NULL, expires_at timestamptz,
 date_status text NOT NULL CHECK(date_status IN ('valid','missing','expired','grant'))
);
ALTER TABLE public.arc_image_transition_cohort ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arc_image_transition_cohort FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.arc_image_transition_cohort TO service_role;

-- Classification only: these owner-confirmed accounts retain their existing tier
-- records, but do not inherit a fabricated paid-renewal image expiry.
CREATE FUNCTION public.arc_image_transition_is_granted(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT u=ANY(p.owner_confirmed_transition_grants) FROM arc_image_policy p WHERE p.id),false)
 OR EXISTS(SELECT 1 FROM auth.users a JOIN account_entitlement_grants g ON lower(g.email)=lower(a.email)
  WHERE a.id=u AND g.grant_lifetime_boost)
$$;
REVOKE ALL ON FUNCTION public.arc_image_transition_is_granted(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arc_image_transition_is_granted(uuid) TO service_role;

-- Match existing entitlement eligibility; never mutate subscription/billing rows.
CREATE FUNCTION public.arc_image_transition_candidates() RETURNS TABLE(user_id uuid,expires_at timestamptz,date_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.id,CASE WHEN arc_image_transition_is_granted(u.id) OR d.expires_at>='9999-01-01T00:00:00Z'::timestamptz THEN NULL ELSE d.expires_at END,
 CASE WHEN arc_image_transition_is_granted(u.id) THEN 'grant' WHEN d.expires_at IS NULL OR d.expires_at>='9999-01-01T00:00:00Z'::timestamptz THEN 'missing' WHEN d.expires_at<=now() THEN 'expired' ELSE 'valid' END
 FROM auth.users u LEFT JOIN LATERAL (
  SELECT max(e.expiry) expires_at FROM (
   SELECT s.current_period_end expiry FROM subscriptions s WHERE s.user_id=u.id
    AND s.price_id IN ('arcai_boost_monthly','arcai_boost_annual')
    AND (s.status IN ('active','trialing','past_due') OR (s.status='canceled' AND s.current_period_end>now()))
   UNION ALL SELECT g.expiry_time FROM google_play_subscriptions g WHERE g.user_id=u.id
    AND g.subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') AND g.expiry_time>now()
  ) e
 ) d ON true WHERE NOT coalesce(u.is_anonymous,false) AND arc_image_tier(u.id)='boost'
$$;
CREATE FUNCTION public.arc_image_transition_report() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE captured timestamptz; rows jsonb;
BEGIN
 SELECT transition_captured_at INTO captured FROM arc_image_policy WHERE id;
 IF captured IS NULL THEN SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.user_id),'[]') INTO rows FROM arc_image_transition_candidates() c;
 ELSE SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.user_id),'[]') INTO rows FROM arc_image_transition_cohort c; END IF;
 RETURN jsonb_build_object('capturedAt',captured,'counts',jsonb_build_object(
 'valid',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date_status'='valid'),
 'grant',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date_status'='grant'),
 'missing',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date_status'='missing'),
 'expired',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'date_status'='expired')),
 'dateExceptions',(SELECT coalesce(jsonb_agg(r),'[]') FROM (SELECT r FROM jsonb_array_elements(rows) r WHERE r->>'date_status' IN ('missing','expired') LIMIT 200) e),
 'exceptionListLimit',200);
END $$;
CREATE FUNCTION public.arc_image_activate_transition(mode text,missing_date_action text DEFAULT 'reject',confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE policy public.arc_image_policy%ROWTYPE;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' OR confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approved service configuration required'; END IF;
 IF mode IS NULL OR mode NOT IN ('grandfather','immediate') OR missing_date_action IS NULL OR missing_date_action NOT IN ('reject','finite') THEN RAISE EXCEPTION 'Explicit transition and missing-date decision required'; END IF;
 SELECT * INTO policy FROM arc_image_policy WHERE id FOR UPDATE;
 IF policy.transition_captured_at IS NOT NULL THEN
  IF policy.transition_mode<>mode OR policy.transition_missing_action<>missing_date_action THEN RAISE EXCEPTION 'Transition already captured; cannot replace or extend cohort'; END IF;
  RETURN arc_image_transition_report();
 END IF;
 -- The inserted cohort is the activation-time snapshot, not a preview or a webhook.
 INSERT INTO arc_image_transition_cohort SELECT user_id,now(),expires_at,date_status FROM arc_image_transition_candidates();
 IF mode='grandfather' AND missing_date_action='reject' AND EXISTS(SELECT 1 FROM arc_image_transition_cohort WHERE date_status='missing') THEN
  RAISE EXCEPTION 'Missing renewal dates: review transition report and explicitly choose finite treatment before activation';
 END IF;
 UPDATE arc_image_policy SET transition_mode=mode,transition_captured_at=now(),transition_missing_action=missing_date_action WHERE id;
 RETURN arc_image_transition_report();
END $$;
-- Account lookup evidence or an explicit owner-confirmed account assertion; never
-- represent owner-reported access as a successful provider generation.
CREATE FUNCTION public.arc_image_set_lite_readiness(available boolean,evidence jsonb,confirmed boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' OR confirmed IS DISTINCT FROM true OR available IS NULL THEN RAISE EXCEPTION 'Approved service configuration required'; END IF;
 IF available AND (evidence->>'model' IS DISTINCT FROM 'gemini-3.1-flash-lite-image' OR coalesce(evidence->>'method','') NOT IN ('account-model-lookup','owner-reported')
  OR coalesce(evidence->>'reference','')='' OR (evidence->>'checkedAt')::timestamptz IS NULL
  OR (evidence->>'checkedAt')::timestamptz<now()-interval '24 hours' OR (evidence->>'checkedAt')::timestamptz>now()+interval '5 minutes') THEN
  RAISE EXCEPTION 'Recent account lookup or explicit owner-reported Lite evidence required';
 END IF;
 UPDATE arc_image_policy SET lite_available=available,lite_evidence=evidence,lite_checked_at=now() WHERE id;
END $$;

ALTER FUNCTION public.arc_image_snapshot(uuid) RENAME TO arc_image_snapshot_finite;
CREATE FUNCTION public.arc_image_snapshot(u uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; policy public.arc_image_policy%ROWTYPE; expiry timestamptz; inherited boolean;
BEGIN
 snapshot:=arc_image_snapshot_finite(u); SELECT * INTO policy FROM arc_image_policy WHERE id;
 SELECT expires_at INTO expiry FROM arc_image_transition_cohort WHERE user_id=u AND date_status='valid';
 inherited:=snapshot->>'tier'='boost' AND (policy.transition_mode='staged' OR (policy.transition_mode='grandfather' AND expiry>now()));
 snapshot:=snapshot||jsonb_build_object('liteAvailable',policy.lite_available,'transitionMode',policy.transition_mode,
 'grandfatheredUntil',CASE WHEN inherited AND policy.transition_mode='grandfather' THEN expiry ELSE NULL END,
 'unlimitedReason',CASE WHEN snapshot->>'tier'='admin' THEN 'admin' WHEN inherited THEN policy.transition_mode WHEN (snapshot->>'unlimited')::boolean THEN 'offer' ELSE NULL END);
 IF inherited THEN RETURN snapshot||jsonb_build_object('unlimited',true,'remaining',NULL,'limit',NULL,'usage_percent',0,'refillEnabled',false,'canRefill',false,'refillOffers','[]'::jsonb); END IF;
 RETURN snapshot;
END $$;
ALTER FUNCTION public.reserve_arc_image_credits(uuid,uuid,integer) RENAME TO reserve_arc_image_credits_finite;
CREATE FUNCTION public.reserve_arc_image_credits(target_user_id uuid,target_job_id uuid,requested_count integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF EXISTS(SELECT 1 FROM image_generation_jobs WHERE id=target_job_id AND user_id=target_user_id AND preferred_model='gemini-3.1-flash-lite-image')
  AND NOT (SELECT lite_available FROM arc_image_policy WHERE id) THEN RETURN jsonb_build_object('allowed',false,'error','This image model is currently unavailable'); END IF;
 RETURN reserve_arc_image_credits_finite(target_user_id,target_job_id,requested_count);
END $$;
ALTER FUNCTION public.claim_arc_image_refill(text,uuid) RENAME TO claim_arc_image_refill_finite;
CREATE FUNCTION public.claim_arc_image_refill(claim_key text,campaign_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Registered account required'; END IF;
 IF (arc_image_snapshot(auth.uid())->>'unlimited')::boolean THEN RAISE EXCEPTION 'Refill unavailable while image allowance is unlimited'; END IF;
 RETURN claim_arc_image_refill_finite(claim_key,campaign_id);
END $$;
ALTER FUNCTION public.admin_arc_images(text,jsonb,text) RENAME TO admin_arc_images_finite;
CREATE FUNCTION public.admin_arc_images(action text,payload jsonb DEFAULT '{}',request_key text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=admin_arc_images_finite(action,payload,request_key); -- includes actual admin authorization
 IF action='dashboard' THEN RETURN result||jsonb_build_object('transition',arc_image_transition_report()); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.arc_image_transition_candidates(),public.arc_image_transition_report(),public.arc_image_activate_transition(text,text,boolean),public.arc_image_set_lite_readiness(boolean,jsonb,boolean),
 public.arc_image_snapshot_finite(uuid),public.arc_image_snapshot(uuid),public.reserve_arc_image_credits_finite(uuid,uuid,integer),public.reserve_arc_image_credits(uuid,uuid,integer),
 public.claim_arc_image_refill_finite(text,uuid),public.admin_arc_images_finite(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arc_image_transition_candidates(),public.arc_image_transition_report(),public.arc_image_activate_transition(text,text,boolean),public.arc_image_set_lite_readiness(boolean,jsonb,boolean),
 public.arc_image_snapshot(uuid),public.reserve_arc_image_credits(uuid,uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_arc_image_refill(text,uuid),public.admin_arc_images(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_arc_image_refill(text,uuid),public.admin_arc_images(text,jsonb,text) TO authenticated;
