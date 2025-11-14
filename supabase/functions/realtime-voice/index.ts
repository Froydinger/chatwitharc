import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  console.log("Received request with upgrade header:", upgradeHeader);

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log("Not a WebSocket request, returning 400");
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  // Verify authentication BEFORE upgrading to WebSocket
  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    console.error("Missing authorization header");
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Verify user token
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase configuration");
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError);
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  console.log("Authenticated user:", user.id, "- Creating WebSocket connection to OpenAI Realtime API");

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openAISocket: WebSocket | null = null;
    
    socket.onopen = async () => {
      console.log("Client WebSocket connected successfully");
      
      // Get OpenAI API key
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        console.error("OPENAI_API_KEY not found in environment variables");
        socket.close(1000, "API key not configured");
        return;
      }

      console.log("OPENAI_API_KEY found, creating session...");

      try {
        // First, create a session with OpenAI
        console.log("Creating OpenAI session...");
        const sessionResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
            instructions: "You are ArcAI, a helpful and engaging voice assistant. Speak naturally and conversationally. Be concise but friendly.",
            modalities: ["text", "audio"],
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000
            },
            temperature: 0.8,
            max_response_output_tokens: "inf"
          }),
        });

        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          console.error("Failed to create OpenAI session:", sessionResponse.status, errorText);
          socket.close(1000, `Session creation failed: ${sessionResponse.status}`);
          return;
        }

        const sessionData = await sessionResponse.json();
        console.log("Session created successfully:", sessionData);

        // Now connect to OpenAI using the session token
        const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
        console.log("Connecting to OpenAI WebSocket with session token...");
        
        // For session-based auth, we need to use the session token as Authorization header
        // but Deno WebSocket doesn't support headers, so we use a different approach
        openAISocket = new WebSocket(wsUrl, [`Bearer ${sessionData.client_secret.value}`]);

        openAISocket.onopen = () => {
          console.log("Successfully connected to OpenAI Realtime API!");
        };

        openAISocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("Received from OpenAI:", data.type);
            
            // Forward all messages to client
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(event.data);
            }
          } catch (error) {
            console.error("Error parsing OpenAI message:", error);
          }
        };
        
        openAISocket.onerror = (error) => {
          console.error("OpenAI WebSocket error:", error);
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(1000, "OpenAI connection failed");
          }
        };

        openAISocket.onclose = (event) => {
          console.log("OpenAI WebSocket closed:", event.code, event.reason);
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(event.code || 1000, event.reason || "OpenAI connection closed");
          }
        };

      } catch (error) {
        console.error("Error connecting to OpenAI:", error);
        socket.close(1000, `Failed to connect to OpenAI: ${error.message}`);
      }
    };

    socket.onmessage = (event) => {
      try {
        console.log("Received from client:", event.data);
        // Forward client messages to OpenAI
        if (openAISocket?.readyState === WebSocket.OPEN) {
          openAISocket.send(event.data);
        } else {
          console.log("OpenAI WebSocket not ready, message queued");
        }
      } catch (error) {
        console.error("Error handling client message:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("Client WebSocket error:", error);
    };

    socket.onclose = (event) => {
      console.log("Client WebSocket closed:", event.code, event.reason);
      if (openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.close();
      }
    };

    return response;
  } catch (error) {
    console.error("Error upgrading to WebSocket:", error);
    return new Response("WebSocket upgrade failed", { status: 500 });
  }
});