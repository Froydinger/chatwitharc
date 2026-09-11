import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LIVE_MODEL = 'gpt-live-1';
const BACKEND_MODEL = 'gpt-5.6-luna';
const ALLOWED_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin',
  'nova', 'onyx', 'sage', 'shimmer', 'verse', 'quartz', 'ripple', 'vesper',
  'willow', 'stone', 'gleam', 'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder',
]);

type LiveSessionResponse = {
  transport?: { type?: unknown; sdp?: unknown };
  session?: { id?: unknown };
  sdp?: unknown;
  [key: string]: unknown;
};

const normalizeSdp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const sdp = value.replace(/^\uFEFF/, '').trimStart();
  return /^v=0(?:\r?\n|$)/.test(sdp) ? sdp : null;
};

// Safari can hand us an SDP offer with bare LF line endings. The browser is
// happy with that, but Live's SDP parser expects the wire-format CRLF form.
// Normalize only line endings and trailing whitespace; do not rewrite SDP
// attributes, candidates, fingerprints, or codecs.
const normalizeOfferSdp = (value: string): string => {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
  return `${lines.join('\r\n').replace(/\r\n$/, '')}\r\n`;
};

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
  let instructions: string | null = null;
  let backendInstructions: string | null = null;
  let tools: unknown[] = [];
  try {
    const body = await req.json();
    if (typeof body?.voice === 'string' && ALLOWED_VOICES.has(body.voice)) {
      requestedVoice = body.voice;
    }
    if (typeof body?.sdp === 'string' && body.sdp.trim()) {
      sdpOffer = normalizeOfferSdp(body.sdp.trim());
    }
    if (typeof body?.instructions === 'string' && body.instructions.trim()) instructions = body.instructions.trim();
    if (typeof body?.backendInstructions === 'string' && body.backendInstructions.trim()) {
      backendInstructions = body.backendInstructions.trim();
    }
    if (Array.isArray(body?.tools)) tools = body.tools;
  } catch {
    // Invalid JSON is handled below as a missing SDP offer.
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('[openai-realtime-proxy] OPENAI_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'Voice service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!sdpOffer) {
    return new Response(JSON.stringify({ error: 'Missing WebRTC SDP offer' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const liveSession = {
    model: LIVE_MODEL,
    instructions: instructions || 'You are Arc, a direct and warm voice assistant. Keep the conversation natural and concise. Delegate backend work before answering questions that require tools or careful reasoning. Do not guess while waiting.',
    audio: { output: { voice: requestedVoice } },
    delegation: {
      type: 'responses',
      responses: {
        model: BACKEND_MODEL,
        instructions: backendInstructions || 'You are Arc’s backend reasoning agent. Use only the supplied tools, respect application permissions, and return concise grounded results for spoken delivery. Do not claim an action succeeded until the tool confirms it.',
        tools,
        tool_choice: 'auto',
      },
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: liveSession, transport: { type: 'webrtc', sdp: sdpOffer } }),
    });
    const text = await response.text();
    let data: LiveSessionResponse | null;
    try { data = JSON.parse(text); } catch { data = null; }
    // The official Live response is { transport: { sdp } }. During the first
    // rollout, an older Arc function returned the same answer as top-level
    // `sdp`; accept that shape too so frontend/function deploys can overlap.
    const answerSdp = normalizeSdp(data?.transport?.sdp)
      ?? normalizeSdp(data?.sdp)
      ?? normalizeSdp(text);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `GPT-Live session creation failed: ${text.slice(0, 500)}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof answerSdp !== 'string' || !/^v=0(?:\r?\n|$)/.test(answerSdp)) {
      console.error('[openai-realtime-proxy] Live session returned no valid SDP answer');
      return new Response(JSON.stringify({ error: 'GPT-Live returned an invalid WebRTC SDP answer' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const responseData: LiveSessionResponse = data ?? {
      session: { id: null },
      transport: { type: 'webrtc', sdp: answerSdp },
    };
    responseData.transport = {
      ...(responseData.transport ?? {}),
      type: responseData.transport?.type ?? 'webrtc',
      sdp: answerSdp,
    };
    // Keep this alias temporarily for clients from the previous deployment.
    responseData.sdp = answerSdp;
    responseData.session_id = responseData.session?.id ?? null;
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[openai-realtime-proxy] GPT-Live session request failed:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'GPT-Live request failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
