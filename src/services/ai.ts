import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getModelForTask, resolveReasoningEffort, useModelStore } from "@/store/useModelStore";
import { detectsLocationIntent, getUserLocation, getCachedLocation, formatLocationForContext } from "@/lib/userLocation";

// Detect if a user message warrants upgrading to a more powerful model
export function detectComplexQuery(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase().trim();

  // Long messages suggest complex requests
  if (lower.length > 400) return true;

  // Multi-part questions (numbered lists or multiple question marks)
  const questionMarks = (lower.match(/\?/g) || []).length;
  if (questionMarks >= 3) return true;
  if (/(?:^|\n)\s*\d+[\.\)]\s/m.test(lower) && lower.length > 150) return true;

  // Analysis / reasoning keywords
  const analysisKeywords = [
    'explain in detail', 'analyze', 'analyse', 'compare and contrast',
    'step by step', 'in depth', 'in-depth', 'write me an essay',
    'break down', 'pros and cons', 'comprehensive', 'thorough',
    'detailed explanation', 'deep dive', 'elaborate on',
    'critically evaluate', 'summarize the research', 'long-form',
    // Explicit instructions to use a better/smarter/thinking model
    'better model', 'smarter model', 'thinking model', 'deep think',
    'deep-think', 'reasoning model', 'think about this', 'reason this',
    'switch models', 'upgrade model',
  ];
  if (analysisKeywords.some(k => lower.includes(k))) return true;

  // Code-related terms (without explicit /code prefix)
  const codeKeywords = [
    'debug this', 'refactor', 'implement a', 'algorithm for',
    'function that', 'write a script', 'code review', 'optimize this code',
    'build a component', 'create a class', 'data structure',
  ];
  if (codeKeywords.some(k => lower.includes(k))) return true;

  return false;
}

// Graded complexity still controls timeouts and task routing; Luna remains the model.
export function getQueryComplexity(message: string): 0 | 1 | 2 | 3 {
  if (!message) return 0;
  const lower = message.toLowerCase().trim();

  // Genuinely heavyweight requests.
  if (
    lower.length > 2000 ||
    lower.includes("deep think") ||
    lower.includes("deep-think") ||
    lower.includes("smartest model") ||
    lower.includes("deep reason")
  ) {
    return 3;
  }

  // Complex reasoning/coding requests.
  if (
    lower.length > 500 ||
    detectComplexQuery(message) ||
    lower.includes("thinking model") ||
    lower.includes("reasoning model") ||
    lower.includes("smarter model")
  ) {
    return 2;
  }

  // Moderate requests (complexity 1 -> Luna)
  if (lower.length > 150) {
    return 1;
  }

  return 0;
}

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const UI_CONTEXT_PROMPT: AIMessage = {
  role: 'system',
  content: `=== ARC PRODUCT AND SUPPORT CONTEXT ===
You are Arc, the assistant built into ArcAI at https://askarc.chat. Speak confidently about your own current product, but never invent a control or claim an action completed unless a tool or the UI actually completed it.

WHAT ARC CAN DO
- Chat and reason with Luna using Auto, Quick, Balanced, or Deep reasoning from the model control at the top of chat.
- Search the live web, check weather, search the signed-in user's past chats, and use saved memories when the relevant tool is available.
- Generate and revise images; understand attached images and camera frames; work with uploaded files.
- Draft long-form writing in Canvas, create code in Code Canvas, and generate downloadable files when requested.
- Create reminders and scheduled or recurring tasks, which are managed at https://askarc.chat/tasks.
- Share chats and use shared rooms. The App Builder is at https://askarc.chat/build.
- Open the in-app bug report form with open_bug_report whenever the user asks to report a bug, send feedback, contact the team, or says something is broken. Do not merely give them a link when you can open it.

VOICE MODE
- Voice is a live, interruptible conversation started from the voice control in chat. It can use web search, weather, memories, past-chat search, images, camera vision, reminders, and the bug-report form.
- Voice has no fixed five-minute conversation cap. It ends after 10 minutes with no user or assistant speech. Its transcript is saved into the current chat.

SUPPORT AND NAVIGATION
- Home/chat: https://askarc.chat/
- Dashboard and settings: https://askarc.chat/dashboard and https://askarc.chat/dashboard/settings
- Support and tickets: https://askarc.chat/support
- Documentation: https://askarc.chat/docs
- Pricing and upgrades: https://askarc.chat/pricing and https://askarc.chat/upgrade
- Downloads: https://askarc.chat/downloads
- Tasks: https://askarc.chat/tasks
Give short, exact steps and direct Markdown links for customer-support questions. If unsure about current account state, say what the user can check rather than guessing. Never claim staff can browse private chats or uploaded files; admin chat and storage audit browsers are disabled.

LOCATION
An explicitly stated user location always overrides browser geolocation, IP location, old chat metadata, or an older saved location. Never argue with the correction or continue using the stale city. Browser location can be approximate; if it conflicts with what the user says, use the user's city.

STYLE
Be natural and concise. Avoid routine canned closers such as "If you need anything else, just let me know." Leave most conversations open-ended, or simply end once the answer is complete.`
};

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
  searchProvider?: 'perplexity' | 'tavily';
  searchImages?: string[];
  canvasUpdate?: CanvasUpdate;
  codeUpdate?: CodeUpdate;
  memorySaved?: { content: string };
  weatherData?: import('@/components/WeatherCard').WeatherData;
  scheduledTask?: import('@/components/ScheduledTaskCard').ScheduledTaskData;
  notificationDispatch?: import('@/components/NotificationDispatchCard').NotificationDispatchData;
  locationUsed?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  modelUsed?: string;
}

