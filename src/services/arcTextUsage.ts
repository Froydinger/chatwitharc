import { supabase } from '@/integrations/supabase/client';

export type TextUsagePool = 'sol' | 'astra';
export type TextUsageWindow = { usagePercent: number | null; resetsAt: string | null };
export type TextUsageSnapshot = {
  pool: TextUsagePool;
  tier: 'free' | 'boost' | 'admin';
  enforcementEnabled: boolean;
  configured: boolean;
  adminUncapped: boolean;
  daily: TextUsageWindow;
  monthly: TextUsageWindow;
};

type CacheEntry = { snapshot: TextUsageSnapshot | null; expiresAt: number; revision: number; pending?: Promise<TextUsageSnapshot | null> };
let activeOwner: string | null = null;
const cache = new Map<TextUsagePool, CacheEntry>();
const CACHE_MS = 30_000;

export function setTextUsageOwner(ownerId: string | null) {
  if (activeOwner === ownerId) return;
  activeOwner = ownerId;
  cache.clear();
}

function usageWindow(value: unknown): TextUsageWindow {
  const window = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    usagePercent: typeof window.usagePercent === 'number' && Number.isFinite(window.usagePercent)
      ? Math.min(100, Math.max(0, window.usagePercent)) : null,
    resetsAt: typeof window.resetsAt === 'string' && Number.isFinite(Date.parse(window.resetsAt)) ? window.resetsAt : null,
  };
}

/** Keep percentage-only presentation data. Never expose internal cost budgets. */
export function normalizeTextUsage(value: unknown, pool: TextUsagePool): TextUsageSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.pool !== pool || !['free', 'boost', 'admin'].includes(String(input.tier))
    || typeof input.enforcementEnabled !== 'boolean' || typeof input.configured !== 'boolean'
    || typeof input.adminUncapped !== 'boolean') return null;
  return { pool, tier: input.tier as TextUsageSnapshot['tier'], enforcementEnabled: input.enforcementEnabled,
    configured: input.configured, adminUncapped: input.adminUncapped,
    daily: usageWindow(input.daily), monthly: usageWindow(input.monthly) };
}

export function visibleTextUsageWindows(snapshot: TextUsageSnapshot | null): Array<TextUsageWindow & { period: 'daily' | 'monthly' }> {
  if (!snapshot?.enforcementEnabled || !snapshot.configured || snapshot.adminUncapped) return [];
  return (['daily', 'monthly'] as const).flatMap(period => snapshot[period].usagePercent === null
    ? [] : [{ period, ...snapshot[period] }]);
}

export async function readTextUsage(ownerId: string, pool: TextUsagePool, force = false): Promise<TextUsageSnapshot | null> {
  if (activeOwner !== ownerId) setTextUsageOwner(ownerId);
  let entry = cache.get(pool);
  if (!entry) { entry = { snapshot: null, expiresAt: 0, revision: 0 }; cache.set(pool, entry); }
  if (force) { entry.expiresAt = 0; entry.revision++; }
  if (entry.pending) return entry.pending;
  if (entry.expiresAt > Date.now()) return entry.snapshot;
  const expectedEntry = entry;
  const revision = entry.revision;
  const request = (async () => {
    const before = await supabase.auth.getSession();
    if (before.error || before.data.session?.user.id !== ownerId || activeOwner !== ownerId) return null;
    // This new read-only RPC can precede regenerated database typings.
    const db = supabase as unknown as { rpc(name: 'get_my_arc_usage', args: { pool_name: TextUsagePool }): PromiseLike<{ data: unknown; error: unknown }> };
    const { data, error } = await db.rpc('get_my_arc_usage', { pool_name: pool });
    const after = await supabase.auth.getSession();
    if (after.error || after.data.session?.user.id !== ownerId || activeOwner !== ownerId || cache.get(pool) !== expectedEntry) return null;
    if (expectedEntry.revision !== revision) {
      expectedEntry.pending = undefined;
      return readTextUsage(ownerId, pool);
    }
    const snapshot = error ? null : normalizeTextUsage(data, pool);
    expectedEntry.snapshot = snapshot;
    expectedEntry.expiresAt = Date.now() + CACHE_MS;
    return snapshot;
  })().catch(() => null).finally(() => {
    if (expectedEntry.pending === request) expectedEntry.pending = undefined;
  });
  entry.pending = request;
  return request;
}

export function notifyTextUsageChanged() {
  for (const entry of cache.values()) { entry.expiresAt = 0; entry.revision++; }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('arc-text-usage-changed'));
}
