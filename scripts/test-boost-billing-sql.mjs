// Disposable, socket-free PostgreSQL via PGlite. No credentials, external
// database, Stripe/Play APIs, or provider calls. Queries run serially; this is
// ordinary functional migration coverage, not a native concurrency test.
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
const migrationName = '20261010041102_boost_price_catalog_v2.sql';
const readMigration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const migration = readMigration(migrationName);
assert.ok(migration.trim(), 'The billing migration must not be empty');
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sql = async statement => (await db.exec(`RESET ROLE; RESET request.jwt.claim.role; RESET request.jwt.claim.sub; ${statement}`)).at(-1)?.rows ?? [];
const scalar = async statement => Object.values((await sql(statement))[0])[0];
const service = "SET ROLE service_role; SET request.jwt.claim.role='service_role';";
const owner = id => `SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub=${quote(id ?? '')};`;
const entitlement = (id, actor = id) => scalar(`${owner(actor)} SELECT public.user_has_boost(${quote(id)}::uuid);`);
const serviceEntitlement = id => scalar(`${service} SELECT public.user_has_boost(${quote(id)}::uuid);`);
const imageTier = id => scalar(`${service} SELECT public.arc_image_tier(${quote(id)}::uuid);`);
const candidates = async () => new Map((await sql(`${service} SELECT * FROM public.arc_image_transition_candidates();`)).map(row => [row.user_id, row]));
const snapshot = async () => {
  const result = {};
  for (const table of ['subscriptions', 'google_play_subscriptions', 'fixture_stripe_prices', 'admin_users', 'account_entitlement_grants', 'arc_image_policy']) {
    result[table] = await sql(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text;`);
  }
  return result;
};
const preservedImageAcl = () => sql(`SELECT proname, proacl::text AS acl FROM pg_proc
  WHERE oid IN ('public.arc_image_tier(uuid)'::regprocedure, 'public.arc_image_transition_candidates()'::regprocedure)
  ORDER BY proname;`);
const product = 'prod_UbSTljFnpRfR8v';
const legacyPrices = [
  ['legacy monthly key', 'arcai_boost_monthly', 1000],
  ['legacy annual key', 'arcai_boost_annual', 9500],
  ['$10 monthly raw price', 'price_1TpXatAB32948AKD6EmXcZo0', 1000],
  ['$95 annual raw price', 'price_1TpXf9AB32948AKDtKNThFaZ', 9500],
  ['$7 monthly raw price', 'price_1TcFYeAB32948AKDObaHk0fz', 700],
  ['$65 annual raw price', 'price_1TpKUdAB32948AKD4CUxINQY', 6500],
];
const currentPrices = [
  ['new monthly key', 'arcai_boost_monthly_202610', 1500],
  ['new annual key', 'arcai_boost_annual_202610', 11500],
  ['$15 monthly raw price', 'price_1UOrq0AB32948AKDzDqPg1vp', 1500],
  ['$115 annual raw price', 'price_1UOrqPAB32948AKDjnqWyyC4', 11500],
];
const cases = [];
let passed = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  passed++;
};

try {
  await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE NOT NULL, is_anonymous boolean NOT NULL DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',nullif(current_setting('request.jwt.claim.role',true),''))$$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
    CREATE TABLE public.subscriptions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
      stripe_subscription_id text UNIQUE, stripe_customer_id text, product_id text, price_id text,
      status text NOT NULL DEFAULT 'inactive', environment text NOT NULL DEFAULT 'live',
      cancel_at_period_end boolean NOT NULL DEFAULT false, canceled_at timestamptz,
      current_period_start timestamptz, current_period_end timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.account_entitlement_grants(email text PRIMARY KEY, grant_lifetime_boost boolean NOT NULL DEFAULT false);
    CREATE TABLE public.arc_image_policy(id boolean PRIMARY KEY DEFAULT true CHECK(id),
      owner_confirmed_transition_grants uuid[] NOT NULL DEFAULT '{}', transition_mode text NOT NULL DEFAULT 'staged');
    INSERT INTO public.arc_image_policy(id) VALUES(true);
    -- Test-only catalog: amount/lookup metadata are not columns in subscriptions.
    -- This models saved external billing identities without contacting Stripe.
    CREATE TABLE public.fixture_stripe_prices(id text PRIMARY KEY, product_id text NOT NULL,
      unit_amount integer NOT NULL, lookup_key text, currency text NOT NULL DEFAULT 'usd');`);
  await sql(readMigration('20260923120000_arcai_google_play_subscriptions.sql'));

  // Use the pre-migration SQL bodies, rather than stubbing the image classifiers.
  // Their supporting fixture schema is limited to the fields these bodies read.
  const monthly = readMigration('20261006031918_monthly_image_policy.sql');
  for (const name of ['arc_image_tier', 'arc_image_transition_is_granted', 'arc_image_transition_candidates']) {
    const definition = monthly.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([^]*?\\n\\$\\$;`))?.[0];
    assert.ok(definition, `Missing existing function ${name}`);
    await sql(definition);
  }
  await sql(`REVOKE ALL ON FUNCTION public.arc_image_tier(uuid), public.arc_image_transition_is_granted(uuid), public.arc_image_transition_candidates() FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.arc_image_tier(uuid), public.arc_image_transition_is_granted(uuid), public.arc_image_transition_candidates() TO service_role;`);

  const now = new Date(await scalar('SELECT now()::text;')).getTime();
  const day = 86400000;
  const at = days => new Date(now + days * day).toISOString();
  const future = at(30), past = at(-1), periodStart = at(-1);
  const addCase = async (label, options = {}) => {
    const id = randomUUID();
    const email = `${id}@fixture.example.test`;
    const item = { label, id, expected: false, candidate: null, ...options };
    await sql(`INSERT INTO auth.users(id,email,is_anonymous) VALUES(${quote(id)},${quote(email)},${Boolean(options.anonymous)});`);
    if (options.stripe) {
      const stripe = { price: 'arcai_boost_monthly', product: null, status: 'active', end: future, ...options.stripe };
      item.stripe = stripe;
      await sql(`INSERT INTO public.subscriptions(user_id,stripe_subscription_id,stripe_customer_id,product_id,price_id,status,
        cancel_at_period_end,canceled_at,current_period_start,current_period_end)
        VALUES(${quote(id)},${quote(`sub_fixture_${id}`)},${quote(`cus_fixture_${id}`)},${quote(stripe.product)},${quote(stripe.price)},${quote(stripe.status)},
          ${stripe.status === 'canceled'},${stripe.status === 'canceled' ? quote(periodStart) : 'NULL'},${quote(periodStart)},${quote(stripe.end)});`);
    }
    for (const [index, play] of (options.play ?? []).entries()) {
      await sql(`INSERT INTO public.google_play_subscriptions(purchase_token,user_id,product_id,subscription_state,expiry_time,auto_renewing)
        VALUES(${quote(`fixture_purchase_${id}_${index}`)},${quote(id)},${quote(play.product ?? 'arcai_boost_annual')},${quote(play.state)},${quote(play.end)},false);`);
    }
    if (options.admin) await sql(`INSERT INTO public.admin_users(user_id) VALUES(${quote(id)});`);
    if (options.ownerGrant) await sql(`UPDATE public.arc_image_policy SET owner_confirmed_transition_grants=array_append(owner_confirmed_transition_grants,${quote(id)}::uuid);`);
    if (options.lifetimeGrant) await sql(`INSERT INTO public.account_entitlement_grants(email,grant_lifetime_boost) VALUES(${quote(email.toUpperCase())},true);`);
    cases.push(item);
    return item;
  };

  for (const [label, price, amount] of [...legacyPrices, ...currentPrices]) {
    await sql(`INSERT INTO public.fixture_stripe_prices(id,product_id,unit_amount,lookup_key) VALUES(${quote(price)},${quote(product)},${amount},${price.startsWith('arcai_') ? quote(price) : 'NULL'});`);
    await addCase(label, { stripe: { price }, expected: true, candidate: ['valid', future], preserve: price === 'arcai_boost_monthly' || price === 'arcai_boost_annual' });
  }
  const zeroPrice = 'price_fixture_zero_untagged';
  await sql(`INSERT INTO public.fixture_stripe_prices(id,product_id,unit_amount,lookup_key) VALUES(${quote(zeroPrice)},${quote(product)},0,NULL);`);
  const zero = await addCase('untagged zero-price same-product subscription', { stripe: { price: zeroPrice, product }, expected: true, candidate: ['valid', future] });
  await addCase('product identity without a saved price', { stripe: { price: null, product }, expected: true, candidate: ['valid', future] });
  await addCase('unrelated product and price', { stripe: { price: 'price_fixture_unrelated', product: 'prod_unrelated' }, preserve: true });
  await addCase('look-alike key', { stripe: { price: 'arcai_boost_monthly_fake' }, preserve: true });
  await addCase('null price and product', { stripe: { price: null }, preserve: true });
  await addCase('no subscription', { preserve: true });

  for (const price of ['arcai_boost_monthly', 'arcai_boost_monthly_202610', zeroPrice]) {
    for (const status of ['active', 'trialing', 'past_due', 'canceled', 'inactive', 'unpaid', 'incomplete', 'paused']) {
      const expected = ['active', 'trialing', 'past_due', 'canceled'].includes(status);
      await addCase(`${price}: ${status}`, { stripe: { price, product: price === zeroPrice ? product : null, status }, expected,
        candidate: expected ? ['valid', future] : null, preserve: price === 'arcai_boost_monthly' });
    }
  }
  await addCase('canceled paid-through period expired', { stripe: { status: 'canceled', end: past }, preserve: true });
  await addCase('canceled at the current boundary', { stripe: { status: 'canceled', end: at(0) }, preserve: true });
  await addCase('canceled with no end date', { stripe: { status: 'canceled', end: null }, preserve: true });
  await addCase('active with expired renewal date', { stripe: { end: past }, expected: true, candidate: ['expired', past], preserve: true });
  await addCase('past-due with no renewal date', { stripe: { status: 'past_due', end: null }, expected: true, candidate: ['missing', null], preserve: true });
  await addCase('new-price active with no renewal date', { stripe: { price: currentPrices[0][1], end: null }, expected: true, candidate: ['missing', null] });
  await addCase('lifetime sentinel is not a perpetual image expiry', { stripe: { end: '9999-01-01T00:00:00.000Z' }, expected: true, candidate: ['missing', null], preserve: true });
  await addCase('owner-confirmed image grant', { stripe: {}, ownerGrant: true, expected: true, candidate: ['grant', null], preserve: true });
  await addCase('case-insensitive lifetime email grant', { stripe: {}, lifetimeGrant: true, expected: true, candidate: ['grant', null], preserve: true });
  await addCase('anonymous Boost excluded from transition cohort', { stripe: {}, anonymous: true, expected: true, preserve: true });
  const admin = await addCase('admin without a subscription', { admin: true, expected: true, preserve: true });
  await addCase('admin with new subscription remains admin', { admin: true, stripe: { price: currentPrices[1][1] }, expected: true, preserve: true });

  for (const [state, valid] of [
    ['SUBSCRIPTION_STATE_ACTIVE', true], ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', true], ['SUBSCRIPTION_STATE_CANCELED', true],
    ['SUBSCRIPTION_STATE_EXPIRED', false], ['SUBSCRIPTION_STATE_ON_HOLD', false], ['SUBSCRIPTION_STATE_PAUSED', false], ['SUBSCRIPTION_STATE_PENDING', false],
  ]) {
    await addCase(`Play ${state} with future expiry`, { play: [{ state, end: future }], expected: valid, candidate: valid ? ['valid', future] : null, preserve: true });
  }
  for (const state of ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']) {
    for (const end of [past, null]) await addCase(`Play ${state} with ${end ? 'expired' : 'missing'} expiry`, { play: [{ state, end }], preserve: true });
  }
  await addCase('Stripe plus later Play expiry', { stripe: {}, play: [{ state: 'SUBSCRIPTION_STATE_CANCELED', end: at(45) }], expected: true, candidate: ['valid', at(45)], preserve: true });
  await addCase('new Stripe plus earlier Play expiry', { stripe: { price: currentPrices[1][1] }, play: [{ state: 'SUBSCRIPTION_STATE_ACTIVE', end: at(15) }], expected: true, candidate: ['valid', future] });
  await addCase('multiple Play receipts use latest eligible date', { play: [
    { state: 'SUBSCRIPTION_STATE_ACTIVE', end: at(10) },
    { state: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', end: at(40) },
    { state: 'SUBSCRIPTION_STATE_EXPIRED', end: at(60) },
  ], expected: true, candidate: ['valid', at(40)], preserve: true });

  // Compare existing account outcomes with the actual preceding SQL definitions.
  const beforeCandidates = await candidates();
  const preserved = [];
  for (const item of cases.filter(item => item.preserve)) {
    preserved.push([item, await entitlement(item.id), await imageTier(item.id), beforeCandidates.get(item.id)]);
  }
  const beforeData = await snapshot();
  const beforeAcl = await preservedImageAcl();
  await sql(migration);
  check(await snapshot(), beforeData, 'Applying billing recognition must not mutate any saved subscription, price, Play receipt, grant, or image policy');
  check(await preservedImageAcl(), beforeAcl, 'Replacing image helpers retains their existing service-only grants');

  for (const [, price] of [...legacyPrices, ...currentPrices]) {
    check(await scalar(`${service} SELECT public.arc_is_boost_billing_price(${quote(price)});`), true, `Recognize ${price} without product fallback`);
  }
  for (const price of [zeroPrice, null, '']) {
    check(await scalar(`${service} SELECT public.arc_is_boost_billing_price(${quote(price)},${quote(product)});`), true, 'Verified product-only price recognized');
  }
  for (const [price, productId] of [[null, null], ['', null], ['price_fixture_unrelated', 'prod_unrelated'], ['arcai_boost_monthly_fake', null]]) {
    check(await scalar(`${service} SELECT public.arc_is_boost_billing_price(${quote(price)},${quote(productId)});`), false, 'Unrelated/null price rejected');
  }
  check(await scalar(`SELECT unit_amount=0 AND lookup_key IS NULL FROM public.fixture_stripe_prices WHERE id=${quote(zeroPrice)};`), true, 'Product-only fixture is explicitly zero-price and untagged');

  const afterCandidates = await candidates();
  check(afterCandidates.size, cases.filter(item => item.candidate).length, 'Transition candidates have no duplicate or unexpected accounts');
  const other = cases.find(item => item.label === 'no subscription').id;
  for (const item of cases) {
    check(await entitlement(item.id), item.expected, `${item.label}: owner entitlement`);
    check(await serviceEntitlement(item.id), item.expected, `${item.label}: service entitlement without subject`);
    check(await entitlement(item.id, other), false, `${item.label}: another account cannot query this entitlement`);
    check(await imageTier(item.id), item.admin ? 'admin' : item.expected ? 'boost' : 'free', `${item.label}: image tier`);
    const candidate = afterCandidates.get(item.id);
    check(candidate ? [candidate.date_status, candidate.expires_at?.toISOString() ?? null] : null, item.candidate, `${item.label}: image transition classification and expiry`);
  }
  for (const [item, boost, tier, candidate] of preserved) {
    check(await entitlement(item.id), boost, `${item.label}: existing entitlement preserved`);
    check(await imageTier(item.id), tier, `${item.label}: existing image tier preserved`);
    check(afterCandidates.get(item.id), candidate, `${item.label}: existing transition candidate preserved`);
  }
  check(await entitlement(admin.id, null), false, 'Missing authenticated subject does not match an administrator');
  check(await entitlement(zero.id, null), false, 'Missing authenticated subject does not match a subscriber');
  check(await entitlement(null, admin.id), false, 'Null target returns false to owner caller');
  check(await serviceEntitlement(null), false, 'Null target returns false to service caller');
  check(await serviceEntitlement(randomUUID()), false, 'Unknown account is not entitled');
  for (const statement of [
    `SET ROLE anon; SELECT public.user_has_boost(${quote(admin.id)});`,
    `${owner(admin.id)} SELECT public.arc_image_tier(${quote(admin.id)});`,
    `${owner(admin.id)} SELECT public.arc_image_transition_candidates();`,
    `${owner(admin.id)} SELECT public.arc_is_boost_billing_price('arcai_boost_monthly');`,
  ]) {
    await assert.rejects(sql(statement), /permission denied/);
    passed++;
  }

  // Model an ordinary later renewal in the fixture by moving the paid period.
  // This is not a Stripe API simulation: the local stored billing identity and
  // test catalog amount must stay unchanged, and eligibility must survive.
  const renewing = [...cases.filter(item => legacyPrices.some(([label]) => label === item.label)), zero];
  const immutableBilling = ({ current_period_start, current_period_end, updated_at, ...identity }) => identity;
  const catalogBeforeRenewals = (await snapshot()).fixture_stripe_prices;
  for (const item of renewing) {
    const before = (await sql(`SELECT to_jsonb(s) AS row FROM public.subscriptions s WHERE user_id=${quote(item.id)};`))[0].row;
    await sql(`UPDATE public.subscriptions SET current_period_start=current_period_end,
      current_period_end=current_period_end + interval '1 year',updated_at=now() WHERE user_id=${quote(item.id)};`);
    const after = (await sql(`SELECT to_jsonb(s) AS row FROM public.subscriptions s WHERE user_id=${quote(item.id)};`))[0].row;
    check(immutableBilling(after), immutableBilling(before), `${item.label}: renewal retains all billing identity fields`);
    check(new Date(after.current_period_end) > new Date(before.current_period_end), true, `${item.label}: fixture renewal advances period`);
    check(await entitlement(item.id), true, `${item.label}: owner retains Boost after renewal`);
    check(await serviceEntitlement(item.id), true, `${item.label}: service retains Boost after renewal`);
    check(await imageTier(item.id), 'boost', `${item.label}: renewed image tier remains Boost`);
    const renewedCandidate = (await candidates()).get(item.id);
    check([renewedCandidate?.date_status, renewedCandidate?.expires_at?.toISOString()],
      ['valid', new Date(after.current_period_end).toISOString()], `${item.label}: renewal candidate uses the unchanged identity and new paid-through date`);
  }
  check((await snapshot()).fixture_stripe_prices, catalogBeforeRenewals, 'Legacy and zero-price renewal fixtures never transfer to a new price or amount');
  const beforeReplay = await snapshot();
  const beforeReplayCandidates = await candidates();
  await sql(migration);
  check(await snapshot(), beforeReplay, 'Reapplying additive migration preserves renewed subscriptions and all billing amounts');
  check(await candidates(), beforeReplayCandidates, 'Migration replay preserves transition candidates');
  check(await preservedImageAcl(), beforeAcl, 'Migration replay retains existing image helper grants');
  console.log(`PASS Boost billing SQL: ${passed} assertions across ${cases.length} account cases; legacy/new keys and raw IDs, untagged zero-price product, Stripe/Play states, owner/other/service/admin behavior, image transition dates and grants, unchanged rows, and ${renewing.length} legacy-identity renewal fixtures. PGlite serial SQL only; no network, production access, paid calls, or concurrent/native Postgres claims.`);
} finally {
  await db.close();
}
