import { supabase } from "@/integrations/supabase/client";

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAIService {
  constructor() {
    // No API key needed - using secure edge function
  }

  async sendMessage(messages: OpenAIMessage[], profile?: { display_name?: string | null; context_info?: string | null }): Promise<string> {
    try {
      // Add Arc's personality as system message with user personalization
      let systemPrompt = "You are ArcAI, a helpful AI assistant. Be concise, friendly, and direct. Keep responses short (1-2 sentences) unless more detail is specifically needed. When users ask for images, create them quickly. Be efficient and snappy in your responses.";
      
      if (profile?.display_name) {
        systemPrompt += ` The user's name is ${profile.display_name}.`;
      }
      
      if (profile?.context_info?.trim()) {
        systemPrompt += ` Additional context about the user: ${profile.context_info}`;
      }
      
      const systemMessage: OpenAIMessage = {
        role: 'system',
        content: systemPrompt
      };

      // Call the secure edge function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { messages: [systemMessage, ...messages] }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Chat service error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async sendMessageWithImage(messages: OpenAIMessage[], base64Image: string): Promise<string> {
    try {
      // Call edge function for image analysis
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { 
          messages,
          image: base64Image
        }
      });

      if (error) {
        console.error('Image analysis error:', error);
        throw new Error(`Image analysis error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data.content || 'Sorry, I could not analyze the image.';
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<string> {
    try {
      console.log('Generating image with prompt:', prompt);
      
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Image generation error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.success || !data.imageUrl) {
        throw new Error('Failed to generate image');
      }

      return data.imageUrl;
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }
}