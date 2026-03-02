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
  let isAuthenticated = false;
  let authInProgress = false;
  let authTimeoutId: number | null = null;
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

  function clearAuthTimeout() {
    if (authTimeoutId !== null) {
      clearTimeout(authTimeoutId);
      authTimeoutId = null;
    }
  }

  const authenticateAndConnectUpstream = async (authToken: string) => {
    if (isAuthenticated || authInProgress) return;
    authInProgress = true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${authToken}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(authToken);

    if (userError || !user?.id) {
      console.error('[proxy] JWT verification failed:', userError?.message || 'no user');
      safeClientSend({ type: 'error', error: { code: 'auth_failed', message: 'Invalid auth token' } });
      safeClientClose(1008, 'Auth failed');
      authInProgress = false;
      return;
    }

    isAuthenticated = true;
    clearAuthTimeout();

    const userId = user.id;
    console.log('[proxy] Authenticated user:', userId);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[proxy] OPENAI_API_KEY not configured');
      safeClientSend({ type: 'error', error: { code: 'upstream_init_failed', message: 'Voice service not configured' } });
      safeClientClose(1011, 'No API key');
      authInProgress = false;
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
      authInProgress = false;
      return;
    }

    openaiSocket.onopen = () => {
      console.log('[proxy] Upstream (OpenAI) connected');
      openaiReady = true;
      authInProgress = false;

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

  clientSocket.onopen = () => {
    console.log('[proxy] Client WS open, awaiting auth...');

    if (token) {
      void authenticateAndConnectUpstream(token);
      return;
    }

    // Fallback path for clients that send token as first message
    authTimeoutId = setTimeout(() => {
      if (!isAuthenticated && !intentionalClose) {
        console.error('[proxy] Auth timeout waiting for client token');
        safeClientSend({ type: 'error', error: { code: 'auth_failed', message: 'Missing auth token' } });
        safeClientClose(1008, 'Missing auth token');
      }
    }, 8000) as unknown as number;
  };

  clientSocket.onmessage = (event) => {
    const data = typeof event.data === 'string' ? event.data : '';

    // Defensive: reject oversized messages
    if (data.length > 5_000_000) {
      console.warn('[proxy] Dropping oversized client message:', data.length, 'bytes');
      return;
    }

    // Handle auth sent as first message (preferred path for browser clients)
    try {
      const parsed = JSON.parse(data);

      if (!isAuthenticated) {
        if (parsed.type === 'auth' && typeof parsed.token === 'string' && parsed.token) {
          token = parsed.token;
          void authenticateAndConnectUpstream(token);
          return;
        }

        // Not authenticated yet: buffer non-auth messages until auth/upstream ready
        if (messageBuffer.length < MAX_BUFFER_SIZE) {
          messageBuffer.push(data);
        } else {
          console.warn('[proxy] Message buffer full before auth, dropping message');
        }
        return;
      }

      // Ignore auth messages after authenticated
      if (parsed.type === 'auth') {
        return;
      }

      // Sanitize voice in session.update messages
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
    } catch {
      // Not JSON or parse failed; continue and relay/buffer below.
      if (!isAuthenticated) {
        if (messageBuffer.length < MAX_BUFFER_SIZE) {
          messageBuffer.push(data);
        } else {
          console.warn('[proxy] Message buffer full before auth, dropping message');
        }
        return;
      }
    }

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
    clearAuthTimeout();
    if (openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.close(1000, 'Client disconnected');
    }
  };

  return response;
});
