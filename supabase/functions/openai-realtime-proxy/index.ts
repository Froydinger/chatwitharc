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

  // --- Auth: extract token from header or WS subprotocol ---
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

  if (!token) {
    console.error('[proxy] No auth token provided');
    return new Response(
      JSON.stringify({ error: 'Unauthorized - missing auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user via Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user?.id) {
    console.error('[proxy] JWT verification failed:', userError?.message || 'no user');
    return new Response(
      JSON.stringify({ error: 'Unauthorized - invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = user.id;
  console.log('[proxy] Authenticated user:', userId);

  // --- WebSocket upgrade check ---
  const upgradeHeader = req.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response(
      JSON.stringify({ error: 'Expected WebSocket upgrade' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('[proxy] OPENAI_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- Upgrade to WebSocket ---
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let openaiSocket: WebSocket | null = null;
  let openaiReady = false;
  let intentionalClose = false;
  const messageBuffer: string[] = [];
  const MAX_BUFFER_SIZE = 200;

  clientSocket.onopen = () => {
    console.log('[proxy] Client WS open, user:', userId);

    // Connect to OpenAI Realtime API
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
        // Log first event type for lifecycle debugging
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

      if (intentionalClose) return; // We initiated the close, don't relay

      // Relay structured error to client, then close
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

  return response;
});
