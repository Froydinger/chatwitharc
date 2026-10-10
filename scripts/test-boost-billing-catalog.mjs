// Offline functional contracts for the actual Boost catalog, checkout handler,
// webhook handler and admin email helper. TypeScript executes in isolated VMs;
// Supabase, Stripe and email transports are fixtures. No credentials or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const NOW = Date.parse('2026-10-10T05:00:00.000Z');
const START = Math.floor(NOW / 1000) - 86400;
const FUTURE = Math.floor(NOW / 1000) + 30 * 86400;
const EXPIRED = Math.floor(NOW / 1000) - 1;
const PRODUCT = 'prod_UbSTljFnpRfR8v';
const OWNER = { id: 'user_checkout_fixture', email: 'owner@example.test' };
const MONTHLY = {
  lookupKey: 'arcai_boost_monthly_202610', livePriceId: 'price_1UOrq0AB32948AKDzDqPg1vp',
  currency: 'usd', unitAmount: 1500, interval: 'month',
};
const ANNUAL = {
  lookupKey: 'arcai_boost_annual_202610', livePriceId: 'price_1UOrqPAB32948AKDjnqWyyC4',
  currency: 'usd', unitAmount: 11500, interval: 'year',
};
const LEGACY = [
  ['arcai_boost_monthly', 'arcai_boost_monthly', 'month', 1000],
  ['arcai_boost_annual', 'arcai_boost_annual', 'year', 9500],
  ['price_1TpXatAB32948AKD6EmXcZo0', 'arcai_boost_monthly', 'month', 1000],
  ['price_1TpXf9AB32948AKDtKNThFaZ', 'arcai_boost_annual', 'year', 9500],
  ['price_1TcFYeAB32948AKDObaHk0fz', 'arcai_boost_monthly', 'month', 700],
  ['price_1TpKUdAB32948AKD4CUxINQY', 'arcai_boost_annual', 'year', 6500],
];
const CURRENT = [
  [MONTHLY.lookupKey, MONTHLY.lookupKey, 'month', 1500],
  [ANNUAL.lookupKey, ANNUAL.lookupKey, 'year', 11500],
  [MONTHLY.livePriceId, MONTHLY.lookupKey, 'month', 1500],
  [ANNUAL.livePriceId, ANNUAL.lookupKey, 'year', 11500],
];
const IDENTITIES = [...LEGACY, ...CURRENT];
const tests = [];
const test = (name, run) => tests.push({ name, run });
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const iso = seconds => new Date(seconds * 1000).toISOString();
const compiled = new Map();
function compile(file) {
  file = resolve(file);
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText);
  return compiled.get(file);
}
function frozen(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function livePrice(plan = MONTHLY, overrides = {}) {
  return {
    id: plan.livePriceId, lookup_key: plan.lookupKey, product: PRODUCT,
    active: true, currency: plan.currency, unit_amount: plan.unitAmount, type: 'recurring',
    recurring: { interval: plan.interval, interval_count: 1, usage_type: 'licensed' }, ...overrides,
  };
}
function identityPrice([identity, , interval, amount]) {
  return {
    id: identity.startsWith('price_') ? identity : `price_fixture_${identity}`,
    lookup_key: identity.startsWith('price_') ? null : identity,
    product: PRODUCT, active: false, currency: 'usd', unit_amount: amount, type: 'recurring',
    recurring: { interval, interval_count: 1, usage_type: 'licensed' },
  };
}
function subscription(price = identityPrice(LEGACY[2]), overrides = {}) {
  return {
    id: 'sub_grandfathered_fixture', customer: 'cus_fixture', metadata: { userId: OWNER.id },
    status: 'active', cancel_at_period_end: false,
    current_period_start: START - 60, current_period_end: FUTURE - 60,
    items: { data: [{ id: 'si_fixture', price, current_period_start: START, current_period_end: FUTURE }] },
    ...overrides,
  };
}
function completedSession(sub = subscription(), overrides = {}) {
  return {
    id: 'cs_fixture', status: 'complete', payment_status: 'paid',
    metadata: { userId: OWNER.id }, customer: 'cus_fixture', subscription: sub, ...overrides,
  };
}
function dbSubscription(overrides = {}) {
  return {
    id: 'db_subscription_fixture', user_id: OWNER.id, environment: 'live',
    stripe_subscription_id: 'sub_grandfathered_fixture', price_id: 'arcai_boost_monthly',
    product_id: PRODUCT, status: 'active', current_period_end: iso(FUTURE), ...overrides,
  };
}

function fixture(endpoint = null, options = {}) {
  let handler;
  const calls = [], writes = [], emails = [], sessions = [], logs = [], modules = new Map();
  const caller = options.user === undefined ? OWNER : options.user;
  const env = {
    SUPABASE_URL: 'https://billing-fixture.example', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    ADMIN_EMAIL: 'admin@example.test',
  };
  const db = {
    auth: {
      async getUser(token) {
        calls.push(['auth.getUser', token]);
        return { data: { user: caller }, error: options.authError ?? (caller ? null : { message: 'Unauthorized' }) };
      },
      admin: { async getUserById(id) {
        calls.push(['auth.admin.getUserById', id]);
        return { data: { user: OWNER }, error: null };
      } },
    },
    from(table) {
      assert.ok(['admin_users', 'subscriptions', 'google_play_subscriptions', 'profiles'].includes(table),
        `Unexpected table: ${table}`);
      const filters = [];
      let columns;
      let write;
      let single = false;
      const result = async () => {
        if (write) {
          calls.push(['db.write', { table, ...write, filters: plain(filters) }]);
          writes.push({ table, ...write, filters: plain(filters) });
          return { data: null, error: options.writeError ?? null };
        }
        calls.push(['db.read', { table, columns, filters: plain(filters) }]);
        if (table === 'admin_users') return { data: options.admin ? { user_id: caller?.id } : null, error: null };
        if (table === 'profiles') return { data: { display_name: 'Fixture Subscriber' }, error: null };
        const rows = table === 'subscriptions' ? options.dbSubscriptions ?? [] : options.playSubscriptions ?? [];
        const error = table === 'subscriptions' ? options.dbError : options.playError;
        const matches = rows.filter(row => filters.every(([key, value]) => row[key] === value));
        return { data: frozen(plain(single ? matches[0] ?? null : matches)), error: error ?? null };
      };
      const chain = {
        select(value) { columns = value; return chain; },
        eq(key, value) { filters.push([key, value]); return chain; },
        upsert(row, args) { write = { method: 'upsert', row: plain(row), args: plain(args) }; return chain; },
        update(row) { write = { method: 'update', row: plain(row) }; return chain; },
        maybeSingle() { single = true; return result(); },
        then(fulfilled, rejected) { return result().then(fulfilled, rejected); },
      };
      return chain;
    },
  };
  const stripe = {
    prices: { async list(args) {
      calls.push(['prices.list', plain(args)]);
      const plan = args.lookup_keys[0] === ANNUAL.lookupKey ? ANNUAL : MONTHLY;
      return { data: frozen(plain(options.prices ?? [livePrice(plan)])) };
    } },
    customers: {
      async search(args) {
        calls.push(['customers.search', plain(args)]);
        return { data: [{ id: 'cus_fixture', metadata: { userId: OWNER.id } }] };
      },
      async list(args) { calls.push(['customers.list', plain(args)]); throw new Error('Unexpected customer lookup fallback'); },
      async update() { throw new Error('This billing fixture must not change an existing customer'); },
      async create() { throw new Error('This billing fixture already has a customer'); },
    },
    subscriptions: { async list(args) {
      calls.push(['subscriptions.list', plain(args)]);
      const index = calls.filter(([name]) => name === 'subscriptions.list').length - 1;
      if (options.historyErrorAt === index) throw new Error('Fixture subscription history failed');
      const pages = options.historyPages ?? [{ data: options.stripeSubscriptions ?? [], has_more: false }];
      assert.ok(index < pages.length, 'Unexpected extra subscription-history request');
      return frozen(plain(pages[index]));
    } },
    checkout: { sessions: {
      async create(args) {
        calls.push(['checkout.sessions.create', plain(args)]); sessions.push(plain(args));
        return { id: 'cs_new_fixture', url: 'https://checkout.stripe.com/c/pay/cs_fixture', client_secret: 'fixture-secret' };
      },
      async retrieve(id, args) {
        calls.push(['checkout.sessions.retrieve', { id, ...plain(args) }]);
        return frozen(plain(options.session ?? completedSession()));
      },
    } },
  };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const context = vm.createContext({
    Date: FixtureDate, Request, Response, Headers, URL,
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    Deno: {
      serve(value) { assert.equal(handler, undefined, 'Only one endpoint may be loaded per fixture'); handler = value; },
      env: { get: name => env[name], set: (name, value) => { env[name] = value; }, delete: name => { delete env[name]; } },
      test,
    },
    fetch: async (url, init = {}) => {
      assert.equal(String(url), `${env.SUPABASE_URL}/functions/v1/send-transactional-email`, 'No real network is available');
      assert.equal(init.method, 'POST');
      emails.push(JSON.parse(init.body));
      return Response.json({ success: true });
    },
  });
  function load(file) {
    file = resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const requireMock = name => {
      if (name === 'npm:@supabase/supabase-js@2.57.2') return { createClient: () => db };
      if (name === '../_shared/stripe.ts') return {
        createStripeClient(environment) { calls.push(['createStripeClient', environment]); return stripe; },
        getStripeErrorMessage: error => error?.message ?? String(error),
        async verifyWebhook(req, environment) {
          calls.push(['verifyWebhook', environment]);
          assert.equal(req.headers.get('stripe-signature'), 'fixture-signature');
          if (options.webhookError) throw new Error('Fixture invalid webhook');
          return frozen(plain(options.event));
        },
      };
      const dependency = resolve(dirname(file), name);
      assert.ok(['boostCatalog.ts', 'boost-admin-email.ts'].some(suffix => dependency.endsWith(`/${suffix}`)),
        `Unexpected dependency: ${name}`);
      return load(dependency);
    };
    const execute = new vm.Script(`(function(exports, require, module) {\n${compile(file)}\n})`, { filename: file }).runInContext(context);
    execute(module.exports, requireMock, module);
    return module.exports;
  }
  if (endpoint) load(`supabase/functions/${endpoint}/index.ts`);
  return {
    endpoint, load, calls, writes, emails, sessions, logs, stripe,
    invoke(body = {}, { method = 'POST', authorization = 'Bearer fixture-token' } = {}) {
      assert.equal(typeof handler, 'function', 'The real endpoint must register Deno.serve');
      const headers = { 'Content-Type': 'application/json', 'stripe-signature': 'fixture-signature' };
      if (authorization) headers.Authorization = authorization;
      return handler(new Request(`https://billing-fixture.example/${endpoint}`, {
        method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }));
    },
  };
}
const catalog = fixture().load('supabase/functions/_shared/boostCatalog.ts');
// Execute the Deno-compatible email suite unchanged, including its mocked send.
fixture().load('supabase/functions/_shared/boost-admin-email.test.ts');

const checkoutBody = plan => ({
  environment: 'live', priceId: plan.lookupKey, returnUrl: 'https://askarc.chat/upgrade?checkout=success',
});
const stripeCalls = (f, name) => f.calls.filter(([kind]) => kind === name).map(([, value]) => value);
const noCheckout = f => {
  assert.equal(f.sessions.length, 0, 'Rejected requests must not create a Stripe checkout session');
  assert.equal(f.writes.length, 0, 'Rejected requests must not write subscription state');
  assert.equal(f.emails.length, 0, 'Rejected requests must not send activation emails');
};
async function expectBlocked(f, body = checkoutBody(MONTHLY)) {
  const response = await f.invoke(body);
  const json = await response.json();
  assert.equal(response.status, 409, JSON.stringify(json));
  assert.equal(json.code, 'boost_subscription_exists');
  assert.match(json.error, /existing subscription.*current price/i);
  noCheckout(f);
}
function assertStoredSubscription(f, sub, expectedPrice, environment = 'live') {
  assert.equal(f.writes.length, 1);
  const { table, method, row, args } = f.writes[0];
  const item = sub.items.data[0];
  assert.equal(table, 'subscriptions'); assert.equal(method, 'upsert');
  assert.deepEqual(args, { onConflict: f.endpoint === 'create-checkout' ? 'user_id' : 'stripe_subscription_id' });
  assert.equal(row.user_id, OWNER.id); assert.equal(row.stripe_subscription_id, sub.id);
  assert.equal(row.price_id, expectedPrice); assert.equal(row.status, sub.status);
  assert.equal(row.current_period_start, iso(item.current_period_start ?? sub.current_period_start));
  assert.equal(row.current_period_end, iso(item.current_period_end ?? sub.current_period_end));
  assert.equal(row.cancel_at_period_end, sub.cancel_at_period_end === true);
  assert.equal(row.environment, environment); assert.equal(row.updated_at, new Date(NOW).toISOString());
}

test('Public offers are exactly the approved $15 monthly and $115 annual new-only keys', () => {
  assert.deepEqual(plain(catalog.BOOST_CHECKOUT_PLANS), { monthly: MONTHLY, annual: ANNUAL });
  assert.equal(catalog.BOOST_STRIPE_PRODUCT_ID, PRODUCT);
  assert.equal(catalog.BOOST_TRIAL_PERIOD_DAYS, 7);
  assert.deepEqual(plain(catalog.GOOGLE_PLAY_BOOST_PRODUCT_IDS), {
    monthly: 'arcai_boost_monthly', annual: 'arcai_boost_annual',
  }, 'Stripe repricing must not change Google Play SKUs');
  for (const plan of [MONTHLY, ANNUAL]) assert.deepEqual(plain(catalog.getBoostCheckoutPlan(plan.lookupKey)), plan);
  for (const priceId of [...LEGACY.map(([id]) => id), MONTHLY.livePriceId, ANNUAL.livePriceId, 'price_unknown', null, {}, 15]) {
    assert.equal(catalog.getBoostCheckoutPlan(priceId), null, `${JSON.stringify(priceId)} is not a new public offer`);
  }
});

test('Every old and new billing identity retains its interval and entitlement alias', () => {
  for (const [identity, expected, interval, amount] of IDENTITIES) {
    assert.equal(catalog.isBoostPriceId(identity), true, identity);
    assert.equal(catalog.boostBillingInterval(identity), interval === 'month' ? 'monthly' : 'annual', identity);
    assert.equal(catalog.resolveBoostPriceId(identityPrice([identity, expected, interval, amount])), expected, identity);
    assert.equal(catalog.resolveBoostPriceId({ metadata: { lovable_external_id: identity } }), expected, identity);
    assert.equal(catalog.currentBoostCheckoutPriceId(identity), interval === 'month' ? MONTHLY.lookupKey : ANNUAL.lookupKey);
  }
});

test('Verified same-product zero and inactive legacy prices remain entitlements; unrelated identities do not', () => {
  for (const product of [PRODUCT, { id: PRODUCT }]) {
    const price = livePrice(MONTHLY, { id: 'price_legacy_zero', lookup_key: null, product, unit_amount: 0, active: false });
    assert.equal(catalog.resolveBoostPriceId(price), 'arcai_boost_monthly');
    assert.equal(catalog.resolveBoostPriceId({ ...price, recurring: { interval: 'year', interval_count: 1 } }), 'arcai_boost_annual');
  }
  for (const value of [undefined, null, '', 15, {}, [], 'toString', 'constructor', '__proto__', 'price_unrelated']) {
    assert.equal(catalog.isBoostPriceId(value), false);
    assert.equal(catalog.boostBillingInterval(value), null);
  }
  for (const price of [null, {}, { id: 'price_unrelated', lookup_key: 'other_subscription', product: 'prod_other' },
    { product: PRODUCT, recurring: { interval: 'week', interval_count: 1 } },
    { product: PRODUCT, recurring: { interval: 'month', interval_count: 2 } }]) {
    assert.equal(catalog.resolveBoostPriceId(price), null);
  }
});

const invalidPriceCases = [
  ['amount', { unit_amount: 1000 }], ['currency', { currency: 'eur' }],
  ['interval', { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }],
  ['interval count', { recurring: { interval: 'month', interval_count: 2, usage_type: 'licensed' } }],
  ['inactive', { active: false }], ['one-time type', { type: 'one_time' }],
  ['product', { product: 'prod_unrelated' }], ['missing product', { product: null }],
  ['actual price ID', { id: 'price_unexpected' }], ['missing price ID', { id: undefined }],
  ['lookup key', { lookup_key: 'arcai_boost_monthly' }],
  ['metered usage', { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } }],
  ['missing usage', { recurring: { interval: 'month', interval_count: 1 } }],
  ['missing recurrence', { recurring: null }],
];
test('Checkout validation checks exact amount, currency, recurrence, status, product, ID and licensed usage', () => {
  for (const plan of [MONTHLY, ANNUAL]) {
    catalog.assertBoostCheckoutPrice(livePrice(plan), plan, 'live');
    catalog.assertBoostCheckoutPrice(livePrice(plan, { product: { id: PRODUCT } }), plan, 'live');
  }
  for (const [label, overrides] of invalidPriceCases) {
    assert.throws(() => catalog.assertBoostCheckoutPrice(livePrice(MONTHLY, overrides), MONTHLY, 'live'), /pricing is not ready/, label);
  }
});

