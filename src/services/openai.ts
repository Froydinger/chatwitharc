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
      let systemPrompt = "You are ArcAI, a helpful AI assistant with a friendly and engaging personality. you can help with all general AI tasks. Keep things short conversational, unless asked to expand. Your main focus is mental health and creative help.";
      
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

  async sendMessageWithImage(messages: OpenAIMessage[], imageUrl: string): Promise<string> {
    try {
      // For image analysis, we'll need a separate edge function
      // For now, return a helpful message
      return "I can see you've shared an image! Image analysis will be available soon through our secure API.";
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<string> {
    try {
      // For image generation, we'll need a separate edge function
      // For now, return a helpful message
      throw new Error("Image generation will be available soon through our secure API.");
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }
}