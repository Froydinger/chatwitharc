import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  console.log("Creating WebSocket relay to OpenAI Realtime API");

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openAISocket: WebSocket | null = null;
    const messageQueue: string[] = [];
    
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
        // Connect to OpenAI Realtime API using authenticated URL
        // OpenAI requires the API key to be passed in the URL for WebSocket connections
        const model = "gpt-4o-realtime-preview-2024-12-17";
        const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}&api_key=${openaiApiKey}`;
        console.log("Connecting to OpenAI WebSocket...");
        
        openAISocket = new WebSocket(wsUrl);

        openAISocket.onopen = () => {
          console.log("Successfully connected to OpenAI Realtime API!");
          
          // Send initial session configuration
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
          
          openAISocket!.send(JSON.stringify(sessionConfig));
          console.log("Session configuration sent");
          
          // Send any queued messages
          while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (msg) openAISocket!.send(msg);
          }
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
            socket.send(JSON.stringify({ 
              type: "error", 
              error: "OpenAI connection error" 
            }));
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
        const message = event.data;
        console.log("Received from client:", message.substring(0, 100));
        
        // Forward client messages to OpenAI
        if (openAISocket?.readyState === WebSocket.OPEN) {
          openAISocket.send(message);
        } else {
          console.log("OpenAI WebSocket not ready, queuing message");
          messageQueue.push(message);
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
