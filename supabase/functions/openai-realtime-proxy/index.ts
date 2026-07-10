import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_VOICES = new Set(['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin']);
const OPENAI_REALTIME_MODELS = ['gpt-realtime-2.1-mini', 'gpt-realtime-2.1'] as const;

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

  let selectedModel: typeof OPENAI_REALTIME_MODELS[number] | null = null;
  let responseText = '';
  let sessionData: any = null;
  let lastFailureStatus: number | null = null;

  for (const model of OPENAI_REALTIME_MODELS) {
    const sessionResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
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

    responseText = await sessionResponse.text();
    if (!sessionResponse.ok) {
      lastFailureStatus = sessionResponse.status;
      console.error('[openai-realtime-proxy] Failed to create realtime session:', model, sessionResponse.status, responseText);
      continue;
    }

    try {
      sessionData = JSON.parse(responseText);
      selectedModel = model;
      break;
    } catch (error) {
      lastFailureStatus = 502;
      console.error('[openai-realtime-proxy] Failed to parse realtime session response:', model, error, responseText);
    }
  }

  if (!selectedModel || !sessionData) {
    return new Response(JSON.stringify({ error: 'Failed to create voice session' }), {
      status: lastFailureStatus ?? 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // GA endpoint returns { value, expires_at } at top level
  const clientSecret = sessionData?.value ?? sessionData?.client_secret?.value;
  const expiresAt = sessionData?.expires_at ?? sessionData?.client_secret?.expires_at ?? null;

  if (!clientSecret) {
    console.error('[openai-realtime-proxy] Missing client secret in realtime session response', responseText);
    return new Response(JSON.stringify({ error: 'Voice session token missing' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    client_secret: clientSecret,
    expires_at: expiresAt,
    model: selectedModel,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
