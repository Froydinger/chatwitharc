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

// Web search tool using Tavily API
async function webSearch(query: string): Promise<string> {
  const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');
  if (!tavilyApiKey) {
    return "Web search is not configured. Please add TAVILY_API_KEY.";
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
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tavily API error:', response.status, errorText);
      return `Search failed: ${response.status}`;
    }

    const data = await response.json();
    console.log('Search results received:', data.results?.length || 0, 'results');
    
    // Format results for the AI
    let searchSummary = '';
    if (data.answer) {
      searchSummary = `Quick Answer: ${data.answer}\n\n`;
    }
    
    if (data.results && data.results.length > 0) {
      searchSummary += 'Search Results:\n';
      data.results.forEach((result: any, idx: number) => {
        searchSummary += `${idx + 1}. ${result.title}\n`;
        searchSummary += `   ${result.content}\n`;
        searchSummary += `   Source: ${result.url}\n\n`;
      });
    }
    
    return searchSummary || 'No relevant results found.';
  } catch (error) {
    console.error('Web search error:', error);
    return `Search error: ${error.message}`;
  }
}

// Search past chats tool - AI-powered analysis
async function searchPastChats(query: string, authHeader: string | null): Promise<string> {
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

    // Get ALL chat sessions with full content (no limits for better context)
    const { data: sessions, error: sessionsError } = await supabaseWithAuth
      .from('chat_sessions')
      .select('id, title, messages, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1000); // Very high limit to get all chats

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

      // Include ALL conversation content with NO limits for comprehensive context
      messages.forEach((msg: any) => {
        if (msg.role && msg.content) {
          const prefix = msg.role === 'user' ? 'User' : 'Assistant';
          // Include full message content (no truncation)
          conversationContext += `${prefix}: ${msg.content}\n`;
        }
      });
      
      conversationContext += '\n';
    });

    conversationContext += `\nNow analyze these conversations to answer: "${query}"\n`;
    conversationContext += `Please synthesize insights, identify patterns, make inferences, and provide a thoughtful analysis based on what you see in these conversations.`;

    console.log('📊 Conversation context length:', conversationContext.length);
    console.log('📝 First 500 chars:', conversationContext.slice(0, 500));

    return conversationContext;
  } catch (error) {
    console.error('Past chat search error:', error);
    return `Search error: ${error.message}`;
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

    const { messages, profile, model } = await req.json();

    console.log('📊 Request details:', {
      model: model || 'google/gemini-2.5-flash (default)',
      messageCount: messages?.length || 0,
      hasProfile: !!profile
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
      'google/gemini-3-pro-preview',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-lite',
      'openai/gpt-5',
      'openai/gpt-5-mini',
      'openai/gpt-5-nano'
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
      '• web_search: Get current info from the web\n' +
      '• search_past_chats: Analyze user\'s conversation history\n' +
      '• generate_file: Create downloadable docs (PDFs, etc.) - NOT for code\n' +
      '• Image generation: Users click the image button\n\n' +
      '--- CODING (only when explicitly requested) ---\n' +
      '• Trigger words: "build", "create", "code", "make", "write"\n' +
      '• Use markdown code blocks (```html, ```css, ```js)\n' +
      '• Default to conversation, not coding\n';

    // CRITICAL: Brevity reinforcement at the END (recency bias)
    enhancedSystemPrompt += '\n\n=== RESPONSE STYLE (CRITICAL) ===\n' +
      'Keep responses SHORT and CONCISE by default.\n' +
      'Be direct. No fluff. No unnecessary elaboration.\n' +
      'Expand ONLY when the user asks for detail or the topic genuinely requires it.\n' +
      'Match the energy and length of the user\'s message.';

    // Prepare messages with enhanced system prompt
    let conversationMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...messages.filter(m => m.role !== 'system') // Remove any existing system messages
    ];
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Define tools including web search, chat search, and file generation
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
          name: "generate_file",
          description: "Generate and create an actual downloadable FILE (PDF, TXT, MD, JSON, CSV, etc.). CRITICAL: Use this ONLY when the user explicitly wants a DOWNLOADABLE DOCUMENT FILE, NOT when they want to see CODE. When user requests code/apps/tools, use markdown code blocks instead (```html, ```javascript, ```css) which create interactive preview windows. This tool is for DOCUMENTS (resumes, reports, PDFs) NOT for CODE. The file will be created and a download link provided.",
          parameters: {
            type: "object",
            properties: {
              fileType: {
                type: "string",
                description: "The type of file to generate (pdf, txt, md, json, csv, etc.) - ONLY for downloadable documents, NOT for code"
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

    // First AI call with tools
    console.log('🤖 Making AI request with model:', model || 'google/gemini-2.5-flash');
    let response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash',
        messages: conversationMessages,
        tools: tools,
        tool_choice: "auto", // Explicitly enable automatic tool selection
      }),
    });

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

    // Track which tools were used
    const toolsUsed: string[] = [];
    
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
          const searchResults = await webSearch(args.query);
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: searchResults
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
            fileResult = `File generated successfully! Download it here: ${fileResponse.data.fileUrl}\nFilename: ${fileResponse.data.fileName}\nType: ${fileResponse.data.mimeType}`;
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
      
      // Second AI call with search results
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'google/gemini-2.5-flash',
          messages: conversationMessages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Lovable AI error (second call):', response.status, errorData);
        throw new Error(`Lovable AI error: ${response.status}`);
      }

      data = await response.json();
    }
    
    // Add tool usage metadata to the response
    const finalResponse = {
      ...data,
      tool_calls_used: toolsUsed
    };
    
    return new Response(
      JSON.stringify(finalResponse),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
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