test('Existing subscription states block duplicate checkout, including future canceled periods', () => {
  for (const status of ['active', 'trialing', 'past_due', 'paused', 'unpaid', 'incomplete']) {
    assert.equal(catalog.boostSubscriptionBlocksNewCheckout(status, null, NOW), true, status);
  }
  for (const end of [FUTURE, iso(FUTURE)]) assert.equal(catalog.boostSubscriptionBlocksNewCheckout('canceled', end, NOW), true);
  for (const end of [EXPIRED, NOW / 1000, iso(EXPIRED), null, 'invalid']) {
    assert.equal(catalog.boostSubscriptionBlocksNewCheckout('canceled', end, NOW), false);
  }
  for (const status of [null, undefined, 'incomplete_expired', 'unknown']) {
    assert.equal(catalog.boostSubscriptionBlocksNewCheckout(status, FUTURE, NOW), false);
  }
});

test('Actual checkout uses each exact live price in hosted subscription mode with one first-time trial', async () => {
  for (const plan of [MONTHLY, ANNUAL]) {
    const f = fixture('create-checkout');
    const response = await f.invoke({ ...checkoutBody(plan), userId: 'ignored_body_user', email: 'ignored@example.test' });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.com/c/pay/cs_fixture' });
    assert.equal(f.sessions.length, 1);
    const session = f.sessions[0];
    assert.deepEqual(session.line_items, [{ price: plan.livePriceId, quantity: 1 }]);
    assert.equal(session.mode, 'subscription'); assert.equal(session.customer, 'cus_fixture');
    assert.equal(session.success_url, checkoutBody(plan).returnUrl); assert.equal(session.cancel_url, 'https://askarc.chat/upgrade');
    assert.equal(session.ui_mode, undefined); assert.equal(session.allow_promotion_codes, true);
    assert.deepEqual(session.metadata, { userId: OWNER.id });
    assert.deepEqual(session.subscription_data, {
      metadata: { userId: OWNER.id }, trial_period_days: 7,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    });
    assert.equal(session.payment_method_collection, 'always');
    assert.deepEqual(stripeCalls(f, 'prices.list'), [{ lookup_keys: [plan.lookupKey], active: true, limit: 2 }]);
    assert.deepEqual(stripeCalls(f, 'subscriptions.list'), [{ customer: 'cus_fixture', status: 'all', limit: 100 }]);
    assert.deepEqual(stripeCalls(f, 'customers.search'), [{ query: `metadata['userId']:'${OWNER.id}'`, limit: 1 }]);
    assert.equal(f.writes.length, 0); assert.equal(f.emails.length, 0);
  }
});

