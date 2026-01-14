import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface WebSource {
  title: string;
  url: string;
  content?: string;
}

interface AIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  tool_calls_used?: string[];
  web_sources?: WebSource[];
}

export interface CanvasUpdate {
  content: string;
  label?: string;
}

export interface CodeUpdate {
  code: string;
  language: string;
  label?: string;
}

export interface SendMessageResult {
  content: string;
  webSources?: WebSource[];
  canvasUpdate?: CanvasUpdate;
  codeUpdate?: CodeUpdate;
}

export class AIService {
  private maxRetries = 2;
  private timeoutMs = 120000; // 120 second timeout for complex code generation

  constructor() {
    // No API key needed - using secure edge function with Lovable Cloud
  }

  // Wrapper for fetch with timeout
  private async fetchWithTimeout(
    fn: () => Promise<{ data: any; error: any }>,
    timeoutMs = this.timeoutMs
  ): Promise<{ data: any; error: any }> {
    return Promise.race([
      fn(),
      new Promise<{ data: any; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), timeoutMs)
      ),
    ]);
  }

  async sendMessage(
    messages: AIMessage[],
    profile?: { display_name?: string | null; context_info?: string | null, memory_info?: string | null, preferred_model?: string | null },
    onToolUsage?: (tools: string[]) => void,
    sessionId?: string,
    forceWebSearch?: boolean,
    forceCanvas?: boolean,
    forceCode?: boolean
  ): Promise<SendMessageResult> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Chat service is not available. Please configure Supabase.');
    }

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
      const selectedModel = sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash-lite';

      console.log('🤖 AI Model Selection:', {
        fromSessionStorage: sessionStorage.getItem('arc_session_model'),
        selectedModel: selectedModel,
        isWise: selectedModel === 'google/gemini-3-pro-preview',
        isFast: selectedModel === 'google/gemini-2.5-flash-lite'
      });

      // Call the secure edge function with retry logic
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const { data, error } = await this.fetchWithTimeout(() =>
            supabase.functions.invoke('chat', {
              body: {
                messages: messages,
                profile: effectiveProfile,
                model: selectedModel,
                sessionId: sessionId,
                forceWebSearch: forceWebSearch || false,
                forceCanvas: forceCanvas || false,
                forceCode: forceCode || false
              }
            })
          );

          if (error) {
            // Don't retry on client errors (except rate limits)
            if (error.message?.includes('Rate limit')) {
              throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
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
          }

          return {
            content: data.choices[0]?.message?.content || 'Sorry, I could not generate a response.',
            webSources: data.web_sources,
            canvasUpdate: data.canvas_update,
            codeUpdate: data.code_update
          };
        } catch (err: any) {
          lastError = err;
          
          // Check if it's a transient error worth retrying
          const isTransient = 
            err.message?.includes('timed out') ||
            err.message?.includes('network') ||
            err.message?.includes('502') ||
            err.message?.includes('503') ||
            err.message?.includes('504');
          
          if (isTransient && attempt < this.maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⚠️ Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}):`, err.message);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          
          throw err;
        }
      }
      
      throw lastError || new Error('Max retries exceeded');
    } catch (error) {
      console.error('AI Service Error:', error);
      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('timed out')) {
          throw new Error('The request took too long. Please try again with a shorter message.');
        }
        if (error.message.includes('Rate limit')) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
      }
      throw error;
    }
  }

  async sendMessageWithImage(messages: AIMessage[], base64Images: string | string[]): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image analysis service is not available. Please configure Supabase.');
    }

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
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image generation service is not available. Please configure Supabase.');
    }

    try {
      // Generating image with Gemini
      // Use session model if no specific model provided
      let modelToUse = preferredModel;
      if (!modelToUse) {
        // Get model from sessionStorage (same as chat)
        modelToUse = sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash-lite';
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
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image editing service is not available. Please configure Supabase.');
    }

    try {
      // Support both single image and array of images (max 14 for combining with Gemini 3 Pro)
      const images = Array.isArray(baseImageUrls) ? baseImageUrls : [baseImageUrls];

      if (images.length > 14) {
        throw new Error('Maximum 14 images allowed for combining');
      }

      // Use session model if no specific model provided
      const modelToUse = imageModel || sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash-lite';

      const { data, error } = await supabase.functions.invoke('edit-image', {
        body: { 
          prompt, 
          baseImageUrls: images,
          imageModel: modelToUse
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
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('File generation service is not available. Please configure Supabase.');
    }

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