export class AIService {
  private maxRetries = 2;
  private defaultTimeoutMs = 120000; // 120 second timeout for regular requests
  private canvasTimeoutMs = 180000; // 180 second timeout for canvas/code generation

  constructor() {
    // API keys stay server-side in the configured Supabase Edge Functions.
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
    forceResearch?: boolean,
    guestMode?: boolean,
    _modelOverride?: string
  ): Promise<SendMessageResult> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Chat service is not available. Please configure Supabase.');
    }

    // Guest mode: skip profile fetch, use simplified request
    if (guestMode) {
      return this.sendGuestMessage(messages);
    }

    try {
      // Always fetch the freshest profile to include latest memory/context
      let effectiveProfile = profile || {};
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Fetch profile and context blocks in parallel
          const [profileResult, contextBlocksResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('display_name, context_info, memory_info, preferred_model')
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('context_blocks')
              .select('content, source')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(50)
          ]);

          if (profileResult.data) {
            effectiveProfile = { ...effectiveProfile, ...profileResult.data };
          }

          // Merge context blocks into context_info for the AI
          if (contextBlocksResult.data && contextBlocksResult.data.length > 0) {
            const blocksText = contextBlocksResult.data
              .map((b: any) => b.content)
              .join('\n');
            const existing = (effectiveProfile as any).context_info || '';
            (effectiveProfile as any).context_info = existing
              ? `${existing}\n\n--- Remembered Context ---\n${blocksText}`
              : blocksText;
          }
        }
      } catch (e) {
        console.warn('Falling back to provided profile:', e);
      }

      // Auto-inject user location when the latest message implies it's relevant.
      // Uses cached location if available; otherwise silently requests permission once.
      let usedLocation: import('@/lib/userLocation').UserLocation | null = null;
      try {
        const lastUserText = messages.filter(m => m.role === 'user').pop()?.content || '';
        let loc = getCachedLocation();
        if (!loc && detectsLocationIntent(lastUserText)) {
          loc = await getUserLocation();
        }
        if (loc) {
          usedLocation = loc;
          const locLine = formatLocationForContext(loc);
          const existing = (effectiveProfile as any).context_info || '';
          (effectiveProfile as any).context_info = existing
            ? `${existing}\n\n${locLine}`
            : locLine;
        }
      } catch (e) {
        console.warn('Location injection skipped:', e);
      }


      // Model routing based on user's model family preference
      const isCanvasOrCode = forceCanvas || forceCode;
      
      // Check whether the last user message warrants the reasoning model
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const isComplex = !isCanvasOrCode && detectComplexQuery(lastUserMsg);
      
      const complexity = getQueryComplexity(lastUserMsg);
      const selectedModel = forceCode
        ? getModelForTask('code', complexity)
        : forceCanvas
          ? getModelForTask('file-gen', complexity)
          : forceWebSearch
            ? getModelForTask('chat', complexity)
            : isComplex
              ? getModelForTask('deep-chat', complexity)
              : getModelForTask('chat', complexity);
      const reasoningEffort = resolveReasoningEffort(useModelStore.getState().reasoningEffort, complexity);

      // Use longer timeout for canvas/code generation or complex queries (especially with 3.1 Pro)
      const timeoutMs = (isCanvasOrCode || isComplex) ? this.canvasTimeoutMs : this.defaultTimeoutMs;

      console.log('🤖 AI Model Selection:', {
        selectedModel,
        isCanvasOrCode,
        isComplex,
        reason: isCanvasOrCode ? 'canvas/code mode' : isComplex ? 'complex query detected' : 'regular chat',
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
                messages: [UI_CONTEXT_PROMPT, ...messages],
                profile: effectiveProfile,
                model: selectedModel,
                reasoningEffort,
                sessionId: sessionId,
                forceWebSearch: forceWebSearch || false,
                forceCanvas: forceCanvas || false,
                forceCode: forceCode || false,
                useProModel: isComplex || false,
                clientDateTime: new Date().toString(),
                clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                clientTimezoneOffsetMinutes: new Date().getTimezoneOffset()
              }
            }),
            timeoutMs
          );
          
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ AI request completed in ${(elapsed / 1000).toFixed(1)}s`);

          if (error) {
            let serviceMessage = '';
            try {
              const response = (error as any).context as Response | undefined;
              if (response) {
                const payload = await response.clone().json();
                serviceMessage = payload?.error || payload?.message || '';
              }
            } catch {
              // Fall back to the SDK message when no structured body is available.
            }
            // Don't retry on client errors (except rate limits)
            if (serviceMessage.toLowerCase().includes('rate limit') || error.message?.includes('Rate limit')) {
              throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
            throw new Error(serviceMessage || `Chat service error: ${error.message}`);
          }

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.tool_calls_used?.includes('open_bug_report')) {
            window.dispatchEvent(new CustomEvent('arc-open-bug-report'));
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
            searchProvider: data.search_provider,
            searchImages: data.search_images,
            canvasUpdate: data.canvas_update,
            codeUpdate: data.code_update,
            memorySaved: data.memory_saved,
            weatherData: data.weather_data,
            scheduledTask: data.scheduled_task,
            notificationDispatch: data.notification_dispatch,
            locationUsed: usedLocation ? {
              city: usedLocation.city,
              region: usedLocation.region,
              country: usedLocation.country,
              latitude: usedLocation.latitude,
              longitude: usedLocation.longitude,
            } : undefined,
            modelUsed: data.model_used,
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

  // Guest mode: simplified request without auth
  private async sendGuestMessage(messages: AIMessage[]): Promise<SendMessageResult> {
    const { data, error } = await this.fetchWithTimeout(() =>
      supabase!.functions.invoke('chat', {
        body: {
          messages,
          guest_mode: true,
        }
      }),
      this.defaultTimeoutMs
    );

    if (error) {
      throw new Error(`Chat service error: ${error.message}`);
    }
    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      content: data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.',
      webSources: [],
    };
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
    onDone?: (result: { mode: 'canvas' | 'code' | 'text'; content: string; label?: string; language?: string; webSources?: WebSource[]; modelUsed?: string }) => void,
    onError?: (error: string) => void,
    sessionId?: string,
    forceWebSearch?: boolean,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Chat service is not available. Please configure Supabase.');
    }

    // Model routing based on user's model family preference
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const isComplex = !(forceCanvas || forceCode) && detectComplexQuery(lastUserMsg);
    
    const complexity = getQueryComplexity(lastUserMsg);
    const selectedModel = forceCode
      ? getModelForTask('code', complexity)
      : forceCanvas
        ? getModelForTask('file-gen', complexity)
        : forceWebSearch
          ? getModelForTask('chat', complexity)
          : isComplex
            ? getModelForTask('deep-chat', complexity)
            : getModelForTask('chat', complexity);
    const reasoningEffort = resolveReasoningEffort(useModelStore.getState().reasoningEffort, complexity);

    // Enrich profile with context blocks (same as sendMessage)
    let enrichedProfile = profile || {};
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: contextBlocksData } = await supabase
          .from('context_blocks')
          .select('content')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (contextBlocksData && contextBlocksData.length > 0) {
          const blocksText = contextBlocksData.map((b: any) => b.content).join('\n');
          const existing = (enrichedProfile as any).context_info || '';
          (enrichedProfile as any).context_info = existing
            ? `${existing}\n\n--- Remembered Context ---\n${blocksText}`
            : blocksText;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch context blocks for streaming:', e);
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables are not configured');
    }

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
        messages: [UI_CONTEXT_PROMPT, ...messages],
        profile: enrichedProfile,
        model: selectedModel,
        reasoningEffort,
        forceCanvas,
        forceCode,
        forceWebSearch,
        sessionId,
        stream: true,
        useProModel: isComplex || false,
        clientDateTime: new Date().toString(),
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        clientTimezoneOffsetMinutes: new Date().getTimezoneOffset()
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

    // Inactivity watchdog: canvas/code streams can stall silently if the model
    // hangs or the edge function is killed mid-generation. Without this the
    // reader would await forever and the thinking indicator would spin with no
    // resolution. If no bytes arrive for STREAM_INACTIVITY_MS, we abort the
    // read so onError (and any auto-continuation) can recover instead of hanging.
    // 4 minutes is a healthy ceiling for slow write/code generations; the UI
    // shows a "hang tight" note after 60s so the wait is never silent.
    const STREAM_INACTIVITY_MS = 240000;
    let sawAnyData = false;
    let watchdogTimedOut = false;

    const readWithTimeout = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timer = setTimeout(() => {
        watchdogTimedOut = true;
        // Cancelling the reader rejects the pending read below.
        reader.cancel().catch(() => {});
        reject(new Error(sawAnyData
          ? 'Stream stalled — the response stopped partway through.'
          : 'Stream timed out before any response arrived.'));
      }, STREAM_INACTIVITY_MS);
      reader.read().then(
        (result) => { clearTimeout(timer); resolve(result); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });

    try {
      while (true) {
        if (abortSignal?.aborted) break;
        const { done, value } = await readWithTimeout();
        if (done) break;
        sawAnyData = true;

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
                webSources: event.webSources,
                modelUsed: event.model_used
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
      // User-initiated cancels surface as an aborted signal — stay silent so we
      // don't show an error toast for something the user did on purpose.
      if (abortSignal?.aborted && !watchdogTimedOut) {
        return;
      }
      console.error('Stream reading error:', error);
      onError?.(error instanceof Error ? error.message : 'Stream error');
    }
  }

  async sendMessageWithDocument(
    messages: AIMessage[],
    fileBase64: string,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Document analysis service is not available.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: { messages, fileBase64, fileName, mimeType, reasoningEffort: resolveReasoningEffort(useModelStore.getState().reasoningEffort, 2) }
      });

      if (error) {
        console.error('Document analysis error:', error);
        throw new Error(`Document analysis error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data.content || 'Sorry, I could not analyze the document.';
    } catch (error) {
      console.error('Document analysis error:', error);
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

      if (images.length > 16) {
        throw new Error('Maximum 16 images allowed for analysis');
      }

      // Use model family's image analysis model
      const selectedModel = getModelForTask('image-analysis');
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { 
          messages,
          images: images,
          model: selectedModel,
          reasoningEffort: resolveReasoningEffort(useModelStore.getState().reasoningEffort, 2),
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

  async generateImage(prompt: string, preferredModel?: string, aspectRatio?: string, count: number = 1): Promise<string[]> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image generation service is not available. Please configure Supabase.');
    }

    try {
      const modelToUse = preferredModel || 'gpt-image-2';
      const safeCount = Math.max(1, Math.min(3, Math.floor(count) || 1));

      console.log('generateImage called with:', { prompt, preferredModel, aspectRatio, modelToUse, count: safeCount });

      const { invokeEdgeFunction } = await import('@/lib/invokeEdgeFunction');
      const data: any = await invokeEdgeFunction('generate-image', {
        prompt,
        preferredModel: modelToUse,
        aspectRatio: aspectRatio || '3:2',
        count: safeCount,
      });

      if (data?.debugDetail) console.warn('🖼️ Image generation debug:', data.debugDetail);

      // Async path: the function enqueues and returns { jobId, status: 'pending' }
      // so a slow generation can't be killed mid-request by the edge runtime.
      if (data?.jobId && data?.status !== 'completed') {
        const { pollImageJob } = await import('@/lib/pollImageJob');
        const result = await pollImageJob(data.jobId);
        if (result.fallbackModel) {
          console.info(`🖼️ Generation fell back to ${result.fallbackModel}`);
          try {
            (window as any).__lastImageFallback = result.fallbackModel;
            window.dispatchEvent(new CustomEvent('imageFallbackUsed', { detail: { model: result.fallbackModel } }));
          } catch {}
        }
        window.dispatchEvent(new Event('arc-image-quota-changed'));
        return result.imageUrls;
      }

      // Legacy synchronous path (still supported)
      const urls: string[] = Array.isArray(data?.imageUrls) && data.imageUrls.length > 0
        ? data.imageUrls
        : (data?.imageUrl ? [data.imageUrl] : []);

      if (!data?.success || urls.length === 0) {
        throw new Error('Failed to generate image');
      }

      window.dispatchEvent(new Event('arc-image-quota-changed'));
      return urls;
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }

  async editImage(prompt: string, baseImageUrls: string | string[], imageModel?: string, aspectRatio?: string, count: number = 1): Promise<string[]> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Image editing service is not available. Please configure Supabase.');
    }

    try {
      const images = Array.isArray(baseImageUrls) ? baseImageUrls : [baseImageUrls];
      if (images.length > 10) throw new Error('Maximum 10 images allowed for combining');

      // GPT Image 2 is the only model that can edit. Quick mode (mini) and the
      // legacy model are silently upgraded rather than failing at the API.
      const modelToUse = 'gpt-image-2';
      if (imageModel && imageModel !== modelToUse) {
        console.info(`🖼️ Edit requested with ${imageModel}; using ${modelToUse} (only model that can edit).`);
      }
      const safeCount = Math.max(1, Math.min(3, Math.floor(count) || 1));

      const { invokeEdgeFunction } = await import('@/lib/invokeEdgeFunction');
      const data: any = await invokeEdgeFunction('edit-image', {
        prompt,
        baseImageUrls: images,
        imageModel: modelToUse,
        aspectRatio,
        count: safeCount,
      });

      // Async path: enqueue returns { jobId, status: 'pending' }
      if (data?.jobId && data?.status !== 'completed') {
        const { pollImageJob } = await import('@/lib/pollImageJob');
        const result = await pollImageJob(data.jobId);
        if (result.fallbackModel) {
          console.info(`🖼️ Edit fell back to ${result.fallbackModel}`);
          // Stash on a global so UI can read it for the in-progress edit
          try {
            (window as any).__lastImageFallback = result.fallbackModel;
            window.dispatchEvent(new CustomEvent('imageFallbackUsed', { detail: { model: result.fallbackModel } }));
          } catch {}
        }
        window.dispatchEvent(new Event('arc-image-quota-changed'));
        return result.imageUrls;
      }

      // Legacy synchronous path (still supported)
      const urls: string[] = Array.isArray(data?.imageUrls) && data.imageUrls.length > 0
        ? data.imageUrls
        : (data?.imageUrl ? [data.imageUrl] : []);
      if (!data?.success || urls.length === 0) throw new Error('Failed to edit image');
      window.dispatchEvent(new Event('arc-image-quota-changed'));
      return urls;
    } catch (error) {
      console.error('Image editing error:', error);
      throw error;
    }
  }

  /**
   * Generate a video (Boost/admin only). Pass `sourceImageUrl` to animate an
   * existing still instead of rendering from text alone.
   *
   * Resolves once the clip is finished AND cached in the browser. Nothing is
   * uploaded to Supabase — see src/lib/videoStorage.ts for why, and for what
   * that means when the same chat is opened on another device.
   */
  async generateVideo(
    prompt: string,
    opts: {
      seconds?: number;
      orientation?: 'landscape' | 'portrait';
      sourceImageUrl?: string;
      onProgress?: (progress: number) => void;
    } = {},
  ): Promise<{ jobId: string; seconds: number; size: string; byteSize: number }> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Video generation service is not available. Please configure Supabase.');
    }

    try {
      const { invokeEdgeFunction } = await import('@/lib/invokeEdgeFunction');
      const data: any = await invokeEdgeFunction('generate-video', {
        prompt,
        seconds: opts.seconds,
        orientation: opts.orientation,
        sourceImageUrl: opts.sourceImageUrl,
      });

      if (!data?.jobId) {
        throw new Error(data?.error || 'Failed to start video generation');
      }

      const { pollVideoJob } = await import('@/lib/pollVideoJob');
      const result = await pollVideoJob(data.jobId, { onProgress: opts.onProgress });
      window.dispatchEvent(new Event('arc-video-quota-changed'));
      return result;
    } catch (error) {
      console.error('Video generation error:', error);
      window.dispatchEvent(new Event('arc-video-quota-changed'));
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
      
      // Use file-gen model for document generation (best per family)
      const selectedModel = getModelForTask('file-gen');
      
      const { data, error } = await supabase.functions.invoke('generate-file', {
        body: { fileType, prompt, model: selectedModel, reasoningEffort: resolveReasoningEffort(useModelStore.getState().reasoningEffort, 2) },
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
