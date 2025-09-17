import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  console.log("Received request with upgrade header:", upgradeHeader);

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log("Not a WebSocket request, returning 400");
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  console.log("Creating WebSocket connection to OpenAI Realtime API");

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openAISocket: WebSocket | null = null;
    
    socket.onopen = () => {
      console.log("Client WebSocket connected successfully");
      
      // Connect to OpenAI Realtime API
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        console.error("OPENAI_API_KEY not found in environment variables");
        socket.close(1000, "API key not configured");
        return;
      }

      console.log("OPENAI_API_KEY found, connecting to OpenAI...");

      // Connect to OpenAI using proper WebSocket auth
      const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
      console.log("Connecting to OpenAI Realtime API with model gpt-4o-realtime-preview-2024-12-17");
      
      try {
        // Create WebSocket with proper headers
        openAISocket = new WebSocket(openaiUrl, {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        openAISocket.onopen = () => {
          console.log("Connected to OpenAI Realtime API - waiting for session.created event");
        };

        openAISocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("Received from OpenAI:", data.type);
          
          // Send session config after receiving session.created
          if (data.type === 'session.created') {
            console.log("Session created, sending session config");
            const sessionConfig = {
              type: "session.update",
              session: {
                modalities: ["text", "audio"],
                instructions: "You are ArcAI, a helpful and engaging voice assistant. Speak naturally and conversationally. Be concise but friendly.",
                voice: "alloy",
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
              }
            };
            openAISocket?.send(JSON.stringify(sessionConfig));
          }
          
          // Forward OpenAI messages to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        
        openAISocket.onerror = (error) => {
          console.error("OpenAI WebSocket error:", error);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ 
              type: "error", 
              error: "OpenAI connection failed" 
            }));
          }
        };

        openAISocket.onclose = (event) => {
          console.log("OpenAI WebSocket closed:", event.code, event.reason);
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(event.code, event.reason);
          }
        };
      } catch (error) {
        console.error("Error creating OpenAI WebSocket:", error);
        socket.close(1000, "Failed to connect to OpenAI");
      }
    };

    socket.onmessage = (event) => {
      console.log("Received from client:", event.data);
      // Forward client messages to OpenAI
      if (openAISocket?.readyState === WebSocket.OPEN) {
        openAISocket.send(event.data);
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