import { arcProviderBudgetCents } from './arcUsageAccounting.ts';

export type ArcUsagePool = 'luna' | 'sol' | 'astra' | 'research' | 'images' | 'builder_images' | 'background';
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export type ArcUsageSnapshot = {
  enforcementEnabled: boolean;
  configured: boolean;
  tier: 'free' | 'boost' | 'admin';
  adminUncapped: boolean;
  pool: ArcUsagePool;
  daily: { spentNanos: number; reservedNanos: number; limitNanos: number | null; remainingNanos: number | null; usagePercent: number | null; resetsAt: string };
  monthly: { spentNanos: number; reservedNanos: number; limitNanos: number | null; remainingNanos: number | null; usagePercent: number | null; resetsAt: string };
};
export type ArcUsageReservation = ArcUsageSnapshot & {
  allowed: boolean;
  reservationId: string | null;
  replayed: boolean;
  reservedNanos: number;
  cumulativeCostNanos: number;
  providerBudgetCents: number;
  state?: 'reserved' | 'provisional' | 'settled';
  revision?: number;
};
export type ArcUsageRecord = ArcUsageSnapshot & {
  revision: number; cumulativeCostNanos: number; replayed: boolean; ignored?: boolean;
};

function usageRecord(data: Record<string, unknown>): ArcUsageRecord {
  if (typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 0
    || typeof data.cumulativeCostNanos !== 'number' || !Number.isSafeInteger(data.cumulativeCostNanos) || data.cumulativeCostNanos < 0
    || typeof data.replayed !== 'boolean' || typeof data.enforcementEnabled !== 'boolean') {
    throw new Error('Arc usage receipt was invalid.');
  }
  return data as ArcUsageRecord;
}

async function call(db: Rpc, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await db.rpc(name, args);
  if (result.error || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    // Never include provider payloads, SQL errors, credentials or prompts.
    throw new Error('Arc usage could not be verified. Please try again.');
  }
  return result.data as Record<string, unknown>;
}

export async function reserveArcUsage(db: Rpc, options: {
  userId: string;
  requestId: string;
  attemptId: string;
  source: string;
  model: string;
  reserveNanos: number;
  fingerprint: string;
  pool?: ArcUsagePool;
  minimumReserveNanos?: number;
  clampToRemaining?: boolean;
}): Promise<ArcUsageReservation> {
  const data = await call(db, 'reserve_arc_usage', {
    target_user_id: options.userId,
    request_key: options.requestId,
    attempt_key: options.attemptId,
    source_name: options.source,
    model_name: options.model,
    requested_nanos: options.reserveNanos,
    request_fingerprint: options.fingerprint,
    pool_name: options.pool ?? (options.model === 'gpt-6-luna' ? 'luna' : options.model === 'gpt-6.1-sol' ? 'sol' : options.model === 'gpt-6-astra' ? 'astra' : 'background'),
    minimum_nanos: options.minimumReserveNanos ?? 1,
    clamp_to_remaining: options.clampToRemaining ?? false,
  });
  if (typeof data.allowed !== 'boolean' || typeof data.enforcementEnabled !== 'boolean'
      || typeof data.reservedNanos !== 'number' || !Number.isSafeInteger(data.reservedNanos)
      || data.reservedNanos < 0 || (data.allowed && typeof data.reservationId !== 'string')) {
    throw new Error('Arc usage reservation was invalid.');
  }
  return { ...data, providerBudgetCents: arcProviderBudgetCents(data.reservedNanos) } as ArcUsageReservation;
}

export async function recordArcUsage(db: Rpc, options: {
  userId: string;
  reservationId: string;
  receiptId: string;
  cumulativeCostNanos: number;
  final: boolean;
  usage?: Record<string, unknown>;
}): Promise<ArcUsageRecord> {
  return usageRecord(await call(db, 'record_arc_usage', {
    target_user_id: options.userId,
    reservation_id: options.reservationId,
    receipt_key: options.receiptId,
    cumulative_nanos: options.cumulativeCostNanos,
    is_final: options.final,
    usage_detail: options.usage ?? {},
  }));
}

/** Only after confirming no provider spend occurred. An interrupted/unknown
 * provider POST is not permission to refund: leave that reservation pending. */
export async function releaseArcUsage(db: Rpc, options: {
  userId: string;
  reservationId: string;
  receiptId: string;
  reason: string;
}) {
  return await recordArcUsage(db, { ...options, cumulativeCostNanos: 0, final: true,
    usage: { basis: 'confirmed-zero', reason: options.reason } });
}

/** Replace a terminal estimate only with authoritative accounting evidence.
 * Revision fencing prevents two reconciliations overwriting one another. */
export async function reconcileArcUsage(db: Rpc, options: {
  userId: string;
  reservationId: string;
  receiptId: string;
  expectedRevision: number;
  authoritativeCostNanos: number;
  reason: string;
  usage?: Record<string, unknown>;
}): Promise<ArcUsageRecord> {
  return usageRecord(await call(db, 'reconcile_arc_usage', {
    target_user_id: options.userId, reservation_id: options.reservationId,
    receipt_key: options.receiptId, expected_revision: options.expectedRevision,
    authoritative_nanos: options.authoritativeCostNanos,
    usage_detail: { ...options.usage, reason: options.reason },
  }));
}
