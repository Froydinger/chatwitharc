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

  async sendMessage(messages: OpenAIMessage[], profile?: { display_name?: string | null; context_info?: string | null, memory_info?: string | null }): Promise<string> {
    try {
      // Always fetch the freshest profile to include latest memory/context
      let effectiveProfile = profile || {};
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('display_name, context_info, memory_info')
            .eq('user_id', user.id)
            .maybeSingle();
          if (data) {
            effectiveProfile = { ...effectiveProfile, ...data };
          }
        }
      } catch (e) {
        console.warn('Falling back to provided profile:', e);
      }

      // Add Arc's personality as system message with user personalization
      let systemPrompt = "You are ArcAI, a helpful and conversational AI assistant. Be natural, brief, and direct. Give concise, focused responses. Avoid long lists of options or rambling explanations. Make clear recommendations instead of presenting endless choices. Keep it conversational and human-like, but prioritize brevity and clarity above all.";
      
      if (effectiveProfile?.display_name) {
        systemPrompt += ` The user's name is ${effectiveProfile.display_name}.`;
      }
      
      if (effectiveProfile?.context_info?.trim()) {
        systemPrompt += ` Context: ${effectiveProfile.context_info}`;
      }
      
      if (effectiveProfile?.memory_info?.trim()) {
        systemPrompt += ` Remember these details: ${effectiveProfile.memory_info}`;
      }

      // Ask the model to propose memory saves only for NEW user information (not recalled info)
      systemPrompt += " If the user shares NEW important personal information worth remembering (not information you're recalling from existing memories), include [MEMORY_SAVE] <brief natural sentence> [/MEMORY_SAVE] at the start of your response - this is invisible to users. Do NOT save information you're already recalling from memory.";
      
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