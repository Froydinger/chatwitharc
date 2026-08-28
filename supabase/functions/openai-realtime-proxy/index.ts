import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Arc offers exactly two voices: Marina (marin, default) and Cedric (cedar).
const ALLOWED_VOICES = new Set(['marin', 'cedar']);
// Arc voice mode runs on the GA Realtime *mini* model — the cheapest realtime
// tier. Do NOT fall back to the `gpt-4o-*-realtime-preview` family: those are the
// previous generation and are several times more expensive per audio minute,
// which is what caused the earlier billing bleed.
const REALTIME_MODEL_CANDIDATES = [
  'gpt-realtime-mini-2025-10-06',
  'gpt-realtime-mini',
] as const;
const OPENAI_REALTIME_MODEL = REALTIME_MODEL_CANDIDATES[0];

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

  let requestedVoice = 'marin';
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

  let sessionData: any = null;
  let lastFailureStatus: number | null = null;
  let lastFailureText = '';
  let successfulModel = '';

  // GA realtime models are only known to /v1/realtime/client_secrets. The legacy
  // /v1/realtime/sessions endpoint rejects them with "model does not exist",
  // which is what made an earlier fix wrongly conclude the mini model was bad
  // and cascade all the way back to the expensive 4o preview models.
  for (const model of REALTIME_MODEL_CANDIDATES) {
    try {
      const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model,
            audio: {
              output: { voice: requestedVoice },
            },
          },
        }),
      });

      const text = await res.text();
      if (res.ok) {
        sessionData = JSON.parse(text);
        successfulModel = model;
        console.log(`[openai-realtime-proxy] Created realtime session with model: ${model}`);
        break;
      }

      lastFailureStatus = res.status;
      lastFailureText = text;
      console.warn(`[openai-realtime-proxy] Model ${model} rejected (${res.status}): ${text}`);
    } catch (err) {
      console.error(`[openai-realtime-proxy] Fetch error for model ${model}:`, err);
    }
  }

  if (!sessionData) {
    console.error('[openai-realtime-proxy] All realtime mini candidates failed. Last failure:', lastFailureStatus, lastFailureText);
    return new Response(JSON.stringify({ error: 'Failed to create voice session' }), {
      status: lastFailureStatus ?? 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientSecret = sessionData?.value ?? sessionData?.client_secret?.value;
  const expiresAt = sessionData?.expires_at ?? sessionData?.client_secret?.expires_at ?? null;

  if (!clientSecret) {
    console.error('[openai-realtime-proxy] Missing client secret in realtime session response', sessionData);
    return new Response(JSON.stringify({ error: 'Voice session token missing' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    client_secret: clientSecret,
    expires_at: expiresAt,
    model: successfulModel || OPENAI_REALTIME_MODEL,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
