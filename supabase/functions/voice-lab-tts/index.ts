import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Voice Lab is an internal sandbox backed by Jake's own ElevenLabs account, so
// the key lives here and never reaches the browser. That makes this function
// the real security boundary: the page's admin check is UX only, and anyone can
// call this endpoint directly, so admin is re-verified server-side on every hit.
const ALLOWED_MODELS = new Set([
  'eleven_v3',
  'eleven_v3_conversational',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
  'eleven_multilingual_v2',
]);

const MAX_TEXT_LENGTH = 5000;

const clamp01 = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let userId: string;
  try {
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    userId = user.id;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  // admin_users is read with the service role: RLS on that table must not be
  // able to turn a failed lookup into a silent pass.
  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: adminRow, error: adminErr } = await adminClient
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminErr) {
      console.error('[VOICE-LAB-TTS] admin lookup failed', adminErr.message);
      return json({ error: 'Authorization check failed' }, 500);
    }
    if (!adminRow) return json({ error: 'Forbidden' }, 403);
  } catch (error) {
    console.error('[VOICE-LAB-TTS] admin lookup threw', error);
    return json({ error: 'Authorization check failed' }, 500);
  }

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!elevenKey) {
    return json({ error: 'ELEVENLABS_API_KEY not configured' }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) return json({ error: 'text is required' }, 400);
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `text exceeds ${MAX_TEXT_LENGTH} characters` }, 400);
  }

  const voiceId = typeof payload.voiceId === 'string' ? payload.voiceId.trim() : '';
  // Only allow a plain ElevenLabs voice id through: this value is pasted into a
  // URL, so anything path-like would let a caller steer the upstream request.
  if (!/^[A-Za-z0-9]{16,32}$/.test(voiceId)) {
    return json({ error: 'A valid voiceId is required' }, 400);
  }

  const modelId = typeof payload.modelId === 'string' ? payload.modelId : 'eleven_v3';
  if (!ALLOWED_MODELS.has(modelId)) {
    return json({ error: 'Unsupported modelId' }, 400);
  }

  const settings = (payload.voiceSettings ?? {}) as Record<string, unknown>;

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: clamp01(settings.stability, 0.5),
            similarity_boost: clamp01(settings.similarity_boost, 0.75),
            style: clamp01(settings.style, 0),
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      // Log upstream detail server-side, but never echo it back verbatim: it can
      // carry account and key metadata.
      console.error('[VOICE-LAB-TTS] ElevenLabs error', upstream.status, errorText.slice(0, 500));
      let message = `ElevenLabs API error (${upstream.status})`;
      try {
        const parsed = JSON.parse(errorText);
        const detail = parsed?.detail?.message ?? parsed?.message;
        if (typeof detail === 'string') message = detail;
      } catch {
        // keep the generic message
      }
      return json({ error: message }, upstream.status === 401 ? 502 : upstream.status);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[VOICE-LAB-TTS] request failed', error);
    return json({ error: 'Speech synthesis failed' }, 502);
  }
});
