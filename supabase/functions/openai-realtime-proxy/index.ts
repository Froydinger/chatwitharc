import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Voices supported by GPT-Live and Realtime models.
const ALLOWED_VOICES = new Set([
  'marin', 'cedar', 'quartz', 'ripple', 'vesper', 'willow', 'stone',
  'gleam', 'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder',
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx',
  'sage', 'shimmer', 'verse',
]);

const GPT_LIVE_MODEL = 'gpt-live-1';
const DELEGATED_RESPONSES_MODEL = 'gpt-5.6-luna';

// Fallback candidates if legacy client_secrets are requested without an SDP offer.
const REALTIME_MODEL_CANDIDATES = [
  'gpt-realtime-2.1-mini',
] as const;
const OPENAI_REALTIME_MODEL = REALTIME_MODEL_CANDIDATES[0];

// Resolved once per isolate. A hardcoded name is not trustworthy here: the
// /client_secrets endpoint happily mints a token for a model the account
// cannot actually use, and only the WebSocket rejects it (error
// `model_not_found`, close code 4004). So the only reliable source is the
// account's own model list.
let cachedRealtimeModel: string | null = null;

const scoreRealtimeModel = (id: string): number => {
  let score = 0;
  if (id.includes('2.1-mini')) score += 1_000;         // newest same-price Mini first
  if (id.includes('mini')) score += 100;              // Mini tier only
  if (!id.includes('4o')) score += 50;                // GA over legacy 4o
  if (!/\d{4}-\d{2}-\d{2}/.test(id)) score += 10;    // stable alias over snapshot
  if (id.includes('preview')) score -= 5;
  return score;
};

async function resolveRealtimeModel(apiKey: string): Promise<string | null> {
  if (cachedRealtimeModel) return cachedRealtimeModel;
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(`[openai-realtime-proxy] Could not list models (${res.status})`);
      return null;
    }
    const json = await res.json();
    const realtime: string[] = (json?.data ?? [])
      .map((m: any) => m?.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.includes('realtime'))
      // Hard cost boundary: model discovery may return full-price Realtime
      // models, but Arc voice is allowed to select Mini models only.
      .filter((id: string) => REALTIME_MODEL_CANDIDATES.some((allowed) => allowed === id));

    console.log('[openai-realtime-proxy] Realtime models available:', JSON.stringify(realtime));
    if (realtime.length === 0) return null;

    realtime.sort((a, b) => scoreRealtimeModel(b) - scoreRealtimeModel(a));
    cachedRealtimeModel = realtime[0];
    console.log(`[openai-realtime-proxy] Resolved realtime model: ${cachedRealtimeModel}`);
    return cachedRealtimeModel;
  } catch (err) {
    console.error('[openai-realtime-proxy] Model list lookup failed:', err);
    return null;
  }
}

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
  let sdpOffer: string | null = null;
  let liveInstructions: string | null = null;
  let backendInstructions: string | null = null;
  let tools: any[] | null = null;

  try {
    const body = await req.json();
    if (typeof body?.voice === 'string' && ALLOWED_VOICES.has(body.voice)) {
      requestedVoice = body.voice;
    }
    if (typeof body?.sdp === 'string' && body.sdp.trim()) {
      sdpOffer = body.sdp.trim();
    }
    if (typeof body?.instructions === 'string' && body.instructions.trim()) {
      liveInstructions = body.instructions.trim();
    }
    if (typeof body?.backendInstructions === 'string' && body.backendInstructions.trim()) {
      backendInstructions = body.backendInstructions.trim();
    }
    if (Array.isArray(body?.tools)) {
      tools = body.tools;
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

  // If client supplied an SDP offer, create a direct GPT-Live 1 WebRTC session
  if (sdpOffer) {
    try {
      console.log(`[openai-realtime-proxy] Creating GPT-Live-1 session with voice: ${requestedVoice}`);
      const liveSessionPayload: Record<string, any> = {
        session: {
          model: GPT_LIVE_MODEL,
          instructions: liveInstructions || 'You are Arc, a warm, direct, conversational AI assistant. Keep responses natural, punchy, and concise. Delegate research, tool execution, and complex questions to the backend.',
          audio: {
            output: { voice: requestedVoice },
          },
          delegation: {
            type: 'responses',
            responses: {
              model: DELEGATED_RESPONSES_MODEL,
              instructions: backendInstructions || "You are Arc's reasoning engine. Execute tools and reason carefully to produce accurate, concise, grounded answers for spoken delivery.",
              tools: tools || [],
              tool_choice: 'auto',
            },
          },
        },
        transport: {
          type: 'webrtc',
          sdp: sdpOffer,
        },
      };

      const liveRes = await fetch('https://api.openai.com/v1/live/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(liveSessionPayload),
      });

      const liveText = await liveRes.text();
      if (liveRes.ok) {
        const liveData = JSON.parse(liveText);
        console.log(`[openai-realtime-proxy] Created GPT-Live session: ${liveData?.session?.id}`);
        return new Response(JSON.stringify({
          sdp: liveData?.transport?.sdp,
          session_id: liveData?.session?.id,
          model: GPT_LIVE_MODEL,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.warn(`[openai-realtime-proxy] GPT-Live-1 creation returned ${liveRes.status}: ${liveText}`);
      return new Response(JSON.stringify({
        error: `GPT-Live session creation failed: ${liveText.slice(0, 300)}`,
      }), {
        status: liveRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('[openai-realtime-proxy] Error creating GPT-Live session:', err);
      return new Response(JSON.stringify({ error: err?.message || 'Failed to initialize live session' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let sessionData: any = null;
  let lastFailureStatus: number | null = null;
  let lastFailureText = '';
  let successfulModel = '';

  // GA realtime models are only known to /v1/realtime/client_secrets. The legacy
  // /v1/realtime/sessions endpoint rejects them with "model does not exist",
  // which is what made an earlier fix wrongly conclude the mini model was bad
  // and cascade all the way back to the expensive 4o preview models.
  const resolved = await resolveRealtimeModel(openaiApiKey);
  const candidates = [...new Set([...(resolved ? [resolved] : []), ...REALTIME_MODEL_CANDIDATES])];

  for (const model of candidates) {
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
