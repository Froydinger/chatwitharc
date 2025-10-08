import { supabase } from "@/integrations/supabase/client";

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class AIService {
  constructor() {
    // No API key needed - using secure edge function with Lovable Cloud
  }

  async sendMessage(messages: AIMessage[], profile?: { display_name?: string | null; context_info?: string | null, memory_info?: string | null }): Promise<string> {
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
      systemPrompt += " CRITICAL: Only use [MEMORY_SAVE] for completely NEW information the user shares that you don't already know. NEVER save information you're recalling or that's already in your memory. Check your existing memory carefully before saving anything new.";
      
      const systemMessage: AIMessage = {
        role: 'system',
        content: systemPrompt
      };

      // Call the secure edge function with profile data
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          messages: [systemMessage, ...messages],
          profile: effectiveProfile
        }
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
      console.error('AI Service Error:', error);
      throw error;
    }
  }

  async sendMessageWithImage(messages: AIMessage[], base64Images: string | string[]): Promise<string> {
    try {
      // Support both single image and array of images
      const images = Array.isArray(base64Images) ? base64Images : [base64Images];
      
      if (images.length > 4) {
        throw new Error('Maximum 4 images allowed for analysis');
      }
      
      // Call edge function for image analysis
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { 
          messages,
          images: images
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
      // Generating image with Gemini
      
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Image generation error: ${error.message}`);
      }

      if (data.error) {
        // Create a more specific error with type information
        const errorObj: any = new Error(data.error);
        errorObj.errorType = data.errorType || 'unknown';
        throw errorObj;
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

  async editImage(prompt: string, baseImageUrls: string | string[]): Promise<string> {
    try {
      // Support both single image and array of images (max 2 for combining)
      const images = Array.isArray(baseImageUrls) ? baseImageUrls : [baseImageUrls];
      
      if (images.length > 2) {
        throw new Error('Maximum 2 images allowed for combining');
      }
      
      // Editing/combining image(s) with Gemini
      
      const { data, error } = await supabase.functions.invoke('edit-image', {
        body: { 
          prompt, 
          baseImageUrls: images
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Image editing error: ${error.message}`);
      }

      if (data.error) {
        // Create a more specific error with type information
        const errorObj: any = new Error(data.error);
        errorObj.errorType = data.errorType || 'unknown';
        throw errorObj;
      }

      if (!data.success || !data.imageUrl) {
        throw new Error('Failed to edit image');
      }

      return data.imageUrl;
    } catch (error) {
      console.error('Image editing error:', error);
      throw error;
    }
  }
}
