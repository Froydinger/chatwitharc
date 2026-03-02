import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection, sec-websocket-key, sec-websocket-version, sec-websocket-extensions, sec-websocket-protocol',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Allowed realtime voices — force unknown values to cedar
const ALLOWED_VOICES = new Set(['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Check for WebSocket upgrade FIRST ---
  const upgradeHeader = req.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response(
      JSON.stringify({ error: 'Expected WebSocket upgrade' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- Extract token from header or WS subprotocol (before upgrade) ---
  const authHeader = req.headers.get('authorization');
  const protocols = req.headers.get('sec-websocket-protocol') || '';

  let token = '';
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    const protoList = protocols.split(',').map(p => p.trim());
    const bearerProto = protoList.find(p => p.startsWith('bearer.'));
    if (bearerProto) {
      token = bearerProto.replace('bearer.', '');
      try { token = decodeURIComponent(token); } catch { /* keep raw */ }
    }
  }

  // --- Upgrade to WebSocket IMMEDIATELY (before any async auth) ---
  // This prevents the "Unexpected EOF" race where the client WS dies
  // while we're doing async HTTP auth calls.
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let openaiSocket: WebSocket | null = null;
  let openaiReady = false;
  let intentionalClose = false;
  const messageBuffer: string[] = [];
  const MAX_BUFFER_SIZE = 200;

  // Helpers
  function safeClientSend(obj: unknown) {
    try {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify(obj));
      }
    } catch (e) {
      console.error('[proxy] safeClientSend error:', e);
    }
  }

  function safeClientClose(code: number, reason: string) {
    try {
      if (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING) {
        clientSocket.close(code, reason);
      }
    } catch (e) {
      console.error('[proxy] safeClientClose error:', e);
    }
  }

  clientSocket.onopen = async () => {
    console.log('[proxy] Client WS open, starting auth...');

    // --- Auth: verify token AFTER WS is open ---
    if (!token) {
      console.error('[proxy] No auth token provided');
      safeClientSend({ type: 'error', error: { code: 'auth_failed', message: 'Missing auth token' } });
      safeClientClose(1008, 'Missing auth token');
      return;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user?.id) {
      console.error('[proxy] JWT verification failed:', userError?.message || 'no user');
      safeClientSend({ type: 'error', error: { code: 'auth_failed', message: 'Invalid auth token' } });
      safeClientClose(1008, 'Auth failed');
      return;
    }

    const userId = user.id;
    console.log('[proxy] Authenticated user:', userId);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[proxy] OPENAI_API_KEY not configured');
      safeClientSend({ type: 'error', error: { code: 'upstream_init_failed', message: 'Voice service not configured' } });
      safeClientClose(1011, 'No API key');
      return;
    }

    // --- Connect to OpenAI Realtime API ---
    const model = 'gpt-4o-realtime-preview-2025-06-03';
    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${model}`;

    try {
      openaiSocket = new WebSocket(openaiUrl, [
        'realtime',
        `openai-insecure-api-key.${openaiApiKey}`,
        'openai-beta.realtime-v1'
      ]);
    } catch (err) {
      console.error('[proxy] Failed to create upstream WS:', err);
      safeClientSend({ type: 'error', error: { code: 'upstream_init_failed', message: 'Failed to initialize voice connection' } });
      safeClientClose(1011, 'Upstream init failed');
      return;
    }

    openaiSocket.onopen = () => {
      console.log('[proxy] Upstream (OpenAI) connected');
      openaiReady = true;

      // Flush buffered messages
      while (messageBuffer.length > 0) {
        const msg = messageBuffer.shift();
        if (msg && openaiSocket?.readyState === WebSocket.OPEN) {
          openaiSocket.send(msg);
        }
      }
    };

    openaiSocket.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        try {
          const parsed = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
          if (parsed.type === 'session.created') {
            console.log('[proxy] Upstream session.created received');
          }
        } catch { /* relay anyway */ }
        clientSocket.send(event.data);
      }
    };

    openaiSocket.onerror = (error) => {
      console.error('[proxy] Upstream WS error:', error);
    };

    openaiSocket.onclose = (event) => {
      console.log('[proxy] Upstream closed:', event.code, event.reason || '(no reason)');
      openaiReady = false;

      if (intentionalClose) return;

      safeClientSend({
        type: 'error',
        error: {
          code: 'upstream_closed',
          message: `Voice upstream closed (${event.code})${event.reason ? `: ${event.reason}` : ''}`
        }
      });
      safeClientClose(1011, `Upstream closed: ${event.code}`);
    };
  };

  clientSocket.onmessage = (event) => {
    const data = typeof event.data === 'string' ? event.data : '';

    // Defensive: reject oversized messages
    if (data.length > 5_000_000) {
      console.warn('[proxy] Dropping oversized client message:', data.length, 'bytes');
      return;
    }

    // Sanitize voice in session.update messages
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'session.update' && parsed.session?.voice) {
        if (!ALLOWED_VOICES.has(parsed.session.voice)) {
          console.warn('[proxy] Sanitizing invalid voice:', parsed.session.voice, '→ cedar');
          parsed.session.voice = 'cedar';
          const sanitized = JSON.stringify(parsed);
          if (openaiReady && openaiSocket?.readyState === WebSocket.OPEN) {
            openaiSocket.send(sanitized);
          } else if (messageBuffer.length < MAX_BUFFER_SIZE) {
            messageBuffer.push(sanitized);
          }
          return;
        }
      }
    } catch { /* not JSON or parse failed, relay as-is */ }

    if (openaiReady && openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.send(data);
    } else if (messageBuffer.length < MAX_BUFFER_SIZE) {
      messageBuffer.push(data);
    } else {
      console.warn('[proxy] Message buffer full, dropping message');
    }
  };

  clientSocket.onerror = (error) => {
    console.error('[proxy] Client WS error:', error);
  };

  clientSocket.onclose = (event) => {
    console.log('[proxy] Client disconnected:', event.code, event.reason || '');
    intentionalClose = true;
    openaiReady = false;
    if (openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.close(1000, 'Client disconnected');
    }
  };

  return response;
});
