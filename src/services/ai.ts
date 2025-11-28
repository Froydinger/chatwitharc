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
  tool_calls_used?: string[];
}

export class AIService {
  constructor() {
    // No API key needed - using secure edge function with Lovable Cloud
  }

  async sendMessage(
    messages: AIMessage[], 
    profile?: { display_name?: string | null; context_info?: string | null, memory_info?: string | null, preferred_model?: string | null },
    onToolUsage?: (tools: string[]) => void
  ): Promise<string> {
    try {
      // Always fetch the freshest profile to include latest memory/context
      let effectiveProfile = profile || {};
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('display_name, context_info, memory_info, preferred_model')
            .eq('user_id', user.id)
            .maybeSingle();
          if (data) {
            effectiveProfile = { ...effectiveProfile, ...data };
          }
        }
      } catch (e) {
        console.warn('Falling back to provided profile:', e);
      }

      // Determine which model to use - check sessionStorage (session-only)
      // This allows model changes within a session without persisting to database
      // Always defaults to Smart & Fast on refresh (sessionStorage is cleared)
      const selectedModel = sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash';

      // Call the secure edge function with profile data and model selection
      // Note: System prompt is handled by the backend using admin settings
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: messages,
          profile: effectiveProfile,
          model: selectedModel
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Chat service error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      // Notify about tool usage if callback provided
      console.log('📦 Response data:', { 
        hasToolCallsUsed: !!data.tool_calls_used, 
        toolCallsUsed: data.tool_calls_used,
        hasCallback: !!onToolUsage 
      });
      
      if (onToolUsage && data.tool_calls_used && data.tool_calls_used.length > 0) {
        console.log('🔔 Triggering onToolUsage callback with:', data.tool_calls_used);
        onToolUsage(data.tool_calls_used);
      } else {
        console.log('⚠️ Not triggering callback - missing:', {
          hasCallback: !!onToolUsage,
          hasTools: !!data.tool_calls_used,
          toolCount: data.tool_calls_used?.length
        });
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

  async generateImage(prompt: string, preferredModel?: string): Promise<string> {
    try {
      // Generating image with Gemini
      // If no model specified, fetch from profile
      let modelToUse = preferredModel;
      if (!modelToUse) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('preferred_model')
              .eq('user_id', user.id)
              .maybeSingle();
            modelToUse = data?.preferred_model || 'google/gemini-2.5-flash';
          }
        } catch (e) {
          console.warn('Could not fetch profile model, using default:', e);
          modelToUse = 'google/gemini-2.5-flash';
        }
      }
      
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          preferredModel: modelToUse
        }
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

      // Return both imageUrl and model used
      return data.imageUrl;
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }

  async editImage(prompt: string, baseImageUrls: string | string[], imageModel?: string): Promise<string> {
    try {
      // Support both single image and array of images (max 14 for combining with Gemini 3 Pro)
      const images = Array.isArray(baseImageUrls) ? baseImageUrls : [baseImageUrls];
      
      if (images.length > 14) {
        throw new Error('Maximum 14 images allowed for combining');
      }
      
      // Editing/combining image(s) with Gemini
      
      const { data, error } = await supabase.functions.invoke('edit-image', {
        body: { 
          prompt, 
          baseImageUrls: images,
          imageModel: imageModel || undefined
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

  async generateFile(fileType: string, prompt: string): Promise<{ fileUrl: string; fileName: string; mimeType: string; fileSize?: number }> {
    try {
      console.log('Generating file:', { fileType, prompt });

      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('generate-file', {
        body: { fileType, prompt },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`File generation error: ${error.message}`);
      }

      if (!data.success || !data.fileUrl) {
        throw new Error(data.error || 'Failed to generate file');
      }

      return {
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize
      };
    } catch (error) {
      console.error('File generation error:', error);
      throw error;
    }
  }

  // Helper to detect if AI response contains file generation request
  detectFileGeneration(content: string): { fileType?: string; prompt?: string } | null {
    // Look for patterns like "generate a PDF about..." or "create a document for..."
    const filePatterns = [
      /generate (?:a |an )?(pdf|docx|txt|xlsx|csv|json|xml|html|md) (?:about |for |with |that |containing )?(.+)/i,
      /create (?:a |an )?(pdf|docx|txt|xlsx|csv|json|xml|html|md) (?:about |for |with |that |containing )?(.+)/i,
      /make (?:a |an )?(pdf|docx|txt|xlsx|csv|json|xml|html|md) (?:about |for |with |that |containing )?(.+)/i,
    ];

    for (const pattern of filePatterns) {
      const match = content.match(pattern);
      if (match) {
        return {
          fileType: match[1].toLowerCase(),
          prompt: match[2].trim()
        };
      }
    }

    return null;
  }
}
