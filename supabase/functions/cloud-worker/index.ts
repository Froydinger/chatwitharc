import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { continueCloudRun } from '../_shared/cloudRunBurst.ts';
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
import { cloudRunCompletionPushSweep } from '../_shared/cloudRunPush.ts';
import { browserbaseSessionStore } from '../_shared/browserbaseStore.ts';
import { createBrowserProvider, liveBrowserEnabled as isLiveBrowserEnabled } from '../_shared/browserProvider.ts';

type WorkerOptions = {
  enabled: boolean;
  secret: string;
  sweep(runId?: string): Promise<unknown>;
};
const WORKER_REVISION = 'flynn-river-20260930';
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Arc-Worker-Revision': WORKER_REVISION } });
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
    const raw = await req.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: 'Invalid worker request.' }, 400); }
    const runId = body?.runId;
    if (runId !== undefined && (typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId))) return json({ error: 'Invalid run ID.' }, 400);
    // Only the authenticated server can target a run. Owner, kind and tools
    // remain resolved from the database and every boundary reclaims its lease.
    return json(await options.sweep(runId));
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
  sweep: async (runId) => {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!url || !serviceKey || !apiKey) throw new Error('Worker configuration unavailable');
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const appEnabled = Deno.env.get('CLOUD_APP_RUNS_ENABLED') === 'true';
    const browserbaseBackend = createBrowserProvider(db);
    const imageConfig = cloudImageConfig((name) => Deno.env.get(name));
    const dispatch = cloudRunDispatch({
        kind: async id => {
          const { data, error } = await db.from('cloud_runs').select('id,kind').eq('id', id).maybeSingle();
          if (error || (data && data.id !== id)) throw new Error('Unable to resolve cloud run kind');
          return data ? data.kind : null;
        },
        appEnabled,
        app: cloudAppAdvance(db, apiKey, {
          enabled: appEnabled,
          publisher: {
            netlifyAccessToken: Deno.env.get('NETLIFY_ACCESS_TOKEN') ?? '',
            supabaseUrl: url,
            domain: 'askarc.chat',
          },
        }),
        chat: cloudRunAdvance(db, apiKey, { geminiApiKey: Deno.env.get('GEMINI_API_KEY'), tavilyApiKey: Deno.env.get('TAVILY_API_KEY'), weatherLookup: cloudWeatherLookup(url, serviceKey),
          mediaConfig: { supabaseUrl: url, serviceRoleKey: serviceKey },
          fileStore: cloudFileStore({ supabaseUrl: url, serviceRoleKey: serviceKey }),
          imageConfig: cloudImageConfig(name => Deno.env.get(name)),
          notificationDispatch: cloudNotificationDispatch(url, serviceKey),
          browserbase: {
            enabled: isLiveBrowserEnabled(),
            backend: browserbaseBackend,
          } }),
      });
    const advance = async (id: string) => {
      if (Deno.env.get('CLOUD_RUN_FAST_CONTINUATION_ENABLED') === 'false') return dispatch(id);
      const result = await continueCloudRun(id, {
        advance: dispatch,
        inspect: async runId => {
          const { data, error } = await db.from('cloud_runs').select('status,checkpoint,error').eq('id', runId).maybeSingle();
          if (error) throw new Error('Unable to inspect cloud continuation');
          if (!data) return null;
          const engine = data.checkpoint?.engine;
          return { status: data.status, waitingForModel: (engine?.phase === 'model' && !!(engine.agentSessionId || engine.responseId)) || data.error === 'Durable tool work pending' };
        },
      });
      console.log('Cloud run timing', { runId: id, ...result });
      if (result.requeue) {
        const secret = Deno.env.get('CLOUD_WORKER_SECRET') ?? Deno.env.get('SCHEDULED_TASKS_CRON_SECRET');
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
        if (secret && runtime) runtime.waitUntil(fetch(`${url}/functions/v1/cloud-worker`, {
          method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: id }),
        }).catch(() => undefined));
      }
      return result.steps > 0;
    };
    const runs = await sweepCloudRuns({
      candidates: runId ? async () => [runId] : cloudRunCandidates(db),
      advance,
    });
    // Completion email delivery shares this trusted worker boundary but is
    // independent of scheduled-task cutover. A mail-provider failure must not
    // stop the cloud-run sweep from advancing the next run.
    const email = await cloudRunCompletionEmailSweep(db, {
      url,
      serviceKey,
      siteUrl: Deno.env.get('SITE_URL') ?? 'https://askarc.chat',
    })().catch(() => ({ examined: 0, sent: 0, skipped: 0, failed: 1 }));
    // Push completion delivery is independent of email delivery. A missing
    // device subscription is a successful no-op and never blocks the worker.
    const push = await cloudRunCompletionPushSweep(db, {
      url,
      serviceKey,
      siteUrl: Deno.env.get('SITE_URL') ?? 'https://askarc.chat',
    })().catch(() => ({ examined: 0, sent: 0, skipped: 0, failed: 1 }));
    // Default-off; the same claim contract also backs cloud-scheduled-worker.
    // Neither code path changes or disables the legacy scheduled-task cron.
    if (runId || !cloudScheduledConfig(name => Deno.env.get(name)).enabled) return { ...runs, email, push };
    return { ...runs, email, push, scheduled: await cloudScheduledSweep(db, { url, serviceKey, apiKey })() };
  },
}));
