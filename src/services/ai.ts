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

// Streaming event types
export type StreamEvent = 
  | { type: 'start'; streaming: boolean }
  | { type: 'content'; content: string }
  | { type: 'tool_start'; tool: string; query?: string; fileType?: string }
  | { type: 'tool_complete'; tool: string; sources?: WebSource[]; result?: string }
  | { type: 'canvas_update'; content: string; label?: string }
  | { type: 'code_update'; code: string; language: string; label?: string }
  | { type: 'synthesizing'; tools: string[] }
  | { type: 'complete'; content: string; tool_calls_used?: string[]; web_sources?: WebSource[]; canvas_update?: CanvasUpdate; code_update?: CodeUpdate }
  | { type: 'error'; error: string };

export interface StreamCallbacks {
  onContent?: (chunk: string, fullContent: string) => void;
  onToolStart?: (tool: string, details?: any) => void;
  onToolComplete?: (tool: string, result?: any) => void;
  onCanvasUpdate?: (update: CanvasUpdate) => void;
  onCodeUpdate?: (update: CodeUpdate) => void;
  onSynthesizing?: (tools: string[]) => void;
  onComplete?: (result: SendMessageResult) => void;
  onError?: (error: string) => void;
}

export class AIService {
  private maxRetries = 2;
  private timeoutMs = 180000; // 3 minute timeout for canvas/code operations

  constructor() {
    // No API key needed - using secure edge function with Lovable Cloud
  }

  // Stream message with real-time updates
  async sendMessageStream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options?: {
      profile?: { display_name?: string | null; context_info?: string | null; memory_info?: string | null; preferred_model?: string | null };
      sessionId?: string;
      forceWebSearch?: boolean;
      forceCanvas?: boolean;
      forceCode?: boolean;
    }
  ): Promise<SendMessageResult> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Chat service is not available. Please configure Supabase.');
    }

    const { profile, sessionId, forceWebSearch, forceCanvas, forceCode } = options || {};

    // Get session model
    const selectedModel = sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash';

    console.log('🚀 Starting streaming request:', {
      model: selectedModel,
      forceCanvas,
      forceCode,
      forceWebSearch
    });

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    // Fetch fresh profile
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

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        messages,
        profile: effectiveProfile,
        model: selectedModel,
        sessionId,
        forceWebSearch: forceWebSearch || false,
        forceCanvas: forceCanvas || false,
        forceCode: forceCode || false,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Request failed: ${response.status}`);
      } catch {
        throw new Error(`Request failed: ${response.status} ${errorText}`);
      }
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let result: SendMessageResult = { content: '' };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue; // Skip event type line, we parse from data
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              
              // Handle different event types
              if (event.content !== undefined && !event.tool_calls_used) {
                // Content chunk
                fullContent += event.content;
                callbacks.onContent?.(event.content, fullContent);
              } else if (event.tool !== undefined && event.query !== undefined) {
                // Tool start
                callbacks.onToolStart?.(event.tool, event);
              } else if (event.tool !== undefined && (event.sources !== undefined || event.result !== undefined)) {
                // Tool complete
                callbacks.onToolComplete?.(event.tool, event);
              } else if (event.content !== undefined && event.label !== undefined && !event.code && !event.language) {
                // Canvas update
                const canvasUpdate = { content: event.content, label: event.label };
                result.canvasUpdate = canvasUpdate;
                callbacks.onCanvasUpdate?.(canvasUpdate);
              } else if (event.code !== undefined && event.language !== undefined) {
                // Code update
                const codeUpdate = { code: event.code, language: event.language, label: event.label };
                result.codeUpdate = codeUpdate;
                callbacks.onCodeUpdate?.(codeUpdate);
              } else if (event.tools !== undefined && Array.isArray(event.tools)) {
                // Synthesizing
                callbacks.onSynthesizing?.(event.tools);
              } else if (event.tool_calls_used !== undefined) {
                // Complete event
                result = {
                  content: event.content || fullContent,
                  webSources: event.web_sources,
                  canvasUpdate: event.canvas_update || result.canvasUpdate,
                  codeUpdate: event.code_update || result.codeUpdate
                };
                callbacks.onComplete?.(result);
              } else if (event.error !== undefined) {
                // Error event
                callbacks.onError?.(event.error);
                throw new Error(event.error);
              }
            } catch (e) {
              // Ignore parse errors for partial JSON
              if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                console.warn('SSE parse error:', e);
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6).trim());
          if (event.content && !event.tool_calls_used) {
            fullContent += event.content;
            callbacks.onContent?.(event.content, fullContent);
          }
        } catch (e) {}
      }

      // Ensure we have a final result
      if (!result.content) {
        result.content = fullContent;
      }

      return result;
    } catch (error) {
      console.error('Stream processing error:', error);
      throw error;
    }
  }

  // Original non-streaming method for backward compatibility
  async sendMessage(
    messages: AIMessage[],
    profile?: { display_name?: string | null; context_info?: string | null, memory_info?: string | null, preferred_model?: string | null },
    onToolUsage?: (tools: string[]) => void,
    sessionId?: string,
    forceWebSearch?: boolean,
    forceCanvas?: boolean,
    forceCode?: boolean
  ): Promise<SendMessageResult> {
    // Use streaming internally but provide the same interface
    return new Promise((resolve, reject) => {
      let result: SendMessageResult = { content: '' };
      let fullContent = '';

      this.sendMessageStream(messages, {
        onContent: (chunk, full) => {
          fullContent = full;
        },
        onToolStart: (tool) => {
          // Could track tool usage here
        },
        onToolComplete: (tool, data) => {
          if (onToolUsage) {
            // Accumulate tools
          }
        },
        onCanvasUpdate: (update) => {
          result.canvasUpdate = update;
        },
        onCodeUpdate: (update) => {
          result.codeUpdate = update;
        },
        onComplete: (finalResult) => {
          if (onToolUsage && finalResult.webSources) {
            onToolUsage(['web_search']);
          }
          resolve(finalResult);
        },
        onError: (error) => {
          reject(new Error(error));
        }
      }, {
        profile,
        sessionId,
        forceWebSearch,
        forceCanvas,
        forceCode
      }).catch(reject);
    });
  }

  async sendMessageWithImage(messages: AIMessage[], base64Images: string | string[]): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image analysis service is not available. Please configure Supabase.');
    }

    try {
      const images = Array.isArray(base64Images) ? base64Images : [base64Images];

      if (images.length > 4) {
        throw new Error('Maximum 4 images allowed for analysis');
      }

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
      let modelToUse = preferredModel;
      if (!modelToUse) {
        modelToUse = sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash';
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

  async editImage(prompt: string, baseImageUrls: string | string[], imageModel?: string): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image editing service is not available. Please configure Supabase.');
    }

    try {
      const images = Array.isArray(baseImageUrls) ? baseImageUrls : [baseImageUrls];

      if (images.length > 14) {
        throw new Error('Maximum 14 images allowed for combining');
      }

      const modelToUse = imageModel || sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash';

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

  detectFileGeneration(content: string): { fileType?: string; prompt?: string } | null {
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
