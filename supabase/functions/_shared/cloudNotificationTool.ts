import type { CloudToolDefinition } from './cloudRunProvider.ts';
import type { ClaimedCloudRun, RegisteredCloudTool } from './cloudRunWorker.ts';
export const CLOUD_NOTIFICATION_DEFINITION: CloudToolDefinition = {
  type: 'function', name: 'send_notification', strict: true,
  description: 'Send a push notification to the current user only. Email delivery is not available through this tool. Report returned delivery counts accurately; acceptance does not prove the user saw it.',
  parameters: { type: 'object', additionalProperties: false,
    properties: { title: { type: 'string', minLength: 1, maxLength: 200 },
      body: { type: 'string', maxLength: 200 }, url: { type: 'string', maxLength: 500 } },
    required: ['title', 'body', 'url'] },
};
type NotificationPayload = { user_ids: string[]; payload: { title: string; body: string; url: string; tag: string } };
export function cloudNotificationTool(options: {
  authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  dispatch(payload: NotificationPayload): Promise<unknown>;
}): RegisteredCloudTool {
  return { approval: 'ask-mode', replaySafe: false, authorize: options.authorizeOwner,
    execute: async (run, call, key) => {
      let value: { title: string; body: string; url: string };
      try {
        if (call.arguments.length > 4096) throw new Error();
        value = JSON.parse(call.arguments);
        if (!value || Object.keys(value).sort().join(',') !== 'body,title,url' ||
          typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 ||
          typeof value.body !== 'string' || value.body.length > 200 || typeof value.url !== 'string' ||
          value.url.length > 500 || !/^\/(?!\/)/.test(value.url) || /[\\\u0000-\u0020]/.test(value.url)) throw new Error();
      } catch {
        return JSON.stringify({ performed: false, error: 'Provide title, body, and an app-relative URL such as /dashboard. No recipient or channel overrides are allowed.' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run.user_id)
        || !await options.authorizeOwner(run)) return JSON.stringify({ performed: false, error: 'Notification owner authorization failed.' });
      // A stable display tag is NOT an idempotency guarantee. The durable engine
      // receipt prevents automatic reexecution after any ambiguous transport.
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
      const tag = `arc-cloud-${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
      const result = await options.dispatch({ user_ids: [run.user_id], payload: { ...value, tag } });
      if (!result || typeof result !== 'object') throw new Error('Notification outcome unknown');
      const counts = result as Record<string, unknown>;
      if (['sent', 'failed', 'total'].some(field => !Number.isSafeInteger(counts[field]) || (counts[field] as number) < 0)
        || (counts.sent as number) + (counts.failed as number) !== counts.total) throw new Error('Notification outcome unknown');
      const output = JSON.stringify({ channel: 'push', sent: counts.sent, failed: counts.failed, total: counts.total,
        desktopDelivery: 'not confirmed by this response', seenByUser: 'not confirmed',
        message: counts.total === 0 ? 'No browser push subscriptions were attempted. Do not claim browser delivery.' : 'Push delivery attempt finished; report the returned counts.' });
      // Existing confirmation card says "Sent". Only render it when the service
      // actually confirms at least one successful push, never for zero/unknown.
      return (counts.sent as number) > 0 ? { output, presentation: { notification_dispatch: {
        channel: 'push', ...value, sent_at: new Date().toISOString(), results: [
          `${counts.sent} push delivery requests accepted; user viewing not confirmed.`,
          ...(counts.failed ? [`${counts.failed} push delivery requests failed.`] : []),
        ],
      } } } : output;
    },
  };
}
export function cloudNotificationDispatch(url: string, serviceKey: string, fetcher: typeof fetch = fetch) {
  return async (payload: NotificationPayload): Promise<unknown> => {
    if (payload.user_ids.length !== 1 || !payload.user_ids[0]) throw new Error('A single notification owner is required');
    const response = await fetcher(`${url.replace(/\/$/, '')}/functions/v1/send-push-notification`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Notification outcome unknown'); }
    return await response.json();
  };
}
