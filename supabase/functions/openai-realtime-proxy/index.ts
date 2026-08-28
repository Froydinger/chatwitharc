import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_VOICES = new Set(['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin']);
// Arc voice mode uses the cost-efficient Realtime Mini model.
const OPENAI_REALTIME_MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17' as const;

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

  const candidateModels = [
    'gpt-4o-mini-realtime-preview-2024-12-17',
    'gpt-4o-mini-realtime-preview',
    'gpt-4o-realtime-preview-2024-12-17',
    'gpt-4o-realtime-preview',
  ];

  let sessionData: any = null;
  let lastFailureStatus: number | null = null;
  let lastFailureText = '';
  let successfulModel = '';

  for (const model of candidateModels) {
    try {
      // 1. Try standard /v1/realtime/sessions endpoint
      let res = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          voice: requestedVoice,
        }),
      });

      // 2. Fallback to /v1/realtime/client_secrets if needed
      if (!res.ok) {
        res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
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
      }

      const text = await res.text();
      if (res.ok) {
        sessionData = JSON.parse(text);
        successfulModel = model;
        console.log(`[openai-realtime-proxy] Successfully created session with model: ${model}`);
        break;
      } else {
        lastFailureStatus = res.status;
        lastFailureText = text;
        console.warn(`[openai-realtime-proxy] Model ${model} failed (${res.status}): ${text}`);
      }
    } catch (err) {
      console.error(`[openai-realtime-proxy] Fetch error for model ${model}:`, err);
    }
  }

  if (!sessionData) {
    console.error('[openai-realtime-proxy] All candidate models failed. Last failure:', lastFailureStatus, lastFailureText);
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
    model: successfulModel || 'gpt-4o-mini-realtime-preview-2024-12-17',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
