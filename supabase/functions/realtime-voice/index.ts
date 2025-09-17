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
    
    socket.onopen = async () => {
      console.log("Client WebSocket connected successfully");
      
      // Get OpenAI API key
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        console.error("OPENAI_API_KEY not found in environment variables");
        socket.close(1000, "API key not configured");
        return;
      }

      console.log("OPENAI_API_KEY found, connecting to OpenAI...");

      try {
        // For Deno, we need to make a proper HTTP request to upgrade to WebSocket
        // This is the correct way to connect with authentication headers
        const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        
        console.log("Making authenticated WebSocket connection to OpenAI");
        
        // Create a proper WebSocket connection with authentication
        const wsResponse = await fetch(openaiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'realtime=v1',
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': btoa(Math.random().toString()).substring(0, 24),
          },
        });

        if (!wsResponse.ok) {
          console.error("Failed to connect to OpenAI:", wsResponse.status, wsResponse.statusText);
          socket.close(1000, `OpenAI connection failed: ${wsResponse.status}`);
          return;
        }

        // If that doesn't work, let's try the direct WebSocket approach with URL auth
        // Since Deno's WebSocket constructor is limited, we'll try URL-based auth
        const wsUrl = `${openaiUrl}&authorization=${encodeURIComponent(`Bearer ${openaiApiKey}`)}`;
        console.log("Attempting direct WebSocket connection with URL auth");
        
        openAISocket = new WebSocket(wsUrl);

        openAISocket.onopen = () => {
          console.log("Successfully connected to OpenAI Realtime API!");
        };

        openAISocket.onmessage = (event) => {
          try {
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