import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// NOTE: saveResponseToDatabase was removed - frontend now handles all persistence
// to avoid race conditions and duplicate messages from double-saves.

// Retry wrapper for AI calls
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Don't retry client errors (4xx) except rate limits
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      
      // Retry on rate limits and server errors
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`⚠️ AI call failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⚠️ AI call threw error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Web search result interface
interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface WebSearchResponse {
  summary: string;
  sources: WebSearchResult[];
}

// Web search tool using Tavily API
async function webSearch(query: string): Promise<WebSearchResponse> {
  const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');
  if (!tavilyApiKey) {
    return { summary: "Web search is not configured. Please add TAVILY_API_KEY.", sources: [] };
  }

  try {
    console.log('Performing web search for:', query);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: 'advanced', // Changed from 'basic' for better quality
        max_results: 5,
        include_answer: true,
        include_raw_content: true, // Now fetches full page content!
        include_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tavily API error:', response.status, errorText);
      return { summary: `Search failed: ${response.status}`, sources: [] };
    }

    const data = await response.json();
    console.log('Search results received:', data.results?.length || 0, 'results');
    
    // Extract sources for frontend display
    const sources: WebSearchResult[] = [];
    
    // Format results for the AI
    let searchSummary = '';
    if (data.answer) {
      searchSummary = `Quick Answer: ${data.answer}\n\n`;
    }
    
    if (data.results && data.results.length > 0) {
      searchSummary += 'Search Results:\n';
      data.results.forEach((result: any, idx: number) => {
        searchSummary += `${idx + 1}. ${result.title}\n`;
        // Use raw_content if available (full page text), otherwise fall back to snippet
        const pageContent = result.raw_content || result.content || '';
        searchSummary += `   ${pageContent}\n`;
        searchSummary += `   Source: ${result.url}\n\n`;

        // Add to sources array for frontend (keep short snippet for display)
        sources.push({
          title: result.title,
          url: result.url,
          content: result.content?.slice(0, 200) || ''
        });
      });
    }
    
    return { 
      summary: searchSummary || 'No relevant results found.',
      sources 
    };
  } catch (error: unknown) {
    console.error('Web search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { summary: `Search error: ${message}`, sources: [] };
  }
}

// Search past chats tool - AI-powered analysis
async function searchPastChats(query: string, authHeader: string | null, options?: { limitContext?: boolean }): Promise<string> {
  try {
    console.log('Searching past chats for:', query);
    
    if (!authHeader) {
      console.error('No auth header provided for chat search');
      return "Unable to search past chats: Not authenticated.";
    }

    // Create supabase client with auth token
    const token = authHeader.replace('Bearer ', '');
    const supabaseWithAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error in chat search:', userError);
      return "Unable to search past chats: Authentication failed.";
    }

    console.log('Authenticated user for chat search:', user.id);

    // Limit chat history context based on parameters - canvas/code don't need full history
    const limitedSearch = options?.limitContext;
    const sessionLimit = limitedSearch ? 10 : 1000;
    const contentLimit = limitedSearch ? 500 : undefined; // Truncate each message

    // Get chat sessions with configurable limits
    const { data: sessions, error: sessionsError } = await supabaseWithAuth
      .from('chat_sessions')
      .select('id, title, messages, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(sessionLimit);

    if (sessionsError) {
      console.error('Chat search error:', sessionsError);
      return "Unable to search past chats.";
    }

    if (!sessions || sessions.length === 0) {
      return "No past chats found.";
    }

    console.log(`Analyzing ${sessions.length} recent conversations`);

    // Build comprehensive context from conversations
    let conversationContext = `I found ${sessions.length} recent conversations. Here's what I gathered:\n\n`;
    
    sessions.forEach((session: any, idx) => {
      const title = session.title || 'Untitled';
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const date = new Date(session.updated_at).toLocaleDateString();
      
      conversationContext += `--- Conversation ${idx + 1}: "${title}" (${date}) ---\n`;

      // Include conversation content with optional limits
      messages.forEach((msg: any) => {
        if (msg.role && msg.content) {
          const prefix = msg.role === 'user' ? 'User' : 'Assistant';
          // Apply content limit if set
          const content = contentLimit && msg.content.length > contentLimit
            ? msg.content.slice(0, contentLimit) + '...'
            : msg.content;
          conversationContext += `${prefix}: ${content}\n`;
        }
      });
      
      conversationContext += '\n';
    });

    conversationContext += `\nNow analyze these conversations to answer: "${query}"\n`;
    conversationContext += `Please synthesize insights, identify patterns, make inferences, and provide a thoughtful analysis based on what you see in these conversations.`;

    console.log('📊 Conversation context length:', conversationContext.length);
    console.log('📝 First 500 chars:', conversationContext.slice(0, 500));

    return conversationContext;
  } catch (error: unknown) {
    console.error('Past chat search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Search error: ${message}`;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Authenticated user:', user.id);

    const { messages, profile, model, sessionId, forceWebSearch, forceCanvas, forceCode, stream } = await req.json();

    console.log('📊 Request details:', {
      model: model || 'google/gemini-3-flash-preview (default)',
      messageCount: messages?.length || 0,
      hasProfile: !!profile,
      sessionId: sessionId || 'none (will not save in background)',
      forceWebSearch: !!forceWebSearch,
      forceCanvas: !!forceCanvas,
      forceCode: !!forceCode,
      stream: !!stream
    });

    // Input validation
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate message count (prevent DoS)
    if (messages.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Too many messages (max 100)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate individual messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Limit message content length (prevent DoS)
      if (typeof msg.content === 'string' && msg.content.length > 50000) {
        return new Response(
          JSON.stringify({ error: 'Message content too long (max 50000 characters)' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Validate model if provided
    const allowedModels = [
      // Gemini models (2 tiers)
      'google/gemini-3-flash-preview',  // Quick
      'google/gemini-3-pro-preview',    // Wise & Thoughtful
      // GPT models (3 tiers)
      'openai/gpt-5-nano',              // Quick
      'openai/gpt-5.2',                 // Smarter & Quick
      'openai/gpt-5',                   // Wise & Thoughtful
      // Legacy support
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-lite',
      'openai/gpt-5-mini'
    ];
    if (model && !allowedModels.includes(model)) {
      return new Response(
        JSON.stringify({ error: 'Invalid model specified' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Fetch admin settings for system prompt and global context
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['system_prompt', 'global_context', 'enable_step_by_step']);

    const settings = settingsData?.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>) || {};

    const systemPrompt = settings.system_prompt || 'You are Arc AI, a helpful assistant.';
    const globalContext = settings.global_context || '';
    const enableStepByStep = settings.enable_step_by_step === 'true';

    // Check if this is a wellness check or step-by-step type request
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const isWellnessCheck = lastMessage.includes('wellness check') || 
                           lastMessage.includes('mood') ||
                           lastMessage.includes('energy level') ||
                           lastMessage.includes('step by step') ||
                           lastMessage.includes('guide me through');

    // Build enhanced system prompt - Admin prompt is PRIMARY and defines personality/behavior
    let enhancedSystemPrompt = systemPrompt;

    // Add user context (keep this minimal)
    if (profile?.display_name) {
      enhancedSystemPrompt += `\n\nUser: ${profile.display_name}`;
    }
    if (profile?.context_info?.trim()) {
      enhancedSystemPrompt += ` | Context: ${profile.context_info}`;
    }
    if (profile?.memory_info?.trim()) {
      enhancedSystemPrompt += `\n\n📝 Memories: ${profile.memory_info}`;
    }
    if (globalContext) {
      enhancedSystemPrompt += `\n\nGlobal: ${globalContext}`;
    }

    // Brief technical capabilities (trimmed from 100+ lines to essentials)
    enhancedSystemPrompt += '\n\n--- TOOLS ---\n' +
      '• web_search: Get current info from the web - When you use this tool, ALWAYS synthesize and summarize the search results in your own words. NEVER just say "click on the sources" - actually answer the user\'s question using the information from the sources.\n' +
      '• search_past_chats: Analyze user\'s conversation history\n' +
      '• generate_file: Create downloadable docs (PDFs, etc.) - NOT for code\n' +
      '• Image generation: Users click the image button\n\n' +
      '--- CODING (only when explicitly requested) ---\n' +
      '• Trigger words: "build", "create", "code", "make", "write"\n' +
      '• Use markdown code blocks (```html, ```css, ```js)\n' +
      '• Default to conversation, not coding\n';

    // CRITICAL: Brevity for conversation, but COMPLETE for tools
    enhancedSystemPrompt += '\n\n=== RESPONSE STYLE (CRITICAL) ===\n' +
      'For REGULAR CONVERSATION: Keep responses SHORT and CONCISE. Be direct. No fluff.\n' +
      'For TOOL OUTPUTS (update_canvas, update_code): Output the COMPLETE content. Never truncate or cut off.\n' +
      'When using update_canvas or update_code tools, you MUST provide the FULL content - do not summarize or shorten.\n' +
      'If writing a blog post, essay, or code - write the ENTIRE thing, not just a partial draft.\n\n' +
      '=== CODE OUTPUT RULES (CRITICAL) ===\n' +
      '• ALWAYS output COMPLETE, FULL code - from <!DOCTYPE> to </html>\n' +
      '• For HTML: Include ALL CSS in <style> tags and ALL JS in <script> tags - single file\n' +
      '• When modifying code: PRESERVE ALL existing styles, animations, and features\n' +
      '• NEVER remove CSS or functionality unless explicitly asked\n' +
      '• NEVER truncate, summarize, or say "rest of code here" - output EVERYTHING';

    // Prepare messages with enhanced system prompt
    let conversationMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...messages.filter(m => m.role !== 'system') // Remove any existing system messages
    ];
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Define tools including web search, chat search, canvas update, and file generation
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web ONLY for current information, news, facts, or real-time data from external sources. Use this when you need information beyond your training data. DO NOT use this tool for generating code, HTML, or any programming content - respond with those directly in your message.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to look up on the web"
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_past_chats",
          description: "Retrieves and analyzes the user's recent conversation history. This tool provides full conversation context (not just keyword matches) so you can synthesize insights, identify patterns, make inferences, and answer questions by actually reading through their chat history. Use this when the user asks questions about themselves, their interests, patterns, or anything that would require understanding their past conversations. The tool will provide you with actual conversation excerpts to analyze.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The question or topic to analyze from past conversations. This guides what you should look for and synthesize from the conversation history provided."
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_canvas",
          description: "Write or update content in the user's writing Canvas. Use this tool when the user asks you to write, draft, edit, revise, improve, format, or create content like blog posts, essays, articles, stories, notes, outlines, scripts, emails, etc. CRITICAL: When the user has existing content and asks to modify it, you MUST use this tool to output the COMPLETE updated content. The content will appear in their Canvas editor where they can review and edit it. This is the PRIMARY and ONLY tool for any writing/drafting request - do NOT use web_search or any other tool when editing canvas content.",
          parameters: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The COMPLETE markdown content to put in the Canvas. When modifying existing content, include ALL the content, not just the changed parts. IMPORTANT: You MUST use proper markdown formatting - use # for h1, ## for h2, ### for h3 headings, **bold** for emphasis, *italic* for italics, - or * for bullet lists, 1. 2. 3. for numbered lists, > for blockquotes, and proper paragraph breaks."
              },
              label: {
                type: "string",
                description: "A short label for this version (e.g., 'Blog Post Draft', 'Email Draft')"
              }
            },
            required: ["content"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_code",
          description: "Write or update code in the user's Code Canvas. Use this tool when the user asks you to write, create, build, modify, update, fix, or enhance code, components, scripts, HTML pages, or any programming content. CRITICAL RULES: 1) ALWAYS output COMPLETE code - never partial or truncated. 2) For HTML files, ALWAYS include ALL CSS styles (in <style> tags) and ALL JavaScript (in <script> tags) in the same file - the preview renders a single file. 3) When modifying existing code, PRESERVE ALL existing styles and functionality - NEVER remove CSS, animations, or features unless explicitly asked. 4) Output the FULL file from <!DOCTYPE> to </html>. The code will appear in their Code Canvas editor with live preview.",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The COMPLETE code content. MUST include ALL HTML, CSS (<style>), and JavaScript (<script>) in one file. When modifying code, include EVERYTHING - all original styles, all original scripts, all original structure. NEVER omit or truncate. NEVER remove existing CSS or features."
              },
              language: {
                type: "string",
                description: "The programming language (e.g., 'javascript', 'typescript', 'tsx', 'html', 'css', 'python', 'sql')"
              },
              label: {
                type: "string",
                description: "A short label for this code (e.g., 'React Button Component', 'API Handler')"
              }
            },
            required: ["code", "language"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "generate_file",
          description: "Generate a DOWNLOADABLE FILE (PDF, spreadsheet, data file). Use ONLY when the user explicitly wants to download a document - e.g., 'download as PDF', 'create a spreadsheet file', 'export to CSV'. For writing tasks like blog posts, essays, articles, emails, notes, etc. - use update_canvas instead, NOT this tool. For code - use update_code instead.",
          parameters: {
            type: "object",
            properties: {
              fileType: {
                type: "string",
                description: "The type of file to generate (pdf, txt, xlsx, csv, json, etc.)"
              },
              prompt: {
                type: "string",
                description: "Detailed description of what content should be in the file"
              }
            },
            required: ["fileType", "prompt"],
            additionalProperties: false
          }
        }
      }
    ];

    // Detect if user explicitly wants canvas or code
    // Priority: forceCode/forceCanvas from frontend > message content detection > forceWebSearch
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const messageWantsCanvas = lastUserMessage.includes('use the update_canvas tool') ||
                               lastUserMessage.includes('update_canvas') ||
                               lastUserMessage.includes('canvas tool');
    const messageWantsCode = lastUserMessage.includes('use the update_code tool') ||
                             lastUserMessage.includes('update_code') ||
                             lastUserMessage.includes('code canvas') ||
                             lastUserMessage.includes('existing code to modify');

    // Use explicit flags from frontend, fallback to message detection
    const wantsCanvas = forceCanvas || messageWantsCanvas;
    const wantsCode = forceCode || messageWantsCode;

    // Determine tool_choice: CANVAS/CODE ALWAYS TAKES PRIORITY over web search
    // This prevents the AI from using web_search when user is clearly editing canvas/code
    let toolChoice: any = "auto";
    let toolsToUse = tools; // Default to all tools

    // For canvas/code operations, we skip the search tools to reduce latency
    // The AI doesn't need to search chat history when generating code/content
    const isCanvasOrCodeMode = wantsCode || wantsCanvas;
    
    if (wantsCode) {
      // Code editing takes highest priority - ONLY provide update_code tool
      toolChoice = { type: "function", function: { name: "update_code" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_code');
      console.log('🔧 Forcing update_code tool (code editing mode) - limiting to code tool only');
    } else if (wantsCanvas) {
      // Canvas editing takes second priority - ONLY provide update_canvas tool
      toolChoice = { type: "function", function: { name: "update_canvas" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_canvas');
      console.log('🔧 Forcing update_canvas tool (canvas editing mode) - limiting to canvas tool only');
    } else if (forceWebSearch) {
      // Web search only when not doing canvas/code editing
      toolChoice = { type: "function", function: { name: "web_search" } };
      console.log('🔧 Forcing web_search tool (forceWebSearch=true)');
    }
    
    // For canvas/code mode, use a trimmed system prompt for better performance
    if (isCanvasOrCodeMode) {
      // Replace the long system prompt with a focused one for code/canvas
      const focusedPrompt = wantsCode 
        ? `You are Arc AI. Generate COMPLETE, FULL code as requested. Use the update_code tool.

CRITICAL CODE GUIDELINES:
1. Always output the ENTIRE code from start to finish. Never truncate.
2. For HTML: Include ALL CSS in <style> and ALL JS in <script> tags in one file.
3. When modifying code: PRESERVE all existing styles, animations, and features.
4. KEEP IT SIMPLE AND CONCISE. Aim for clean, minimal implementations.
   - For a timer: ~100-200 lines max, not 1000 lines
   - For a todo app: ~150-250 lines max
   - Focus on core functionality first, keep styling elegant but minimal
   - Don't over-engineer with unnecessary features unless asked
5. Make apps unique and polished, but not bloated. Quality over quantity.`
        : `You are Arc AI, a helpful writing assistant. The user has requested written content.

YOUR TASK: Write the ACTUAL content they requested (blog post, essay, article, email, etc.).
DO NOT output instructions, prompts, outlines, or meta-content about what to write.
DO NOT include placeholder text like "[insert X here]" or notes to yourself.
WRITE the actual finished piece of writing, ready to read.

Use proper markdown formatting:
- # for main title
- ## and ### for subheadings  
- **bold** for emphasis
- *italic* for subtle emphasis
- - or * for bullet lists
- Proper paragraph breaks

Output the complete, finished writing using the update_canvas tool.`;
      
      // Replace system message with focused version
      conversationMessages[0] = { role: 'system', content: focusedPrompt };
      console.log('⚡ Using optimized system prompt for canvas/code mode');
    }

    // First AI call with tools - use fetchWithRetry for resilience
    const startTime = Date.now();
    let selectedModel = model || 'google/gemini-3-flash-preview';
    const fallbackModel = 'google/gemini-3-flash-preview'; // Fallback for canvas/code if Pro times out
    
    // For code mode, upgrade to the best model for each provider
    // Gemini: use gemini-3-pro-preview, GPT: use gpt-5.2
    if (wantsCode) {
      if (selectedModel.startsWith('google/')) {
        selectedModel = 'google/gemini-3-pro-preview';
        console.log('🔧 Code mode: upgraded Gemini model to gemini-3-pro-preview');
      } else if (selectedModel.startsWith('openai/')) {
        selectedModel = 'openai/gpt-5.2';
        console.log('🔧 Code mode: upgraded GPT model to gpt-5.2');
      }
    }
    
    // OpenAI models use max_completion_tokens, Gemini uses max_tokens
    const isOpenAIModel = selectedModel.startsWith('openai/');
    const tokenParam = isOpenAIModel 
      ? { max_completion_tokens: 65536 }
      : { max_tokens: 65536 };
    
    console.log('🤖 Making AI request with model:', selectedModel);
    console.log('📋 Tools provided to AI:', toolsToUse.map(t => t.function.name));
    
    // ========== STREAMING MODE ==========
    // When stream=true, stream content directly to client (for all message types)
    if (stream) {
      const isCanvasOrCodeMode = wantsCode || wantsCanvas;
      console.log('🌊 Using streaming mode', isCanvasOrCodeMode ? 'for canvas/code' : 'for text');
      
      const streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationMessages,
          tools: toolsToUse,
          tool_choice: toolChoice,
          stream: true,
          ...tokenParam,
        }),
      });
      
      if (!streamResponse.ok) {
        const errorData = await streamResponse.text();
        console.error('Streaming error:', streamResponse.status, errorData);
        
        if (streamResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (streamResponse.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ error: `AI error: ${streamResponse.status}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Transform the AI stream to extract content (tool calls for canvas/code, or regular content for text)
      const reader = streamResponse.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // For tool calls (canvas/code mode)
      let toolCallId = '';
      let toolName = '';
      let argumentsBuffer = '';
      let lastSentToolLength = 0;
      
      // For regular text content
      let textContent = '';
      let lastSentTextLength = 0;
      let isToolCallMode = isCanvasOrCodeMode; // Start based on mode, but can switch based on response
      
      const transformStream = new ReadableStream({
        async start(controller) {
          // Send initial event to indicate streaming started
          const mode = wantsCode ? 'code' : wantsCanvas ? 'canvas' : 'text';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', mode })}\n\n`));
          
          try {
            let buffer = '';
            
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
                if (jsonStr === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta;
                  
                  // Handle regular text content (for non-tool responses)
                  if (delta?.content) {
                    isToolCallMode = false;
                    textContent += delta.content;
                    
                    // Send delta immediately
                    if (textContent.length > lastSentTextLength) {
                      const newContent = textContent.slice(lastSentTextLength);
                      lastSentTextLength = textContent.length;
                      
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        type: 'delta', 
                        content: newContent 
                      })}\n\n`));
                    }
                  }
                  
                  // Handle tool calls with streaming arguments (for canvas/code)
                  if (delta?.tool_calls) {
                    isToolCallMode = true;
                    for (const tc of delta.tool_calls) {
                      if (tc.id) toolCallId = tc.id;
                      if (tc.function?.name) toolName = tc.function.name;
                      if (tc.function?.arguments) {
                        argumentsBuffer += tc.function.arguments;
                        
                        // Try to extract content/code from partial JSON and stream it.
                        // - update_canvas tool streams "content"
                        // - update_code tool streams "code"
                        const streamKey = wantsCode || toolName === 'update_code' ? 'code' : 'content';
                        const keyRegex = new RegExp(`"${streamKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`);
                        const keyMatch = argumentsBuffer.match(keyRegex);
                        if (keyMatch) {
                          const partialValue = keyMatch[1]
                            .replace(/\\n/g, '\n')
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\');

                          // Only send if we have new content
                          if (partialValue.length > lastSentToolLength) {
                            const newContent = partialValue.slice(lastSentToolLength);
                            lastSentToolLength = partialValue.length;

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                              type: 'delta',
                              content: newContent
                            })}\n\n`));
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Incomplete JSON, continue
                }
              }
            }
            
            // Determine final content and mode
            let finalContent = '';
            let label = '';
            let language = '';
            let finalMode = 'text';
            
            if (isToolCallMode && argumentsBuffer) {
              // Parse tool arguments - handle potentially incomplete JSON
              try {
                const args = JSON.parse(argumentsBuffer);
                if (wantsCode) {
                  finalContent = args.code || '';
                  language = args.language || 'html';
                  label = args.label || '';
                  finalMode = 'code';
                } else {
                  finalContent = args.content || '';
                  label = args.label || '';
                  finalMode = 'canvas';
                }
              } catch (e) {
                console.warn('JSON parse failed, extracting content from partial buffer');
                // JSON is incomplete - extract content using regex (same as streaming)
                const streamKey = wantsCode ? 'code' : 'content';
                const keyRegex = new RegExp(`"${streamKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's');
                const keyMatch = argumentsBuffer.match(keyRegex);
                if (keyMatch) {
                  finalContent = keyMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\t/g, '\t');
                  finalMode = wantsCode ? 'code' : 'canvas';
                  console.log('Extracted content from partial JSON, length:', finalContent.length);
                } else {
                  // Fallback: use whatever text we accumulated
                  console.error('Could not extract content from arguments buffer');
                  finalContent = textContent || 'Content generation failed. Please try again.';
                  finalMode = 'text';
                }
              }
            } else {
              // Regular text response
              finalContent = textContent;
              finalMode = 'text';
            }
            
            // Send final complete event (check if controller is still open)
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'done',
                mode: finalMode,
                content: finalContent,
                label,
                language
              })}\n\n`));
              controller.close();
            } catch (closeError) {
              // Controller may already be closed (e.g., client disconnected)
              console.warn('Could not send final event, controller may be closed');
            }
          } catch (error) {
            console.error('Stream processing error:', error);
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: error instanceof Error ? error.message : 'Stream error' 
              })}\n\n`));
              controller.close();
            } catch {
              // Controller already closed
            }
          }
        }
      });
      
      return new Response(transformStream, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    
    // ========== NON-STREAMING MODE ==========
    let response: Response;
    let usedFallback = false;
    
    try {
      response = await fetchWithRetry('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationMessages,
          tools: toolsToUse,
          tool_choice: toolChoice,
          ...tokenParam,
        }),
      });
    } catch (primaryError) {
      // If canvas/code mode with upgraded model fails, try fallback
      const isUpgradedModel = selectedModel === 'google/gemini-3-pro-preview' || selectedModel === 'openai/gpt-5.2';
      if (isCanvasOrCodeMode && isUpgradedModel) {
        // For GPT fallback, use gpt-5-nano; for Gemini fallback, use gemini-3-flash-preview
        const actualFallback = selectedModel.startsWith('openai/') ? 'openai/gpt-5-nano' : fallbackModel;
        const fallbackTokenParam = actualFallback.startsWith('openai/') 
          ? { max_completion_tokens: 65536 }
          : { max_tokens: 65536 };
        
        console.log('⚠️ Primary model failed, trying fallback:', actualFallback);
        usedFallback = true;
        response = await fetchWithRetry('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: actualFallback,
            messages: conversationMessages,
            tools: toolsToUse,
            tool_choice: toolChoice,
            ...fallbackTokenParam,
          }),
        });
      } else {
        throw primaryError;
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ AI request completed in ${(elapsed / 1000).toFixed(1)}s${usedFallback ? ' (used fallback)' : ''}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      
      throw new Error(`Lovable AI error: ${response.status} ${errorData}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices[0].message;

    // Log if response was truncated due to token limit
    const finishReason = data.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ AI response was TRUNCATED due to max_tokens limit!');
    }
    console.log('📊 Response finish_reason:', finishReason);

    // Track which tools were used and web sources
    const toolsUsed: string[] = [];
    let webSources: WebSearchResult[] = [];
    let canvasUpdate: { content: string; label?: string } | null = null;
    let codeUpdate: { code: string; language: string; label?: string } | null = null;
    
    // Check if the AI wants to use tools (web search or chat search)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      assistantMessage.tool_calls.forEach((tc: any) => {
        if (tc.function?.name) {
          toolsUsed.push(tc.function.name);
        }
      });
      console.log('AI requested tools:', toolsUsed);
      
      // Add the assistant's tool call to conversation
      conversationMessages.push(assistantMessage);
      
      // Execute all tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'web_search') {
          const args = JSON.parse(toolCall.function.arguments);
          const searchResponse = await webSearch(args.query);
          
          // Store sources for frontend
          webSources = searchResponse.sources;
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: searchResponse.summary
          });
        } else if (toolCall.function.name === 'search_past_chats') {
          const args = JSON.parse(toolCall.function.arguments);
          // Get auth token from request
          const authHeader = req.headers.get('Authorization');
          const chatResults = await searchPastChats(args.query, authHeader);
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: chatResults
          });
        } else if (toolCall.function.name === 'update_canvas') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('Canvas update requested:', args.label || 'Untitled');
          
          canvasUpdate = {
            content: args.content,
            label: args.label
          };
          
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Canvas updated successfully with "${args.label || 'New Draft'}". The content is now in the user's Canvas editor.`
          });
        } else if (toolCall.function.name === 'update_code') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('Code update requested:', args.label || args.language);
          
          codeUpdate = {
            code: args.code,
            language: args.language,
            label: args.label
          };
          
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Code Canvas updated successfully with "${args.label || args.language + ' code'}". The code is now in the user's Code Canvas editor with syntax highlighting.`
          });
        } else if (toolCall.function.name === 'generate_file') {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Get auth header from request
          const authHeader = req.headers.get('Authorization');
          
          // Call the generate-file function with auth header
          const fileResponse = await supabase.functions.invoke('generate-file', {
            body: { fileType: args.fileType, prompt: args.prompt },
            headers: authHeader ? {
              Authorization: authHeader
            } : undefined
          });
          
          let fileResult = '';
          if (fileResponse.error || !fileResponse.data?.success) {
            fileResult = `Error generating file: ${fileResponse.error?.message || fileResponse.data?.error || 'Unknown error'}`;
            console.error('File generation failed:', fileResponse.error || fileResponse.data);
          } else {
            // IMPORTANT: Include markdown link that MUST be in the response
            // The AI must include this exact markdown link in its response for the user to download the file
            fileResult = `File generated successfully!\n\nIMPORTANT: You MUST include this exact markdown link in your response so the user can download the file:\n[${fileResponse.data.fileName}](${fileResponse.data.fileUrl})\n\nDo NOT paraphrase or say "link provided" - include the actual markdown link above.`;
            console.log('File generated:', fileResponse.data.fileName);
          }
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: fileResult
          });
        }
      }
      
      // For code/canvas updates, skip the second API call entirely - we already have the output!
      // This dramatically reduces latency for /code and /write commands (saves 30-60+ seconds)
      // The second call was just to say "here's your code/content" which is unnecessary
      if (codeUpdate || canvasUpdate) {
        console.log('✅ Skipping second API call - code/canvas output already captured');
        // Create a minimal synthetic response - the actual value is in codeUpdate/canvasUpdate
        const briefMessage = codeUpdate
          ? `Here's your ${codeUpdate.label || codeUpdate.language + ' code'}! I've added it to your Code Canvas.`
          : `Here's your ${canvasUpdate!.label || 'content'}! I've added it to your Canvas.`;

        data = {
          choices: [{
            message: { content: briefMessage },
            finish_reason: 'stop'
          }]
        };
      } else {
        // For web_search and search_past_chats, we need the second call to synthesize results
        console.log('🤖 Making second AI call to synthesize results (no forced tool)');
        response = await fetchWithRetry('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model || 'google/gemini-2.5-flash',
            messages: conversationMessages,
            // No tools on second call - just synthesize the results
            max_tokens: 65536, // Maximum output - no truncation
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Lovable AI error (second call):', response.status, errorData);
          throw new Error(`Lovable AI error: ${response.status}`);
        }

        data = await response.json();
      }
      // Canvas/code updates were already captured from the first call
    }
    
    // Add tool usage metadata, sources, canvas and code update to the response
    const responseContent = data.choices[0]?.message?.content || '';
    const finalResponse = {
      ...data,
      tool_calls_used: toolsUsed,
      web_sources: webSources.length > 0 ? webSources : undefined,
      canvas_update: canvasUpdate,
      code_update: codeUpdate
    };
    
    // NOTE: We no longer save from the backend - the frontend handles all persistence.
    // This prevents race conditions and duplicate messages that occurred when both
    // backend and frontend tried to save the same message simultaneously.
    // The frontend's upsertCanvasMessage/upsertCodeMessage/addMessage properly
    // merge with existing session data and handle all save scenarios.

    return new Response(
      JSON.stringify(finalResponse),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error: unknown) {
    console.error('Chat function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ 
        error: message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
