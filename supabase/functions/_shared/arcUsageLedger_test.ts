import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { recordArcUsage, reconcileArcUsage, releaseArcUsage, reserveArcUsage } from './arcUsageLedger.ts';

function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    return Promise.resolve({ error: null, data: name === 'reserve_arc_usage'
      ? { allowed: true, enforcementEnabled: false, reservationId: 'reservation', reservedNanos: 59_999_999, cumulativeCostNanos: 0, revision: 0, replayed: false }
      : { enforcementEnabled: false, revision: 1, cumulativeCostNanos: 0, replayed: false } });
  } };
  return { db, calls };
}
Deno.test('usage adapter: exact server arguments and model-specific pools', async () => {
  const { db, calls } = fixture();
  for (const [model, pool] of [['gpt-6-luna','luna'],['gpt-6.1-sol','sol'],['gpt-6-astra','astra']]) {
    const result = await reserveArcUsage(db, { userId: 'owner', requestId: 'request', attemptId: 'attempt',
      source: 'chat', model, reserveNanos: 60_000_000, minimumReserveNanos: 10_000_000, clampToRemaining: true, fingerprint: 'hash' });
    equal(result.providerBudgetCents,5);
    deepStrictEqual(calls.at(-1), { name: 'reserve_arc_usage', args: {
      target_user_id: 'owner', request_key: 'request', attempt_key: 'attempt', source_name: 'chat', model_name: model,
      requested_nanos: 60_000_000, request_fingerprint: 'hash', pool_name: pool, minimum_nanos: 10_000_000, clamp_to_remaining: true,
    } });
  }
});
Deno.test('usage adapter: cumulative checkpoints and explicit zero release', async () => {
  const { db, calls } = fixture();
  await recordArcUsage(db, { userId: 'owner', reservationId: 'reservation', receiptId: 'r1', cumulativeCostNanos: 555_000,
    final: false, usage: { basis: 'provider-token-detail' } });
  equal(calls[0].args.cumulative_nanos,555_000);
  equal(calls[0].args.is_final,false);
  await releaseArcUsage(db,{ userId: 'owner', reservationId: 'reservation', receiptId: 'r2', reason: 'Provider was never called' });
  equal(calls[1].args.cumulative_nanos,0); equal(calls[1].args.is_final,true);
  equal((calls[1].args.usage_detail as Record<string,unknown>).basis,'confirmed-zero');
});
Deno.test('usage adapter: reconciliation carries revision and bounded explanation', async () => {
  const { db, calls } = fixture();
  await reconcileArcUsage(db,{ userId: 'owner', reservationId: 'reservation', receiptId: 'r3', expectedRevision: 4,
    authoritativeCostNanos: 400_000, reason: 'Final provider breakdown', usage: { rateVersion: 'test' } });
  equal(calls[0].name,'reconcile_arc_usage'); equal(calls[0].args.expected_revision,4);
  deepStrictEqual(calls[0].args.usage_detail,{ rateVersion: 'test', reason: 'Final provider breakdown' });
});
Deno.test('usage adapter: invalid or missing DB results fail closed', async () => {
  const args = { userId: 'owner', requestId: 'request', attemptId: 'attempt', source: 'chat', model: 'gpt-6.1-sol', reserveNanos: 10, fingerprint: 'hash' };
  for (const data of [null,{}, {allowed:true,reservedNanos:-1,enforcementEnabled:false}, {allowed:'true',reservedNanos:10,enforcementEnabled:false}]) {
    await rejects(reserveArcUsage({rpc:()=>Promise.resolve({data,error:null})},args));
  }
  await rejects(recordArcUsage({rpc:()=>Promise.resolve({data:{},error:null})}, {userId:'owner',reservationId:'reservation',receiptId:'receipt',cumulativeCostNanos:0,final:true}));
  await rejects(reserveArcUsage({rpc:()=>Promise.resolve({data:null,error:{message:'private SQL details'}})},args),/could not be verified/);
});