test('Old displayed offers and every raw known price require refresh with zero checkout writes', async () => {
  for (const priceId of [...LEGACY.map(([id]) => id), MONTHLY.livePriceId, ANNUAL.livePriceId]) {
    const f = fixture('create-checkout');
    const response = await f.invoke({ ...checkoutBody(MONTHLY), priceId });
    const json = await response.json();
    assert.equal(response.status, 200, `${priceId}: old clients need a readable logical error payload`);
    assert.equal(json.code, 'boost_pricing_changed'); assert.match(json.error, /refresh.*current price/i);
    assert.equal(json.url, undefined); assert.equal(json.clientSecret, undefined);
    noCheckout(f); assert.equal(stripeCalls(f, 'createStripeClient').length, 0);
  }
  for (const priceId of [null, {}, 1500, 'price_unrelated', 'arcai_boost_monthly_typo']) {
    const f = fixture('create-checkout');
    const response = await f.invoke({ ...checkoutBody(MONTHLY), priceId });
    assert.equal(response.status, 400); assert.equal((await response.json()).code, 'invalid_price'); noCheckout(f);
  }
});

test('Actual checkout stops before session or customer mutation when the Stripe price differs', async () => {
  for (const [label, overrides] of invalidPriceCases) {
    const f = fixture('create-checkout', { prices: [livePrice(MONTHLY, overrides)] });
    const response = await f.invoke(checkoutBody(MONTHLY));
    const json = await response.json();
    assert.equal(response.status, 400, label); assert.match(json.error, /pricing is not ready/, label);
    noCheckout(f); assert.equal(stripeCalls(f, 'customers.search').length, 0, label);
  }
  for (const prices of [[], [livePrice(), livePrice()]]) {
    const f = fixture('create-checkout', { prices });
    const response = await f.invoke(checkoutBody(MONTHLY));
    assert.equal(response.status, 400); assert.match((await response.json()).error, /pricing is not ready/); noCheckout(f);
  }
});

