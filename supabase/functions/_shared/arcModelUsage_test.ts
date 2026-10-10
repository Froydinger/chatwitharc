import { deepStrictEqual, equal, ok, rejects, throws } from 'node:assert/strict';
import { ARC_LUNA, ARC_SOL, ARC_ASTRA, resolveArcModelRoute } from './arcModelRouting.ts';
import { prepareArcModelUsage, prepareDurableArcModelUsage } from './arcModelUsage.ts';

function fixture(options: { denied?: string[]; error?: string[]; replayed?: boolean; reserved?: number;
  enforcement?: boolean; configured?: boolean; admin?: boolean; recordError?: boolean } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = { async rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (options.error?.includes(String(args.model_name))) return { data: null, error: new Error('private DB diagnostic') };
    if (name === 'reserve_arc_usage') return { error: null, data: {
      allowed: !options.denied?.includes(String(args.model_name)), reservationId: 'reservation',
      replayed: options.replayed ?? false, enforcementEnabled: options.enforcement ?? true,
      configured: options.configured ?? true, adminUncapped: options.admin ?? false, cumulativeCostNanos: 0,
      reservedNanos: options.reserved ?? args.requested_nanos,
    } };
    if (options.recordError) return { error: new Error('private receipt diagnostic'), data: null };
    return { error: null, data: { revision: 1, cumulativeCostNanos: args.cumulative_nanos,
      replayed: false, enforcementEnabled: true } };
  } };
  return { db, calls, records: () => calls.filter(call => call.name === 'record_arc_usage') };
}
const request = { modelSelection: ARC_SOL, messages: [{ role: 'user', content: 'Draft a short letter.' }] };
const route = resolveArcModelRoute({ selection: ARC_SOL, task: 'write' });
const options = { user: { id: 'owner' }, requestId: 'submission', request, route, source: 'fixture' };

Deno.test('staged premium policies fall back to Luna before any provider starts', async () => {
  for (const policy of [{ enforcement: false }, { configured: false }]) {
    const f = fixture(policy);
    const usage = await prepareArcModelUsage({ ...options, db: f.db });
    equal(usage.route.model, ARC_LUNA); ok(usage.notice?.includes('being updated'));
    deepStrictEqual(f.calls.filter(call => call.name === 'reserve_arc_usage').map(call => call.args.model_name), [ARC_SOL, ARC_LUNA]);
    equal(f.records().length, 1); equal(f.records()[0].args.cumulative_nanos, 0);
    equal(f.records()[0].args.is_final, true);
    equal((f.records()[0].args.usage_detail as Record<string, unknown>).reason, 'premium-policy-not-active');
  }
});

Deno.test('staging never relabels an existing provider, blocks admin metering, or refunds a replay', async () => {
  for (const preserved of [{ admin: true }, { resume: true }]) {
    const f = fixture({ enforcement: false, configured: false, ...preserved });
    const usage = await prepareArcModelUsage({ ...options, ...preserved, db: f.db });
    equal(usage.route.model, ARC_SOL); equal(f.records().length, 0);
  }
  const replay = fixture({ enforcement: false, replayed: true });
  await rejects(() => prepareArcModelUsage({ ...options, db: replay.db }), /already started/);
  equal(replay.records().length, 0); equal(replay.calls.length, 1);
});

Deno.test('premium exhaustion reserves only a fresh Luna fallback with honest route metadata', async () => {
  const f = fixture({ denied: [ARC_SOL] });
  const usage = await prepareArcModelUsage({ ...options, db: f.db });
  equal(usage.route.model, ARC_LUNA); ok(usage.notice?.includes('GPT 6 Luna'));
  deepStrictEqual(f.calls.map(call => call.args.model_name), [ARC_SOL, ARC_LUNA]);
  equal(f.calls[1].args.attempt_key, 'fixture:fallback-luna');
  ok(!JSON.stringify(f.calls).includes('Draft a short letter'));
});

Deno.test('Luna remains available during a ledger outage; premium fails closed', async () => {
  const f = fixture({ error: [ARC_SOL, ARC_LUNA] });
  await rejects(() => prepareArcModelUsage({ ...options, db: f.db }), /could not be checked/);
  const luna = await prepareArcModelUsage({ ...options, db: f.db,
    route: resolveArcModelRoute({ selection: ARC_LUNA, task: 'chat' }) });
  equal(luna.route.model, ARC_LUNA); equal(luna.ticket, null);
});

Deno.test('ambiguous replay never starts a second paid POST or refunds its hold', async () => {
  const f = fixture({ replayed: true });
  const usage = await prepareArcModelUsage({ ...options, db: f.db });
  throws(() => usage.ticket!.assertNewProviderAttempt(), /already started/);
  await usage.ticket!.releaseIfNotStarted(); equal(f.records().length, 0);
  await rejects(() => usage.ticket!.confirmZero('new-validation-result'), /already started/);
  equal(f.records().length, 0);
});

Deno.test('completed durable persistence retries create no fresh usage reservation', async () => {
  const f = fixture();
  const run = { id: 'done', request, checkpoint: { engine: { phase: 'done' }, modelRoute: route } };
  const usage = await prepareDurableArcModelUsage({ ...options, db: f.db, run });
  equal(usage.ticket, null); equal(f.calls.length, 0); equal(usage.route.model, ARC_SOL);
});

