import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

  let jobId: string | undefined;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      jobId = url.searchParams.get('jobId') || undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      jobId = body?.jobId;
    }
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (!jobId) return json({ error: 'jobId required' }, 400);

  const { data, error } = await supabase
    .from('image_generation_jobs')
    .select('id, user_id, status, result_image_url, result_image_urls, error_message, error_type, fallback_model, preferred_model, job_type')
    .eq('id', jobId)
    .single();

  if (error || !data) return json({ error: 'Job not found' }, 404);
  if (data.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  return json({
    jobId: data.id,
    status: data.status,
    imageUrl: data.result_image_url,
    imageUrls: Array.isArray(data.result_image_urls) && data.result_image_urls.length > 0
      ? data.result_image_urls
      : (data.result_image_url ? [data.result_image_url] : []),
    errorMessage: data.error_message,
    errorType: data.error_type,
    fallbackModel: data.fallback_model,
    preferredModel: data.preferred_model,
    jobType: data.job_type,
  });
});