test('Every grandfathered and current database identity blocks a second subscription in recoverable states', async () => {
  for (const [price_id] of IDENTITIES) {
    for (const status of ['active', 'trialing', 'past_due', 'paused', 'unpaid', 'incomplete', 'canceled']) {
      const f = fixture('create-checkout', { dbSubscriptions: [dbSubscription({ price_id, status })] });
      await expectBlocked(f);
      assert.equal(stripeCalls(f, 'createStripeClient').length, 0);
    }
  }
  await expectBlocked(fixture('create-checkout', {
    dbSubscriptions: [dbSubscription({ price_id: 'price_legacy_zero', product_id: PRODUCT })],
  }));
});

test('Actual Stripe history blocks duplicate checkout for all legacy and new recoverable subscriptions', async () => {
  for (const identity of IDENTITIES) {
    for (const status of ['active', 'trialing', 'past_due', 'paused', 'unpaid', 'incomplete', 'canceled']) {
      const sub = frozen(subscription(identityPrice(identity), { status }));
      const before = plain(sub);
      const f = fixture('create-checkout', { stripeSubscriptions: [sub] });
      await expectBlocked(f); assert.deepEqual(plain(sub), before, 'Existing Stripe subscription must stay unchanged');
    }
  }
  const zero = livePrice(MONTHLY, { id: 'price_legacy_zero', lookup_key: null, unit_amount: 0, active: false });
  await expectBlocked(fixture('create-checkout', { stripeSubscriptions: [subscription(zero)] }));
});

