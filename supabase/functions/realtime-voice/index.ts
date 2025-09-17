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
        // Create a fetch request to get the WebSocket URL with proper auth
        const authResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'realtime=v1'
          },
          body: JSON.stringify({
            model: 'gpt-4o-realtime-preview-2024-12-17',
            voice: 'alloy'
          })
        });

        if (!authResponse.ok) {
          const errorText = await authResponse.text();
          console.error("OpenAI auth failed:", authResponse.status, errorText);
          socket.close(1000, `OpenAI auth failed: ${authResponse.status}`);
          return;
        }

        const authData = await authResponse.json();
        console.log("OpenAI auth successful, got session data");

        // Use the session URL to connect via WebSocket
        if (authData.client_secret && authData.client_secret.value) {
          const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
          console.log("Connecting to OpenAI WebSocket...");
          
          openAISocket = new WebSocket(wsUrl, [`Bearer ${authData.client_secret.value}`, 'realtime']);
        } else {
          // Fallback to direct connection with API key
          const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
          console.log("Connecting to OpenAI WebSocket with direct auth...");
          
          openAISocket = new WebSocket(wsUrl);
          
          // Send auth after connection
          openAISocket.onopen = () => {
            console.log("Connected to OpenAI, sending auth...");
            openAISocket?.send(JSON.stringify({
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                instructions: 'You are ArcAI, a helpful and engaging voice assistant.',
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 1000
                }
              }
            }));
          };
        }

        openAISocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("Received from OpenAI:", data.type);
          
          // Forward all messages to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        
        openAISocket.onerror = (error) => {
          console.error("OpenAI WebSocket error:", error);
          socket.close(1000, "OpenAI connection failed");
        };

        openAISocket.onclose = (event) => {
          console.log("OpenAI WebSocket closed:", event.code, event.reason);
          socket.close(event.code || 1000, event.reason || "OpenAI connection closed");
        };

      } catch (error) {
        console.error("Error connecting to OpenAI:", error);
        socket.close(1000, `Failed to connect to OpenAI: ${error.message}`);
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