// Polling endpoint for "watch the bot work" browser test runs.
// Frames live in the sandbox filesystem for its 20-minute window; this reads the
// ones written after `sinceIndex` and hands them to the client.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { readBrowserTestFrames } from '../_shared/browserTest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Invalid or expired token' }, 401);

  let runId: string | undefined;
  let sinceIndex = 0;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      runId = url.searchParams.get('runId') || undefined;
      sinceIndex = Number(url.searchParams.get('sinceIndex') || 0);
    } else {
      const body = await req.json().catch(() => ({}));
      runId = body?.runId;
      sinceIndex = Number(body?.sinceIndex || 0);
    }
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (!runId) return json({ error: 'runId required' }, 400);
  if (!Number.isFinite(sinceIndex) || sinceIndex < 0) sinceIndex = 0;

  try {
    const result = await readBrowserTestFrames(supabase, user.id, runId, sinceIndex);
    return json({ runId, ...result });
  } catch (err) {
    console.error('browser-test-status failed:', err);
    return json({ error: err instanceof Error ? err.message : 'Failed to read run' }, 500);
  }
});
