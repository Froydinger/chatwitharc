import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

type ClaimedEmail = {
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

function parseClaim(value: unknown): ClaimedEmail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id) || !isUuid(row.run_id) || !isUuid(row.user_id) ||
      !isUuid(row.lease_token) || !isUuid(row.session_id) ||
      !['ask', 'auto'].includes(String(row.mode)) ||
      typeof row.idempotency_key !== 'string') return null;
  return row as unknown as ClaimedEmail;
}

function resultPreview(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  const choices = (result as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return '';
  const content = (choices[0] as Record<string, unknown> | undefined)?.message;
  const text = content && typeof content === 'object' && !Array.isArray(content)
    ? (content as Record<string, unknown>).content
    : null;
  return typeof text === 'string' ? text.slice(0, 1200) : '';
}

type Owner = { id: string; email?: string; email_confirmed_at?: string | null; banned_until?: string | null };

/** Deliver one durable completion email. A claimed item remains `sending` if
 * provider acceptance is ambiguous, which the SQL layer converts to
 * `recovery_required` instead of risking a duplicate email. */
export function cloudRunCompletionEmailSweep(
  db: SupabaseClient,
  options: { url: string; serviceKey: string; siteUrl?: string; fetcher?: typeof fetch },
) {
  const fetcher = options.fetcher ?? fetch;
  return async () => {
    const { data, error } = await db.rpc('claim_cloud_run_email', { p_lease_seconds: 120 });
    if (error) throw new Error('Unable to claim cloud-run completion email');
    if (data === null || data === undefined) return { examined: 0, sent: 0, skipped: 0, failed: 0 };
    const claim = parseClaim(data);
    if (!claim) throw new Error('Invalid cloud-run completion email claim');

    const finish = async (receipt: { accepted: true; id: string }) => {
      const result = await db.rpc('finish_cloud_run_email', {
        p_id: claim.id,
        p_user_id: claim.user_id,
        p_lease_token: claim.lease_token,
        p_receipt: receipt,
      });
      if (result.error || result.data !== true) throw new Error('Unable to finish cloud-run completion email');
    };

    const { data: userData, error: userError } = await db.auth.admin.getUserById(claim.user_id);
    const owner = userData?.user as Owner | undefined;
    if (userError || !owner || owner.id !== claim.user_id ||
        !owner.email || !owner.email_confirmed_at ||
        (owner.banned_until && Date.parse(owner.banned_until) > Date.now())) {
      await finish({ accepted: true, id: `skipped:cloud-run:${claim.run_id}` });
      return { examined: 1, sent: 0, skipped: 1, failed: 0 };
    }

    const response = await fetcher(`${options.url.replace(/\/$/, '')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.serviceKey}`,
        apikey: options.serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateName: 'scheduled-task-complete',
        recipientEmail: owner.email,
        idempotencyKey: claim.idempotency_key,
        templateData: {
          taskTitle: `Arc ${claim.mode === 'auto' ? 'Work' : 'Chat'} run finished`,
          preview: resultPreview(claim.result) || 'Your Arc run finished. Open Arc to view the result.',
          chatUrl: `${options.siteUrl ?? 'https://askarc.chat'}/chat/${claim.session_id}`,
        },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Cloud-run completion email acceptance unknown');
    }
    const result = await response.json().catch(() => ({}));
    const accepted = result?.success === true &&
      (result.sent === true || (result.sent === false && result.reason === 'already_sent'));
    const suppressed = result?.success === false && result.reason === 'email_suppressed';
    if (!accepted && !suppressed) throw new Error('Cloud-run completion email was not accepted');
    await finish({ accepted: true, id: suppressed ? `suppressed:${claim.idempotency_key}` : `email-log:${claim.idempotency_key}` });
    return { examined: 1, sent: accepted ? 1 : 0, skipped: suppressed ? 1 : 0, failed: 0 };
  };
}
