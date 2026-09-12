import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

type ClaimedPush = {
  id: string;
  run_id: string;
  user_id: string;
  lease_token: string;
  session_id: string;
  mode: 'ask' | 'auto';
  result: unknown;
  idempotency_key: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseClaim(value: unknown): ClaimedPush | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id) || !isUuid(row.run_id) || !isUuid(row.user_id) ||
      !isUuid(row.lease_token) || !isUuid(row.session_id) ||
      !['ask', 'auto'].includes(String(row.mode)) || typeof row.idempotency_key !== 'string') return null;
  return row as unknown as ClaimedPush;
}

function resultPreview(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  const choices = (result as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return '';
  const message = (choices[0] as Record<string, unknown> | undefined)?.message;
  const content = message && typeof message === 'object' && !Array.isArray(message)
    ? (message as Record<string, unknown>).content : null;
  return typeof content === 'string' ? content.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

/** Deliver one at-most-once completion push. An empty subscription set is a
 * successful no-op; the user controls this channel by enabling device push. */
export function cloudRunCompletionPushSweep(
  db: SupabaseClient,
  options: { url: string; serviceKey: string; siteUrl?: string; fetcher?: typeof fetch },
) {
  const fetcher = options.fetcher ?? fetch;
  return async () => {
    const { data, error } = await db.rpc('claim_cloud_run_push', { p_lease_seconds: 120 });
    if (error) throw new Error('Unable to claim cloud-run completion push');
    if (data === null || data === undefined) return { examined: 0, sent: 0, skipped: 0, failed: 0 };
    const claim = parseClaim(data);
    if (!claim) throw new Error('Invalid cloud-run completion push claim');

    const response = await fetcher(`${options.url.replace(/\/$/, '')}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.serviceKey}`, apikey: options.serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_ids: [claim.user_id],
        payload: {
          title: `Arc ${claim.mode === 'auto' ? 'Work' : 'Chat'} finished`,
          body: resultPreview(claim.result) || 'Your Arc run finished. Open Arc to view the result.',
          url: `${options.siteUrl ?? 'https://askarc.chat'}/chat/${claim.session_id}`,
          tag: claim.idempotency_key,
        },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Cloud-run completion push acceptance unknown');
    }
    const result = await response.json().catch(() => ({}));
    const sent = Number.isSafeInteger(result?.sent) ? result.sent : -1;
    const total = Number.isSafeInteger(result?.total) ? result.total : -1;
    const failed = Number.isSafeInteger(result?.failed) ? result.failed : -1;
    if (sent < 0 || total < 0 || failed < 0 || sent + failed !== total) {
      throw new Error('Cloud-run completion push response was invalid');
    }

    const receipt = { accepted: true as const, id: `${claim.idempotency_key}:${sent}` };
    const finished = await db.rpc('finish_cloud_run_push', {
      p_id: claim.id, p_user_id: claim.user_id, p_lease_token: claim.lease_token,
      p_receipt: receipt,
    });
    if (finished.error || finished.data !== true) throw new Error('Unable to finish cloud-run completion push');
    return { examined: 1, sent, skipped: total === 0 ? 1 : 0, failed };
  };
}
