// Isolated PostgreSQL (PGlite); no external database, provider or credentials.
// PGlite serializes queries: this suite validates SQL behavior, not independent
// multi-connection races. Use test-arc-usage-concurrency.mjs for those races.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
let dependency;
try { dependency = require.resolve('@electric-sql/pglite'); }
catch { dependency = createRequire('/tmp/arc-db-tests/package.json').resolve('@electric-sql/pglite'); }
const { PGlite } = await import(dependency);
const db = new PGlite();
const free = randomUUID(), boost = randomUUID(), admin = randomUUID(), other = randomUUID();
const sql = async q => (await db.exec(`RESET ROLE; ${q}`)).at(-1)?.rows ?? [];
const service = `SET ROLE service_role; SET request.jwt.claim.role='service_role';`;
const user = id => `SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='${id}';`;
const scalar = async q => Object.values((await sql(q))[0])[0];
const snapshot = (id, pool = 'sol') => scalar(`${user(id)} SELECT get_my_arc_usage('${pool}');`);
const reserve = (id, amount, opts = {}) => scalar(`${service} SELECT reserve_arc_usage('${id}', '${opts.request ?? randomUUID()}', '${opts.attempt ?? 'model:0'}', '${opts.source ?? 'chat'}', '${opts.model ?? 'gpt-6.1-sol'}', ${amount}, '${opts.fingerprint ?? 'fixture-hash'}', '${opts.pool ?? 'sol'}', ${opts.minimum ?? 1}, ${opts.clamp ?? false});`);
const record = (id, reservation, amount, final, key = randomUUID(), detail = {}) => scalar(`${service} SELECT record_arc_usage('${id}','${reservation}','${key}',${amount},${final},'${JSON.stringify(detail)}');`);
const reconcile = (id, reservation, amount, revision, key = randomUUID()) => scalar(`${service} SELECT reconcile_arc_usage('${id}','${reservation}','${key}',${revision},${amount},'{"reason":"authoritative fixture usage"}');`);
try {
  await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,boost boolean NOT NULL DEFAULT false,is_anonymous boolean NOT NULL DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.user_has_boost(u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT boost OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=u) FROM auth.users WHERE id=u$$;
    INSERT INTO auth.users(id,boost) VALUES('${free}',false),('${boost}',true),('${admin}',true),('${other}',false);
    INSERT INTO public.admin_users VALUES('${admin}');
    CREATE TABLE fixture_clock(at timestamptz); INSERT INTO fixture_clock VALUES('2026-10-10T23:59:00Z');
    CREATE FUNCTION public.fixture_now() RETURNS timestamptz LANGUAGE sql SECURITY DEFINER AS $$SELECT at FROM public.fixture_clock$$;`);
  await sql(readFileSync('supabase/migrations/20261010040518_arc_usage_ledger.sql','utf8').replaceAll('now()', 'public.fixture_now()'));
  let view = await snapshot(free);
  assert.equal(view.enforcementEnabled, false); assert.equal(view.configured, true);
  assert.equal(view.daily.limitNanos, null); assert.equal(view.monthly.usagePercent, null);
  assert.equal((await snapshot(boost,'astra')).configured, true);
  assert.equal((await snapshot(boost,'astra')).enforcementEnabled, false);
  const observed = await reserve(free, 100);
  assert.equal(observed.allowed, true);
  await record(free, observed.reservationId, 15, true);
  assert.equal((await snapshot(free)).daily.spentNanos, 15);

  // Test-only numbers. They are not release allowance defaults.
  await sql(`UPDATE arc_usage_policy SET free_daily_nanos=100,free_monthly_nanos=250,boost_daily_nanos=1000,boost_monthly_nanos=2000,enforcement_enabled=true WHERE pool='sol';`);
  const request = randomUUID();
  const a = await reserve(free, 60, {request});
  assert.equal(a.allowed, true); assert.equal(a.replayed, false);
  assert.equal((await reserve(free,60,{request})).reservationId,a.reservationId);
  assert.equal((await snapshot(free)).daily.reservedNanos,60);
  await assert.rejects(reserve(free,60,{request,fingerprint:'changed'}),/identity conflict/);
  assert.equal((await reserve(free,40)).allowed,false);
  const checkKey = randomUUID();
  await record(free,a.reservationId,20,false,checkKey);
  await record(free,a.reservationId,20,false,checkKey);
  view=await snapshot(free); assert.equal(view.daily.spentNanos,35); assert.equal(view.daily.reservedNanos,40);
  await record(free,a.reservationId,10,false); // stale provider high-water mark
  assert.equal((await snapshot(free)).daily.spentNanos,35);
  await assert.rejects(record(free,a.reservationId,21,false,checkKey),/identity conflict/);
  const topped=await reserve(free,85,{request});
  assert.equal(topped.reservedNanos,85); assert.equal((await snapshot(free)).daily.remainingNanos,0);
  const finalKey=randomUUID();
  const settled=await record(free,a.reservationId,25,true,finalKey);
  await record(free,a.reservationId,25,true,finalKey);
  view=await snapshot(free); assert.equal(view.daily.spentNanos,40); assert.equal(view.daily.reservedNanos,0);
  assert.equal((await record(free,a.reservationId,99,false)).ignored,true);
  assert.equal((await reserve(free,100,{request})).state,'settled');
  assert.equal((await snapshot(free)).daily.reservedNanos,0);
  await assert.rejects(record(other,a.reservationId,0,true),/unavailable/);
  const reconcileKey=randomUUID();
  const corrected=await reconcile(free,a.reservationId,22,settled.revision,reconcileKey);
  assert.equal((await snapshot(free)).daily.spentNanos,37);
  await reconcile(free,a.reservationId,22,settled.revision,reconcileKey);
  await assert.rejects(reconcile(free,a.reservationId,20,settled.revision),/revision conflict/);
  await reconcile(free,a.reservationId,20,corrected.revision);
  assert.equal((await snapshot(free)).daily.spentNanos,35);

  // Above-estimate real usage must still be recorded; the next admission stops.
  const over=await reserve(free,50); await record(free,over.reservationId,80,true);
  assert.equal((await snapshot(free)).daily.spentNanos,115);
  assert.equal((await reserve(free,1)).allowed,false);
  // A denied first request must not pin its retry to an exhausted old window.
  const deniedRequest=randomUUID(); assert.equal((await reserve(free,1,{request:deniedRequest})).allowed,false);
  await sql(`UPDATE fixture_clock SET at='2026-10-11T00:01:00Z';`);
  assert.equal((await reserve(free,1,{request:deniedRequest})).allowed,true);
  const oldDay=await reserve(boost,300,{request:'cross-day'});
  await sql(`UPDATE fixture_clock SET at='2026-11-01T00:01:00Z';`);
  await record(boost,oldDay.reservationId,200,true);
  assert.equal((await snapshot(boost)).monthly.spentNanos,0,'Late settlement stays in its reserved period');
  assert.equal((await reserve(boost,300,{request:'cross-day'})).state,'settled');
  const fresh=await reserve(boost,900); assert.equal(fresh.allowed,true);
  await record(boost,fresh.reservationId,900,true);
  assert.equal((await reserve(boost,500,{minimum:50,clamp:true})).reservedNanos,100);

  // Astra is independent, monthly-only, and Free has no Astra allowance.
  await sql(`UPDATE arc_usage_policy SET enforcement_enabled=true WHERE pool='astra';`);
  assert.equal((await reserve(free,10,{pool:'astra',model:'gpt-6-astra'})).allowed,false);
  const astr=await reserve(boost,1_500_000_000,{pool:'astra',model:'gpt-6-astra',minimum:10_000_000,clamp:true});
  assert.equal(astr.providerBudgetCents,150); assert.equal(astr.daily.limitNanos,null);
  assert.equal(astr.monthly.remainingNanos,1_500_000_000);
  const luna=await reserve(free,1_000_000_000,{pool:'luna',model:'gpt-6-luna'});
  assert.equal(luna.allowed,true); assert.equal(luna.enforcementEnabled,false);
  await assert.rejects(sql(`UPDATE arc_usage_policy SET enforcement_enabled=true,free_monthly_nanos=1,boost_monthly_nanos=1 WHERE pool='luna';`),/check constraint/);
  await assert.rejects(reserve(free,1,{pool:'sol',model:'gpt-6-luna'}),/pool mismatch/);
  const unlimited=await reserve(admin,9_000_000_000,{pool:'astra',model:'gpt-6-astra'});
  assert.equal(unlimited.adminUncapped,true); assert.equal(unlimited.allowed,true);
  await record(admin,unlimited.reservationId,8_000_000_000,true);
  assert.equal((await snapshot(admin,'astra')).monthly.spentNanos,8_000_000_000);
  assert.equal((await snapshot(admin,'astra')).monthly.limitNanos,null);
  // A sub-cent remainder cannot start a provider whose minimum is one cent.
  await sql(`UPDATE arc_usage_policy SET boost_monthly_nanos=1505000000 WHERE pool='astra';`);
  assert.equal((await reserve(boost,10_000_000,{pool:'astra',model:'gpt-6-astra',minimum:10_000_000,clamp:true})).allowed,false);
  await assert.rejects(sql(`${user(free)} SELECT * FROM arc_usage_reservations;`),/permission denied/);
  await assert.rejects(sql(`${user(free)} SELECT reserve_arc_usage('${free}','x','a','chat','gpt-6.1-sol',1,'f');`),/permission denied/);
  await assert.rejects(sql(`SET ROLE anon; SELECT get_my_arc_usage();`),/permission denied/);
  await assert.rejects(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=''; SELECT get_my_arc_usage();`),/Unauthorized/);
  await assert.rejects(reserve(free,-1),/Invalid usage/);
  await assert.rejects(record(boost,astr.reservationId,-1,true),/Invalid usage/);
  console.log('PASS PostgreSQL usage ledger: observation-only defaults, Luna unlimited, separate Astra monthly allowance, atomic allocation SQL, replay identity, cumulative high-water marks, top-ups, final refunds, owner/grant checks, admin metering, reconciliation fences, overshoot capture and UTC rollover. Multi-connection concurrency is a separate test.');
} catch (error) {
  console.error('FAIL usage ledger:', error.message, error.where ?? '', error.actual ?? '', error.expected ?? '');
  console.error(error.stack?.split('\n').slice(0,5).join('\n'));
  process.exitCode=1;
} finally { await db.close(); }
