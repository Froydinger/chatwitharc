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
  private defaultTimeoutMs = 120000; // 120 second timeout for regular requests
  private canvasTimeoutMs = 180000; // 180 second timeout for canvas/code generation (Gemini 3 Pro is slower)

  constructor() {
    // No API key needed - using secure edge function with Lovable Cloud
  }

  // Wrapper for fetch with timeout
  private async fetchWithTimeout(
    fn: () => Promise<{ data: any; error: any }>,
    timeoutMs: number
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
    forceCode?: boolean,
    forceResearch?: boolean
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

      // Simplified model routing - hardcoded by mode
      // Chat: Gemini 3 Flash (fast), Code/Write: Gemini 3 Pro
      // Note: Research mode now uses Perplexity via separate edge function (perplexity-search)
      const isCanvasOrCode = forceCanvas || forceCode;
      const selectedModel = isCanvasOrCode
        ? 'google/gemini-3-pro-preview'  // Code/Canvas mode
        : 'google/gemini-3-flash-preview'; // Chat mode (default - fast)

      // Use longer timeout for canvas/code generation (especially with Gemini 3 Pro)
      const timeoutMs = isCanvasOrCode ? this.canvasTimeoutMs : this.defaultTimeoutMs;

      console.log('🤖 AI Model Selection:', {
        selectedModel: selectedModel,
        isCanvasOrCode,
        timeoutMs
      });

      // Call the secure edge function with retry logic
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const startTime = Date.now();
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
            }),
            timeoutMs
          );
          
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ AI request completed in ${(elapsed / 1000).toFixed(1)}s`);

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

  // Generic streaming method for ALL messages (canvas, code, or regular text)
  // Returns an AbortController that can be used to cancel the request
  async sendMessageStreaming(
    messages: AIMessage[],
    profile?: { display_name?: string | null; context_info?: string | null; memory_info?: string | null; preferred_model?: string | null },
    forceCanvas: boolean = false,
    forceCode: boolean = false,
    onStart?: (mode: 'canvas' | 'code' | 'text') => void,
    onDelta?: (content: string) => void,
    onDone?: (result: { mode: 'canvas' | 'code' | 'text'; content: string; label?: string; language?: string; webSources?: WebSource[] }) => void,
    onError?: (error: string) => void,
    sessionId?: string,
    forceWebSearch?: boolean,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Chat service is not available. Please configure Supabase.');
    }

    // Simplified model routing - hardcoded by mode
    const selectedModel = (forceCanvas || forceCode) 
      ? 'google/gemini-3-pro-preview'  // Code/Canvas mode
      : 'openai/gpt-5-mini';           // Chat mode (default)

    // Use hardcoded fallbacks to ensure URL is never undefined
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eXdob2RubmRhZ2JzbW5ibm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTkwNjUsImV4cCI6MjA4MTY3NTA2NX0.tmqRRB4jbOOR0FWVsS8zXer_2IZLjzsPb2D3Ozu2bKk";

    // Get the user's actual session token (NOT the anon key)
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || supabaseKey;

    const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        messages,
        profile,
        model: selectedModel,
        forceCanvas,
        forceCode,
        forceWebSearch,
        sessionId,
        stream: true
      }),
      signal: abortSignal, // Allow cancellation
    });

    if (!response.ok) {
      if (response.status === 429) {
        onError?.('Rate limit exceeded. Please try again later.');
        return;
      }
      if (response.status === 402) {
        onError?.('Payment required. Please add credits.');
        return;
      }
      const text = await response.text();
      onError?.(`Request failed: ${text}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]' || !jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'start') {
              onStart?.(event.mode || 'text');
            } else if (event.type === 'delta') {
              onDelta?.(event.content);
            } else if (event.type === 'done') {
              onDone?.({
                mode: event.mode || 'text',
                content: event.content,
                label: event.label,
                language: event.language,
                webSources: event.webSources
              });
            } else if (event.type === 'error') {
              onError?.(event.message);
            }
          } catch {
            // Incomplete JSON, continue
          }
        }
      }
    } catch (error) {
      console.error('Stream reading error:', error);
      onError?.(error instanceof Error ? error.message : 'Stream error');
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

      // Use GPT 5 Mini for image analysis
      const selectedModel = 'openai/gpt-5-mini';
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { 
          messages,
          images: images,
          model: selectedModel
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

  async generateImage(prompt: string, preferredModel?: string, aspectRatio?: string): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image generation service is not available. Please configure Supabase.');
    }

    try {
      // Generating image with Gemini (image gen always uses Gemini regardless of chat model)
      // Use session model if no specific model provided - backend will map to Gemini image model
      let modelToUse = preferredModel;
      if (!modelToUse) {
        // Get model from sessionStorage (backend maps to appropriate Gemini image model)
        modelToUse = sessionStorage.getItem('arc_session_model') || 'openai/gpt-5-nano';
      }

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          preferredModel: modelToUse,
          aspectRatio: aspectRatio || undefined
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

      // Use session model if no specific model provided (backend maps to Gemini for images)
      const modelToUse = imageModel || sessionStorage.getItem('arc_session_model') || 'openai/gpt-5-nano';

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
      
      // Use Gemini 3 Pro for file generation (complex content)
      const selectedModel = 'google/gemini-3-pro-preview';
      
      const { data, error } = await supabase.functions.invoke('generate-file', {
        body: { fileType, prompt, model: selectedModel },
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
