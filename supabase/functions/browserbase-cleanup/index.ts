import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { browserbaseSessionStore } from '../_shared/browserbaseStore.ts';
import { createBrowserProvider, liveBrowserEnabled as isLiveBrowserEnabled } from '../_shared/browserProvider.ts';

Deno.serve(async req => {
  const secret = Deno.env.get('CONTENT_REVIEW_CRON_SECRET');
  if (req.method !== 'POST' || !secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await db.rpc('claim_idle_browserbase_sessions');
  if (error) return Response.json({ error: 'Cleanup unavailable' }, { status: 503 });
  const backend = createBrowserProvider(db);
  await Promise.all((data ?? []).map((row: { user_id: string; session_handle: string }) => backend.close(row.user_id, row.session_handle)));
  return Response.json({ processed: data?.length ?? 0 });
});