test('Expired canceled history permits the selected new price without repeating the trial', async () => {
  const endedSub = subscription(identityPrice(LEGACY[2]), {
    status: 'canceled', current_period_end: EXPIRED,
    items: { data: [{ price: identityPrice(LEGACY[2]), current_period_start: START, current_period_end: EXPIRED }] },
  });
  for (const options of [
    { dbSubscriptions: [dbSubscription({ status: 'canceled', current_period_end: iso(EXPIRED) })] },
    { stripeSubscriptions: [endedSub] },
    { dbSubscriptions: [dbSubscription({ status: 'incomplete_expired', current_period_end: iso(EXPIRED) })] },
    { stripeSubscriptions: [subscription(identityPrice(LEGACY[3]), { status: 'incomplete_expired' })] },
  ]) {
    const f = fixture('create-checkout', options);
    const response = await f.invoke(checkoutBody(ANNUAL));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.deepEqual(f.sessions[0].line_items, [{ price: ANNUAL.livePriceId, quantity: 1 }]);
    assert.deepEqual(f.sessions[0].subscription_data, { metadata: { userId: OWNER.id } });
    assert.equal(f.sessions[0].payment_method_collection, undefined);
    assert.equal(f.writes.length, 0); assert.equal(f.emails.length, 0);
  }
});

