// Socket-free native PostgreSQL smoke test for restricted cloud executors.
// This validates native SQL execution, not simultaneous-connection races.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'arc-usage-native-')),data=join(dir,'data');
try {
  const init=spawnSync('initdb',['-D',data,'--auth=trust','--no-locale'],{encoding:'utf8'});
  assert.equal(init.status,0,init.stderr||'initdb is required on PATH');
  const setup=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,boost boolean DEFAULT false,is_anonymous boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.user_has_boost(u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT boost FROM auth.users WHERE id=u$$;
    INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001',false,false);`;
  const migration=readFileSync('supabase/migrations/20261010051758_arc_usage_ledger.sql','utf8');
  const checks=`SET request.jwt.claim.role='service_role';
    DO $test$ DECLARE r jsonb; a uuid; result jsonb; u uuid:='00000000-0000-4000-8000-000000000001'; BEGIN
      IF (public.arc_usage_snapshot(u,'sol')->>'enforcementEnabled')::boolean THEN RAISE EXCEPTION 'Unexpected initial enforcement'; END IF;
      UPDATE public.arc_usage_policy SET enforcement_enabled=true,free_daily_nanos=100,free_monthly_nanos=250,boost_daily_nanos=1000,boost_monthly_nanos=2000 WHERE pool='sol';
      r:=public.reserve_arc_usage(u,'first','attempt','chat','gpt-6.1-sol',70,'fingerprint'); a:=(r->>'reservationId')::uuid;
      IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'Initial reservation failed'; END IF;
      result:=public.record_arc_usage(u,a,'checkpoint',50,false);
      result:=public.record_arc_usage(u,a,'final',20,true);
      IF (result->'daily'->>'spentNanos')::bigint<>20 OR (result->'daily'->>'reservedNanos')::bigint<>0 THEN RAISE EXCEPTION 'Final refund failed'; END IF;
      result:=public.record_arc_usage(u,a,'final',20,true);
      IF NOT (result->>'replayed')::boolean THEN RAISE EXCEPTION 'Receipt replay failed'; END IF;
      r:=public.reserve_arc_usage(u,'too-large','attempt','chat','gpt-6.1-sol',81,'fingerprint');
      IF (r->>'allowed')::boolean THEN RAISE EXCEPTION 'Cap did not deny'; END IF;
      r:=public.reserve_arc_usage(u,'exact','attempt','chat','gpt-6.1-sol',80,'fingerprint');
      IF NOT (r->>'allowed')::boolean THEN RAISE EXCEPTION 'Exact remaining cap denied'; END IF;
      result:=public.record_arc_usage(u,(r->>'reservationId')::uuid,'overshoot',90,true);
      IF (result->'daily'->>'spentNanos')::bigint<>110 THEN RAISE EXCEPTION 'Overshoot not captured'; END IF;
      r:=public.reserve_arc_usage(u,'blocked','attempt','chat','gpt-6.1-sol',1,'fingerprint');
      IF (r->>'allowed')::boolean THEN RAISE EXCEPTION 'Overshoot did not block subsequent admission'; END IF;
      r:=public.reserve_arc_usage(u,'luna','attempt','chat','gpt-6-luna',1000000000,'fingerprint','luna');
      IF NOT (r->>'allowed')::boolean OR (r->>'enforcementEnabled')::boolean THEN RAISE EXCEPTION 'Luna unlimited policy regressed'; END IF;
    END $test$;
    SELECT 'ARC_USAGE_NATIVE_SQL_PASS';`;
  const script=[setup,migration,checks].join('\n').replace(/^\s*--.*$/gm,'').replaceAll('\n',' ')+'\n';
  const result=spawnSync('postgres',['--single','-D',data,'-c','exit_on_error=on','postgres'],{encoding:'utf8',input:script,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr||'postgres is required on PATH');
  assert.doesNotMatch(result.stderr,/\b(?:ERROR|FATAL|PANIC):/);
  assert.match(result.stdout,/ARC_USAGE_NATIVE_SQL_PASS/);
  console.log('PASS native PostgreSQL single-backend SQL: full migration compiled; observation defaults, reserve, cumulative checkpoint, lower exact final/refund, receipt replay, exact quota, overage capture and Luna unlimited verified. No socket, network listener or provider calls. This is not a concurrency test.');
} finally { rmSync(dir,{recursive:true,force:true}); }
