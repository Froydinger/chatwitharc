import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    console.log('Client connected to proxy');
    
    // Connect to OpenAI Realtime API - using gpt-realtime for vision support
    const openaiUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';
    
    openaiSocket = new WebSocket(openaiUrl, [
      'realtime',
      `openai-insecure-api-key.${openaiApiKey}`,
      'openai-beta.realtime-v1'
    ]);

    openaiSocket.onopen = () => {
      console.log('Connected to OpenAI Realtime');
      openaiReady = true;
      
      // Send any buffered messages
      while (messageBuffer.length > 0) {
        const msg = messageBuffer.shift();
        if (msg && openaiSocket?.readyState === WebSocket.OPEN) {
          openaiSocket.send(msg);
        }
      }
    };

    openaiSocket.onmessage = (event) => {
      // Forward OpenAI messages to client
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
      console.log('OpenAI connection closed:', event.code, event.reason);
      openaiReady = false;
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1000, 'OpenAI connection closed');
      }
    };
  };

  clientSocket.onmessage = (event) => {
    const data = typeof event.data === 'string' ? event.data : '';
    
    // Forward client messages to OpenAI
    if (openaiReady && openaiSocket?.readyState === WebSocket.OPEN) {
      openaiSocket.send(data);
    } else {
      // Buffer messages until OpenAI is ready
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