test('Stripe history pagination reaches later grandfathered subscriptions even with old database history', async () => {
  const first = subscription(identityPrice(LEGACY[2]), { id: 'sub_first', status: 'incomplete_expired' });
  const f = fixture('create-checkout', {
    dbSubscriptions: [dbSubscription({ status: 'incomplete_expired' })],
    historyPages: [{ data: [first], has_more: true }, { data: [subscription()], has_more: false }],
  });
  await expectBlocked(f);
  assert.deepEqual(stripeCalls(f, 'subscriptions.list'), [
    { customer: 'cus_fixture', status: 'all', limit: 100 },
    { customer: 'cus_fixture', status: 'all', limit: 100, starting_after: 'sub_first' },
  ]);
});

test('Completed multi-page subscription history does not offer a repeat trial', async () => {
  const pages = ['sub_first', 'sub_second', 'sub_third'].map((id, index) => ({
    data: [subscription(identityPrice(LEGACY[2]), { id, status: 'incomplete_expired' })], has_more: index < 2,
  }));
  const f = fixture('create-checkout', { historyPages: pages });
  const response = await f.invoke(checkoutBody(MONTHLY));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(stripeCalls(f, 'subscriptions.list').length, 3);
  assert.equal(f.sessions[0].subscription_data.trial_period_days, undefined);
});

test('Failed database, Play or paginated Stripe history stops checkout instead of granting a trial', async () => {
  const first = subscription(identityPrice(LEGACY[2]), { id: 'sub_first', status: 'incomplete_expired' });
  for (const options of [
    { dbError: { message: 'Fixture database unavailable' } },
    { playError: { message: 'Fixture Play lookup unavailable' } },
    { historyErrorAt: 0 },
    { historyPages: [{ data: [first], has_more: true }], historyErrorAt: 1 },
    { historyPages: [{ data: [], has_more: true }] },
    { historyPages: [{ data: [first], has_more: true }, { data: [first], has_more: true }] },
  ]) {
    const f = fixture('create-checkout', options);
    const response = await f.invoke(checkoutBody(MONTHLY));
    assert.equal(response.status, 400); noCheckout(f);
  }
});

test('Current Google Play receipts block duplicate Stripe subscriptions; expired receipts do not', async () => {
  for (const subscription_state of ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']) {
    const f = fixture('create-checkout', {
      playSubscriptions: [{ user_id: OWNER.id, subscription_state, expiry_time: iso(FUTURE) }],
    });
    await expectBlocked(f); assert.equal(stripeCalls(f, 'createStripeClient').length, 0);
  }
  const f = fixture('create-checkout', {
    playSubscriptions: [{ user_id: OWNER.id, subscription_state: 'SUBSCRIPTION_STATE_CANCELED', expiry_time: iso(EXPIRED) }],
  });
  const response = await f.invoke(checkoutBody(MONTHLY));
  assert.equal(response.status, 200); assert.equal(f.sessions.length, 1);
});

test('Database duplicate checks remain scoped to the verified caller and selected billing environment', async () => {
  const f = fixture('create-checkout', { dbSubscriptions: [
    dbSubscription({ user_id: 'another_user' }), dbSubscription({ environment: 'sandbox' }),
  ] });
  const response = await f.invoke(checkoutBody(MONTHLY));
  assert.equal(response.status, 200); assert.equal(f.sessions.length, 1);
  const reads = stripeCalls(f, 'db.read');
  assert.deepEqual(reads.find(({ table }) => table === 'subscriptions').filters, [['user_id', OWNER.id], ['environment', 'live']]);
  assert.deepEqual(reads.find(({ table }) => table === 'google_play_subscriptions').filters, [['user_id', OWNER.id]]);
});

test('Unrelated Stripe subscriptions do not become Boost or block a new Boost plan but remain trial history', async () => {
  const unrelated = subscription(livePrice(MONTHLY, { id: 'price_unrelated', lookup_key: 'other', product: 'prod_other' }));
  const f = fixture('create-checkout', {
    stripeSubscriptions: [unrelated],
    dbSubscriptions: [dbSubscription({ price_id: 'price_unrelated', product_id: 'prod_other' })],
  });
  const response = await f.invoke(checkoutBody(MONTHLY));
  assert.equal(response.status, 200); assert.equal(f.sessions.length, 1);
  assert.equal(f.sessions[0].subscription_data.trial_period_days, undefined);
});

test('Completed old and new sessions preserve the actual subscription identity, status, periods and cancel flag', async () => {
  for (const [identity, expectedPrice, interval, amount] of IDENTITIES) {
    for (const status of ['active', 'trialing', 'past_due', 'canceled']) {
      const sub = subscription(identityPrice([identity, expectedPrice, interval, amount]), {
        id: `sub_existing_${identity}`, status, cancel_at_period_end: true,
      });
      const f = fixture('create-checkout', { session: completedSession(sub, { customer: { id: 'cus_fixture' } }) });
      const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
      const json = await response.json();
      assert.equal(response.status, 200, JSON.stringify(json));
      assert.deepEqual(json, { success: true, status: 'complete', subscriptionStatus: status });
      assertStoredSubscription(f, sub, expectedPrice);
      assert.equal(f.writes[0].row.stripe_customer_id, 'cus_fixture');
      assert.equal(f.writes[0].row.product_id, PRODUCT);
      assert.equal(f.sessions.length, 0); assert.equal(f.emails.length, 2);
      assert.equal(f.emails[0].idempotencyKey, `boost-upgraded:${OWNER.id}:${sub.id}`);
      assert.equal(f.emails[1].idempotencyKey, `admin-boost-upgraded:${sub.id}`);
    }
  }
});

