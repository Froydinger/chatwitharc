import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { cloudRunAdvance } from '../_shared/cloudRunRuntime.ts';
import { cloudRunCandidates, sweepCloudRuns } from '../_shared/cloudRunScheduler.ts';
import { cloudWeatherLookup } from '../_shared/cloudWeatherTool.ts';
import { cloudNotificationDispatch } from '../_shared/cloudNotificationTool.ts';
import { cloudAppAdvance } from '../_shared/cloudAppRuntime.ts';
import { cloudRunDispatch } from '../_shared/cloudRunDispatch.ts';
import { cloudFileStore } from '../_shared/cloudFileStore.ts';
import { cloudImageConfig } from '../_shared/cloudImageRuntime.ts';
import { cloudScheduledConfig, cloudScheduledSweep } from '../_shared/cloudScheduledRuntime.ts';
import { cloudRunCompletionEmailSweep } from '../_shared/cloudRunEmail.ts';

type WorkerOptions = {
  enabled: boolean;
  secret: string;
  sweep(): Promise<unknown>;
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function matchesSecret(received: string, expected: string): Promise<boolean> {
  if (!expected || !received || received.length > 4096) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(received), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** Only the trusted scheduler can sweep. Browser JWTs/anon keys do not grant
 * access, and request bodies cannot choose an owner, context or tool registry. */
export async function handleCloudWorker(req: Request, options: WorkerOptions): Promise<Response> {
  if (!options.enabled) return json({ error: 'Cloud worker is disabled.' }, 503);
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
  if (!await matchesSecret(token, options.secret)) return json({ error: 'Unauthorized.' }, 401);
  try {
    return json(await options.sweep());
  } catch {
    // Do not return provider data, user context, database messages or secrets.
    return json({ error: 'Cloud sweep could not complete.' }, 503);
  }
}

if (import.meta.main) Deno.serve((req) => handleCloudWorker(req, {
  enabled: Deno.env.get('CLOUD_WORKER_ENABLED') === 'true',
  // Keep the dedicated secret optional for the first rollout. The existing
  // scheduler secret is server-only and lets the worker share the same
  // Supabase cron boundary until a separate secret is configured.
  secret: Deno.env.get('CLOUD_WORKER_SECRET') ?? Deno.env.get('SCHEDULED_TASKS_CRON_SECRET') ?? '',
  sweep: async () => {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!url || !serviceKey || !apiKey) throw new Error('Worker configuration unavailable');
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const appEnabled = Deno.env.get('CLOUD_APP_RUNS_ENABLED') === 'true';
    const imageConfig = cloudImageConfig((name) => Deno.env.get(name));
    const runs = await sweepCloudRuns({
      candidates: cloudRunCandidates(db),
      advance: cloudRunDispatch({
        kind: async id => {
          const { data, error } = await db.from('cloud_runs').select('id,kind').eq('id', id).maybeSingle();
          if (error || (data && data.id !== id)) throw new Error('Unable to resolve cloud run kind');
          return data ? data.kind : null;
        },
        appEnabled,
        app: cloudAppAdvance(db, apiKey, { enabled: appEnabled }),
        chat: cloudRunAdvance(db, apiKey, { tavilyApiKey: Deno.env.get('TAVILY_API_KEY'), weatherLookup: cloudWeatherLookup(url, serviceKey),
          mediaConfig: { supabaseUrl: url, serviceRoleKey: serviceKey },
          fileStore: cloudFileStore({ supabaseUrl: url, serviceRoleKey: serviceKey }),
          imageConfig: cloudImageConfig(name => Deno.env.get(name)),
          notificationDispatch: cloudNotificationDispatch(url, serviceKey) }),
      }),
    });
    // Completion email delivery shares this trusted worker boundary but is
    // independent of scheduled-task cutover. A mail-provider failure must not
    // stop the cloud-run sweep from advancing the next run.
    const email = await cloudRunCompletionEmailSweep(db, {
      url,
      serviceKey,
      siteUrl: Deno.env.get('SITE_URL') ?? 'https://askarc.chat',
    })().catch(() => ({ examined: 0, sent: 0, skipped: 0, failed: 1 }));
    // Default-off; the same claim contract also backs cloud-scheduled-worker.
    // Neither code path changes or disables the legacy scheduled-task cron.
    if (!cloudScheduledConfig(name => Deno.env.get(name)).enabled) return { ...runs, email };
    return { ...runs, email, scheduled: await cloudScheduledSweep(db, { url, serviceKey, apiKey })() };
  },
}));