Deno.test('legacy unknown provider intent cannot be refunded by a new worker lease', async () => {
  const f = fixture();
  const run = { id: 'unknown', request, checkpoint: { engine: { phase: 'model', modelIntent: 'unknown-post' } } };
  const usage = await prepareDurableArcModelUsage({ ...options, db: f.db, run });
  await usage.ticket!.releaseIfNotStarted(); equal(f.records().length, 0);
});

Deno.test('effective multimodal provider input is fingerprinted without storing content', async () => {
  const f = fixture();
  await prepareArcModelUsage({ ...options, db: f.db, providerInput: [{ image: 'data:image/png;base64,AAA' }] });
  await prepareArcModelUsage({ ...options, db: f.db, providerInput: [{ image: 'data:application/pdf;base64,AAA' }] });
  ok(f.calls[0].args.request_fingerprint !== f.calls[1].args.request_fingerprint);
  ok(!JSON.stringify(f.calls).includes('data:'));
});

Deno.test('missing usage retains a started hold; confirmed no-provider work releases once', async () => {
  const f = fixture(); const usage = await prepareArcModelUsage({ ...options, db: f.db });
  usage.ticket!.assertNewProviderAttempt();
  await usage.ticket!.observe(undefined, true, 'provider');
  await usage.ticket!.releaseIfNotStarted(); equal(f.records().length, 0);
  const fresh = await prepareArcModelUsage({ ...options, db: f.db, requestId: 'not-started' });
  await fresh.ticket!.releaseIfNotStarted();
  equal(f.records()[0].args.cumulative_nanos, 0); equal(f.records()[0].args.is_final, true);
});

Deno.test('a final receipt failure retains its hold without discarding a completed response', async () => {
  const f = fixture({ recordError: true });
  const usage = await prepareArcModelUsage({ ...options, db: f.db });
  usage.ticket!.assertNewProviderAttempt();
  await usage.ticket!.observe({ total_tokens: 100 }, true, 'finished');
  await usage.ticket!.releaseIfNotStarted();
  equal(f.records().length, 1); equal(f.records()[0].args.cumulative_nanos, 1_000_000);
  await rejects(() => usage.ticket!.observe({ total_tokens: 120 }, false, 'working'), /could not be saved/);
});

Deno.test('final precise provider usage can replace a conservative checkpoint atomically', async () => {
  const f = fixture(); const usage = await prepareArcModelUsage({ ...options, db: f.db });
  await usage.ticket!.observeSession({ total_tokens: 100 }, false, 'session');
  await usage.ticket!.observeSession({ total_tokens: 100 }, false, 'session');
  await usage.ticket!.observeSession({ input_tokens: 90, output_tokens: 10, total_tokens: 100, input_tokens_details: { cache_write_tokens: 0 } }, true, 'session');
  equal(f.records().length, 2);
  equal(f.records()[0].args.cumulative_nanos, 1_000_000);
  equal(f.records()[1].args.cumulative_nanos, 280_000);
  equal(f.records()[1].args.is_final, true);
  ok(!f.calls.some(call => call.name === 'reconcile_arc_usage'));
});

Deno.test('aggregate session long context is explicitly conservative, not falsely exact', async () => {
  const f = fixture(); const usage = await prepareArcModelUsage({ ...options, db: f.db });
  await usage.ticket!.observeSession({ input_tokens: 300_000, output_tokens: 10 }, true, 'session');
  equal((f.records()[0].args.usage_detail as Record<string, unknown>).basis, 'conservative-session-detail');
});

Deno.test('durable fallback stays Luna when the premium pool later replenishes', async () => {
  const f = fixture({ denied: [ARC_SOL] });
  const run = { id: 'run', request, checkpoint: {} as Record<string, unknown> };
  const first = await prepareDurableArcModelUsage({ ...options, db: f.db, run });
  equal(first.route.model, ARC_LUNA);
  run.checkpoint.engine = { agentSessionId: 'sess_existing' };
  const next = fixture({ replayed: true });
  const resumed = await prepareDurableArcModelUsage({ ...options, db: next.db, run });
  equal(resumed.route.model, ARC_LUNA); equal(next.calls[0].args.model_name, ARC_LUNA);
  equal(next.calls[0].args.attempt_key, 'fixture:fallback-luna');
  equal(resumed.notice, first.notice);
});

Deno.test('premium resume never silently relabels an already running provider as Luna', async () => {
  const f = fixture({ denied: [ARC_SOL] });
  await rejects(() => prepareArcModelUsage({ ...options, db: f.db, resume: true }), /reached its model allowance/);
  equal(f.calls.length, 1);
});

Deno.test('bounded completion reserves uncached/cache-write input and long-context output', async () => {
  const f = fixture({ reserved: 2_000_000_000 });
  const usage = await prepareArcModelUsage({ ...options, db: f.db });
  const input = [{ role: 'user', content: 'x'.repeat(280_000) }];
  const limit = usage.ticket!.completionTokenLimit(input, 65_536);
  ok(limit > 0 && limit < 40_000);
  const small = fixture({ reserved: 10_000_000 });
  const astra = await prepareArcModelUsage({ ...options, db: small.db,
    route: resolveArcModelRoute({ selection: ARC_ASTRA, task: 'analysis', hasBoost: true }) });
  throws(() => astra.ticket!.completionTokenLimit(input, 1000), /too large/);
});