test('Completed same-product zero-price legacy sessions retain entitlement and actual period dates', async () => {
  const price = livePrice(MONTHLY, { id: 'price_grandfathered_free', lookup_key: null, unit_amount: 0, active: false, product: { id: PRODUCT } });
  const sub = subscription(price, { items: { data: [{ price }] }, cancel_at_period_end: false });
  const f = fixture('create-checkout', { session: completedSession(sub) });
  const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
  assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
  assertStoredSubscription(f, sub, 'arcai_boost_monthly');
});

test('Expired canceled and non-entitled subscriptions verify as unsuccessful without fabricated grants', async () => {
  for (const status of ['canceled', 'paused', 'unpaid', 'incomplete', 'incomplete_expired', 'unknown_status']) {
    const price = identityPrice(LEGACY[4]);
    const sub = subscription(price, { status, cancel_at_period_end: true,
      items: { data: [{ price, current_period_start: START, current_period_end: EXPIRED }] },
    });
    const f = fixture('create-checkout', { session: completedSession(sub) });
    const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
    const json = await response.json();
    assert.equal(response.status, 200); assert.equal(json.success, false); assert.equal(json.subscriptionStatus, status);
    assertStoredSubscription(f, sub, 'arcai_boost_monthly');
    assert.equal(f.emails.length, 0); assert.equal(f.sessions.length, 0);
  }
});

test('Missing, unexpanded or unrelated subscriptions cannot manufacture a verified Boost grant', async () => {
  for (const sub of [
    null, 'sub_unexpanded', {}, subscription(undefined, { id: undefined }),
    subscription(undefined, { status: undefined }), subscription(undefined, { items: { data: [] } }),
    subscription(livePrice(MONTHLY, { id: 'price_unrelated', lookup_key: 'other', product: 'prod_other' })),
    subscription(livePrice(MONTHLY, { product: null })),
  ]) {
    const f = fixture('create-checkout', { session: completedSession(sub) });
    const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
    const json = await response.json();
    assert.equal(response.status, 200); assert.equal(json.success, false, JSON.stringify(sub));
    assert.match(json.error, /verified Boost subscription was not found/); noCheckout(f);
  }
});

test('Unpaid open sessions stay pending and completed owner mismatches return 403 without writes', async () => {
  const pending = fixture('create-checkout', { session: completedSession(subscription(), { status: 'open', payment_status: 'unpaid' }) });
  const pendingResponse = await pending.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
  assert.equal(pendingResponse.status, 200); assert.deepEqual(await pendingResponse.json(), { success: false, status: 'open' });
  noCheckout(pending);
  for (const session of [
    completedSession(subscription(), { metadata: { userId: 'another_user' } }),
    completedSession(subscription(), { metadata: {} }),
    completedSession(subscription(undefined, { metadata: { userId: 'another_user' } })),
  ]) {
    const f = fixture('create-checkout', { session });
    const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
    assert.equal(response.status, 403); assert.match((await response.json()).error, /does not belong/); noCheckout(f);
  }
});

test('Failed persistence cannot return verified success or send activation emails', async () => {
  const f = fixture('create-checkout', { writeError: { message: 'Fixture database failed' } });
  const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /Failed to verify Boost/);
  assert.equal(f.writes.length, 1); assert.equal(f.emails.length, 0); assert.equal(f.sessions.length, 0);
});

test('Stale checkout verification cannot replace a different current Boost subscription in any environment', async () => {
  for (const environment of ['live', 'sandbox']) {
    for (const status of ['active', 'trialing', 'past_due', 'paused', 'unpaid', 'incomplete', 'canceled']) {
      const f = fixture('create-checkout', { dbSubscriptions: [dbSubscription({
        stripe_subscription_id: 'sub_newer_current', price_id: ANNUAL.lookupKey, environment, status,
      })] });
      const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
      const json = await response.json();
      assert.equal(response.status, 200); assert.equal(json.success, false);
      assert.match(json.error, /older checkout.*current subscription is unchanged/i);
      noCheckout(f);
      assert.deepEqual(stripeCalls(f, 'db.read').find(({ table }) => table === 'subscriptions').filters, [['user_id', OWNER.id]]);
    }
  }
  const sameProduct = fixture('create-checkout', { dbSubscriptions: [dbSubscription({
    stripe_subscription_id: 'sub_newer_zero_price', price_id: 'price_legacy_zero', product_id: PRODUCT,
  })] });
  const response = await sameProduct.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
  assert.equal((await response.json()).success, false); noCheckout(sameProduct);
});

