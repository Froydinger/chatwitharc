import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { handleCloudWorker } from '../cloud-worker/index.ts';
import { cloudScheduledConfig, cloudScheduledSweep } from '../_shared/cloudScheduledRuntime.ts';

/** Dedicated scheduler URL; shares the proven POST/dedicated-secret boundary.
 * No body fields select owners or tasks. No cron is created/enabled here. */
export function handleScheduledWorker(req: Request, options: {
  enabled: boolean; secret: string; sweep(): Promise<unknown>;
}) { return handleCloudWorker(req, options); }

if (import.meta.main) Deno.serve(req => handleScheduledWorker(req, {
  enabled: cloudScheduledConfig(name => Deno.env.get(name)).enabled,
  secret: Deno.env.get('CLOUD_SCHEDULED_WORKER_SECRET') ?? '',
  sweep: async () => {
    const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!url || !serviceKey || !apiKey) throw new Error('Scheduled worker configuration unavailable');
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return await cloudScheduledSweep(db, { url, serviceKey, apiKey })();
  },
}));
