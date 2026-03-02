import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection, sec-websocket-key, sec-websocket-version, sec-websocket-extensions, sec-websocket-protocol',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate user before WebSocket upgrade
  const authHeader = req.headers.get('authorization');
  const protocols = req.headers.get('sec-websocket-protocol') || '';
  
  // Extract token from Authorization header or WebSocket subprotocol
  let token = '';
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    // Check for token in WebSocket subprotocols (format: bearer.<token>)
    const protoList = protocols.split(',').map(p => p.trim());
    const bearerProto = protoList.find(p => p.startsWith('bearer.'));
    if (bearerProto) {
      token = bearerProto.replace('bearer.', '');
      try {
        token = decodeURIComponent(token);
      } catch {
        // keep raw token if not URI encoded
      }
    }
  }

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - missing auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user claims with Supabase signing keys
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    console.error('JWT verification failed:', claimsError?.message || 'missing sub claim');
    return new Response(
      JSON.stringify({ error: 'Unauthorized - invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('Authenticated WebSocket for user:', userId);

  // Check for WebSocket upgrade
  const upgradeHeader = req.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response(
      JSON.stringify({ error: 'Expected WebSocket upgrade' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  // Upgrade to WebSocket
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let openaiSocket: WebSocket | null = null;
  let openaiReady = false;
  const messageBuffer: string[] = [];

  clientSocket.onopen = () => {
    console.log('Client connected to proxy, user:', userId);
    
    // Connect to OpenAI Realtime API
    const openaiUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
    
    openaiSocket = new WebSocket(openaiUrl, [
      'realtime',
      `openai-insecure-api-key.${openaiApiKey}`,
      'openai-beta.realtime-v1'
    ]);

    openaiSocket.onopen = () => {
      console.log('Connected to OpenAI Realtime');
      openaiReady = true;
      
      while (messageBuffer.length > 0) {
        const msg = messageBuffer.shift();
        if (msg && openaiSocket?.readyState === WebSocket.OPEN) {
          openaiSocket.send(msg);
        }
      }
    };

    openaiSocket.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    openaiSocket.onerror = (error) => {
      console.error('OpenAI WebSocket error:', error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({
          type: 'error',
          error: { message: 'Connection to AI service failed' }
        }));
      }
    };

    openaiSocket.onclose = (event) => {
      console.log('OpenAI connection closed:', event.code, event.reason || '(no reason)');
      openaiReady = false;
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({
          type: 'error',
          error: {
            code: 'openai_socket_closed',
            message: `Voice upstream closed (${event.code})${event.reason ? `: ${event.reason}` : ''}`
          }
        }));
        clientSocket.close(1011, 'OpenAI connection closed');
      }
    };
  };

  clientSocket.onmessage = (event) => {
    const data = typeof event.data === 'string' ? event.data : '';
    
    if (openaiReady && openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.send(data);
    } else {
      messageBuffer.push(data);
    }
  };

  clientSocket.onerror = (error) => {
    console.error('Client WebSocket error:', error);
  };

  clientSocket.onclose = () => {
    console.log('Client disconnected');
    openaiReady = false;
    if (openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.close();
    }
  };

  return response;
});