test('Current subscription verification and expired history remain verifiable without replacing live state', async () => {
  const sub = subscription();
  for (const previous of [
    dbSubscription(),
    dbSubscription({ stripe_subscription_id: 'sub_ended', status: 'canceled', current_period_end: iso(EXPIRED) }),
    dbSubscription({ stripe_subscription_id: 'sub_unrelated', price_id: 'price_unrelated', product_id: 'prod_other' }),
  ]) {
    const f = fixture('create-checkout', { session: completedSession(sub), dbSubscriptions: [previous] });
    const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
    assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    assertStoredSubscription(f, sub, 'arcai_boost_monthly');
  }
});

test('Failed current-subscription lookup stops verification before upsert or success email', async () => {
  const f = fixture('create-checkout', { dbError: { message: 'Fixture current-subscription lookup failed' } });
  const response = await f.invoke({ action: 'verify', sessionId: 'cs_fixture', environment: 'live' });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /Could not verify your current subscription/);
  noCheckout(f);
});

test('Unauthenticated and non-admin sandbox requests cannot open checkout', async () => {
  const anonymous = fixture('create-checkout', { user: null });
  assert.equal((await anonymous.invoke(checkoutBody(MONTHLY), { authorization: null })).status, 401); noCheckout(anonymous);
  const sandbox = fixture('create-checkout');
  assert.equal((await sandbox.invoke({ ...checkoutBody(MONTHLY), environment: 'sandbox' })).status, 403); noCheckout(sandbox);
});

test('Actual webhook preserves every old and new billing identity without changing a Stripe subscription', async () => {
  for (const [identity, expectedPrice, interval, amount] of IDENTITIES) {
    for (const type of ['customer.subscription.created', 'customer.subscription.updated']) {
      const sub = subscription(identityPrice([identity, expectedPrice, interval, amount]), {
        id: `sub_webhook_${identity}`, status: 'active', cancel_at_period_end: true,
      });
      const f = fixture('payments-webhook', { event: { type, data: { object: sub } } });
      const response = await f.invoke({ livemode: true });
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { received: true });
      assertStoredSubscription(f, sub, expectedPrice);
      assert.equal(f.writes[0].row.stripe_customer_id, sub.customer);
      assert.equal(f.writes[0].row.product_id, PRODUCT);
      assert.deepEqual(stripeCalls(f, 'verifyWebhook'), ['live']);
      assert.equal(f.sessions.length, 0); assert.equal(stripeCalls(f, 'createStripeClient').length, 0);
      assert.equal(f.emails.length, type === 'customer.subscription.created' ? 2 : 0);
    }
  }
});

test('Webhook renewal data retains grandfathered zero-price periods and inactive subscription status', async () => {
  const price = livePrice(MONTHLY, { id: 'price_legacy_zero', lookup_key: null, unit_amount: 0, active: false });
  for (const status of ['trialing', 'past_due', 'paused', 'unpaid', 'incomplete', 'canceled']) {
    const sub = subscription(price, { status, cancel_at_period_end: true, items: { data: [{ price }] } });
    const f = fixture('payments-webhook', { event: { type: 'customer.subscription.updated', data: { object: sub } } });
    const response = await f.invoke({ livemode: true });
    assert.equal(response.status, 200); assertStoredSubscription(f, sub, 'arcai_boost_monthly');
    assert.equal(f.emails.length, 0);
  }
});

test('Webhook subscription deletion is confined to the actual ID and environment', async () => {
  const sub = subscription(undefined, { cancel_at_period_end: true });
  const f = fixture('payments-webhook', { event: { type: 'customer.subscription.deleted', data: { object: sub } } });
  assert.equal((await f.invoke({ livemode: true })).status, 200);
  assert.deepEqual(f.writes, [{
    table: 'subscriptions', method: 'update',
    row: { status: 'canceled', cancel_at_period_end: true, updated_at: new Date(NOW).toISOString() },
    filters: [['stripe_subscription_id', sub.id], ['environment', 'live']],
  }]);
  assert.equal(f.emails.length, 0); assert.equal(f.sessions.length, 0);
});

test('Webhook write failures return retryable failure and do not send success emails', async () => {
  const f = fixture('payments-webhook', {
    event: { type: 'customer.subscription.created', data: { object: subscription() } },
    writeError: { message: 'Fixture persistence failure' },
  });
  const response = await f.invoke({ livemode: true });
  assert.equal(response.status, 400); assert.equal(await response.text(), 'Webhook error');
  assert.equal(f.emails.length, 0); assert.equal(f.sessions.length, 0);
});

test('Neither billing handler exposes Stripe subscription mutation or subscription-item replacement', () => {
  for (const path of ['supabase/functions/create-checkout/index.ts', 'supabase/functions/payments-webhook/index.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\.subscriptions\s*\.\s*(?:update|cancel|create)\s*\(/, path);
    assert.doesNotMatch(source, /\.subscriptionItems\s*\.\s*(?:update|del|create)\s*\(/, path);
  }
  assert.equal('update' in fixture().stripe.subscriptions, false,
    'Offline transport intentionally provides no subscription mutation endpoint');
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack ?? error}`); }
}
console.log(`${tests.length - failures}/${tests.length} Boost billing functional regression groups passed; all Stripe, Supabase and email I/O mocked.`);
process.exitCode = failures ? 1 : 0;
