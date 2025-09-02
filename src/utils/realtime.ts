import { supabase } from "@/integrations/supabase/client";

export interface RealtimeMessage {
  content: string;
  role: 'user' | 'assistant';
  type: 'text';
}

export interface RealtimeConnectionOptions {
  onMessage: (message: RealtimeMessage) => void;
  onError: (error: string) => void;
  onComplete: () => void;
}

export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private clientSecret: string | null = null;
  private isConnected = false;
  private options: RealtimeConnectionOptions;

  constructor(options: RealtimeConnectionOptions) {
    this.options = options;
  }

  async connect(systemPrompt: string): Promise<void> {
    try {
      console.log('Creating realtime session...');
      
      // Get session from our edge function
      const { data, error } = await supabase.functions.invoke('realtime-session', {
        body: { instructions: systemPrompt }
      });

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }

      if (!data?.client_secret?.value) {
        throw new Error('No client secret received from session');
      }

      this.clientSecret = data.client_secret.value;
      console.log('Got client secret, connecting to realtime...');

      // Connect to OpenAI Realtime API
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-realtime`;
      this.ws = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-auth-${this.clientSecret}`
      ]);

      this.ws.onopen = () => {
        console.log('Realtime connection opened');
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received realtime message:', message);
          
          switch (message.type) {
            case 'response.output_text.delta':
              // Stream token chunks
              this.options.onMessage({
                content: message.delta || '',
                role: 'assistant',
                type: 'text'
              });
              break;
              
            case 'response.completed':
              console.log('Response completed');
              this.options.onComplete();
              break;
              
            case 'response.error':
              console.error('Realtime response error:', message);
              this.options.onError(message.error?.message || 'Unknown realtime error');
              break;
              
            default:
              console.log('Unhandled realtime message type:', message.type);
          }
        } catch (err) {
          console.error('Error parsing realtime message:', err);
          this.options.onError('Failed to parse message');
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.options.onError('Connection error');
      };

      this.ws.onclose = () => {
        console.log('Realtime connection closed');
        this.isConnected = false;
      };

    } catch (error) {
      console.error('Failed to connect to realtime:', error);
      this.options.onError(error instanceof Error ? error.message : 'Connection failed');
    }
  }

  sendUserText(text: string): void {
    if (!this.ws || !this.isConnected) {
      console.error('Cannot send message: not connected');
      return;
    }

    console.log('Sending user text:', text);
    
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: text
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(message));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.clientSecret = null;
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Feature flag
export const USE_REALTIME = false; // Set to true to enable realtime