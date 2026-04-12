import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_VOICES = new Set(['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin']);
const OPENAI_REALTIME_MODEL = 'gpt-realtime-1.5';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    console.error('[openai-realtime-proxy] JWT verification failed:', userError?.message || 'no user');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let requestedVoice = 'cedar';
  try {
    const body = await req.json();
    if (typeof body?.voice === 'string' && ALLOWED_VOICES.has(body.voice)) {
      requestedVoice = body.voice;
    }
  } catch {
    // Allow empty body and fall back to default voice.
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('[openai-realtime-proxy] OPENAI_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'Voice service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sessionResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_REALTIME_MODEL,
      voice: requestedVoice,
    }),
  });

  const responseText = await sessionResponse.text();
  if (!sessionResponse.ok) {
    console.error('[openai-realtime-proxy] Failed to create realtime session:', sessionResponse.status, responseText);
    return new Response(JSON.stringify({ error: 'Failed to create voice session' }), {
      status: sessionResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let sessionData: any;
  try {
    sessionData = JSON.parse(responseText);
  } catch (error) {
    console.error('[openai-realtime-proxy] Failed to parse realtime session response:', error, responseText);
    return new Response(JSON.stringify({ error: 'Invalid voice session response' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!sessionData?.client_secret?.value) {
    console.error('[openai-realtime-proxy] Missing client secret in realtime session response');
    return new Response(JSON.stringify({ error: 'Voice session token missing' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    client_secret: sessionData.client_secret.value,
    expires_at: sessionData.client_secret.expires_at ?? null,
    model: OPENAI_REALTIME_MODEL,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
