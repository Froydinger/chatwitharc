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

// Background task to save AI response directly to the database
async function saveResponseToDatabase(
  userId: string,
  sessionId: string | undefined,
  assistantMessage: {
    content: string;
    canvasContent?: string;
    canvasLabel?: string;
    codeContent?: string;
    codeLanguage?: string;
    codeLabel?: string;
    type: 'text' | 'canvas' | 'code';
  },
  retryCount = 0
): Promise<void> {
  if (!sessionId) {
    console.log('⚠️ No sessionId provided, skipping background save');
    return;
  }

  const maxRetries = 3;
  
  try {
    console.log('💾 Background save: Saving AI response to session:', sessionId, `(attempt ${retryCount + 1})`);
    
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('messages')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !session) {
      console.error('❌ Background save: Could not fetch session:', fetchError);
      if (retryCount < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return saveResponseToDatabase(userId, sessionId, assistantMessage, retryCount + 1);
      }
      return;
    }

    const existingMessages = Array.isArray(session.messages) ? session.messages : [];
    
    const newMessage = {
      id: `bg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      content: assistantMessage.content,
      role: 'assistant',
      type: assistantMessage.type,
      timestamp: new Date().toISOString(),
      ...(assistantMessage.canvasContent && { canvasContent: assistantMessage.canvasContent }),
      ...(assistantMessage.canvasLabel && { canvasLabel: assistantMessage.canvasLabel }),
      ...(assistantMessage.codeContent && { codeContent: assistantMessage.codeContent }),
      ...(assistantMessage.codeLanguage && { codeLanguage: assistantMessage.codeLanguage }),
      ...(assistantMessage.codeLabel && { codeLabel: assistantMessage.codeLabel }),
    };

    const updatedMessages = [...existingMessages, newMessage];

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        messages: updatedMessages,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('❌ Background save: Failed to update session:', updateError);
      if (retryCount < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return saveResponseToDatabase(userId, sessionId, assistantMessage, retryCount + 1);
      }
    } else {
      console.log('✅ Background save: Successfully saved AI response');
    }
  } catch (error) {
    console.error('❌ Background save error:', error);
    if (retryCount < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return saveResponseToDatabase(userId, sessionId, assistantMessage, retryCount + 1);
    }
  }
}

// Web search result interfaces
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
        include_raw_content: true,
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
    
    const sources: WebSearchResult[] = [];
    let searchSummary = '';
    
    if (data.answer) {
      searchSummary = `Quick Answer: ${data.answer}\n\n`;
    }
    
    if (data.results && data.results.length > 0) {
      searchSummary += 'Search Results:\n';
      data.results.forEach((result: any, idx: number) => {
        searchSummary += `${idx + 1}. ${result.title}\n`;
        const pageContent = result.raw_content || result.content || '';
        searchSummary += `   ${pageContent}\n`;
        searchSummary += `   Source: ${result.url}\n\n`;

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

// Search past chats tool
async function searchPastChats(query: string, authHeader: string | null): Promise<string> {
  try {
    console.log('Searching past chats for:', query);
    
    if (!authHeader) {
      return "Unable to search past chats: Not authenticated.";
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseWithAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser(token);
    
    if (userError || !user) {
      return "Unable to search past chats: Authentication failed.";
    }

    const { data: sessions, error: sessionsError } = await supabaseWithAuth
      .from('chat_sessions')
      .select('id, title, messages, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (sessionsError || !sessions || sessions.length === 0) {
      return sessions ? "No past chats found." : "Unable to search past chats.";
    }

    let conversationContext = `I found ${sessions.length} recent conversations:\n\n`;
    
    sessions.forEach((session: any, idx) => {
      const title = session.title || 'Untitled';
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const date = new Date(session.updated_at).toLocaleDateString();
      
      conversationContext += `--- Conversation ${idx + 1}: "${title}" (${date}) ---\n`;

      messages.forEach((msg: any) => {
        if (msg.role && msg.content) {
          const prefix = msg.role === 'user' ? 'User' : 'Assistant';
          conversationContext += `${prefix}: ${msg.content}\n`;
        }
      });
      
      conversationContext += '\n';
    });

    conversationContext += `\nAnalyze these conversations to answer: "${query}"`;
    return conversationContext;
  } catch (error: unknown) {
    console.error('Past chat search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Search error: ${message}`;
  }
}

// SSE Helper to send events
function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { messages, profile, model, sessionId, forceWebSearch, forceCanvas, forceCode, stream = true } = await req.json();

    console.log('📊 Request details:', {
      model: model || 'google/gemini-2.5-flash',
      messageCount: messages?.length || 0,
      sessionId: sessionId || 'none',
      forceWebSearch: !!forceWebSearch,
      forceCanvas: !!forceCanvas,
      forceCode: !!forceCode,
      stream: !!stream
    });

    // Input validation
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (messages.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Too many messages (max 100)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (typeof msg.content === 'string' && msg.content.length > 50000) {
        return new Response(
          JSON.stringify({ error: 'Message content too long (max 50000 characters)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate model
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch admin settings
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

    // Build enhanced system prompt
    let enhancedSystemPrompt = systemPrompt;

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

    enhancedSystemPrompt += '\n\n--- TOOLS ---\n' +
      '• web_search: Get current info from the web. ALWAYS synthesize and summarize results in your own words.\n' +
      '• search_past_chats: Analyze user\'s conversation history\n' +
      '• update_canvas: Write/edit content in the Canvas editor\n' +
      '• update_code: Write/edit code in the Code Canvas\n' +
      '• generate_file: Create downloadable files (PDFs, etc.)\n\n' +
      '--- RESPONSE STYLE ---\n' +
      'For REGULAR CONVERSATION: Keep responses concise and direct.\n' +
      'For TOOL OUTPUTS (update_canvas, update_code): Output the COMPLETE content. NEVER truncate.\n' +
      'When using update_canvas or update_code, you MUST provide FULL content - do not summarize.\n';

    const conversationMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...messages.filter((m: any) => m.role !== 'system')
    ];
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Define tools
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for current information, news, facts, or real-time data.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" }
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
          description: "Retrieves and analyzes the user's conversation history.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The question to analyze from past conversations" }
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
          description: "Write or update content in the Canvas. Use for writing tasks like blog posts, essays, emails, etc. Output COMPLETE markdown content.",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "The COMPLETE markdown content" },
              label: { type: "string", description: "A short label (e.g., 'Blog Post Draft')" }
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
          description: "Write or update code in the Code Canvas. Output COMPLETE code.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "The COMPLETE code content" },
              language: { type: "string", description: "Programming language (e.g., 'javascript', 'html', 'python')" },
              label: { type: "string", description: "A short label (e.g., 'React Component')" }
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
          description: "Generate a downloadable file (PDF, spreadsheet, etc.)",
          parameters: {
            type: "object",
            properties: {
              fileType: { type: "string", description: "File type (pdf, txt, xlsx, csv, json)" },
              prompt: { type: "string", description: "Content description for the file" }
            },
            required: ["fileType", "prompt"],
            additionalProperties: false
          }
        }
      }
    ];

    // Determine tool choice based on mode
    let toolChoice: any = "auto";
    let toolsToUse = tools;

    if (forceCode) {
      toolChoice = { type: "function", function: { name: "update_code" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_code' || t.function.name === 'web_search');
      console.log('🔧 Forcing update_code tool with web_search available');
    } else if (forceCanvas) {
      toolChoice = { type: "function", function: { name: "update_canvas" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_canvas' || t.function.name === 'web_search');
      console.log('🔧 Forcing update_canvas tool with web_search available');
    } else if (forceWebSearch) {
      toolChoice = { type: "function", function: { name: "web_search" } };
      console.log('🔧 Forcing web_search tool');
    }

    // Use streaming for real-time response
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          console.log('🚀 Starting streaming response...');
          
          // First AI call - try with streaming
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model || 'google/gemini-2.5-flash',
              messages: conversationMessages,
              tools: toolsToUse,
              tool_choice: toolChoice,
              max_tokens: 65536,
              stream: true,
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('AI error:', aiResponse.status, errorText);
            
            if (aiResponse.status === 429) {
              sendSSE(controller, 'error', { error: 'Rate limit exceeded. Please try again later.' });
              controller.close();
              return;
            }
            if (aiResponse.status === 402) {
              sendSSE(controller, 'error', { error: 'Payment required. Please add credits to your workspace.' });
              controller.close();
              return;
            }
            
            sendSSE(controller, 'error', { error: `AI error: ${aiResponse.status}` });
            controller.close();
            return;
          }

          // Process the streaming response
          const reader = aiResponse.body?.getReader();
          if (!reader) {
            sendSSE(controller, 'error', { error: 'No response body' });
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';
          let toolCalls: any[] = [];
          let currentToolCall: any = null;
          let toolsUsed: string[] = [];
          let webSources: WebSearchResult[] = [];
          let canvasUpdate: { content: string; label?: string } | null = null;
          let codeUpdate: { code: string; language: string; label?: string } | null = null;

          // Send start event
          sendSSE(controller, 'start', { streaming: true });

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta;

                  if (delta?.content) {
                    fullContent += delta.content;
                    // Stream content to client
                    sendSSE(controller, 'content', { content: delta.content });
                  }

                  // Handle tool calls
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      if (tc.index !== undefined) {
                        if (!toolCalls[tc.index]) {
                          toolCalls[tc.index] = {
                            id: tc.id || `tool_${tc.index}`,
                            type: 'function',
                            function: { name: '', arguments: '' }
                          };
                        }
                        if (tc.function?.name) {
                          toolCalls[tc.index].function.name = tc.function.name;
                        }
                        if (tc.function?.arguments) {
                          toolCalls[tc.index].function.arguments += tc.function.arguments;
                        }
                      }
                    }
                  }
                } catch (e) {
                  // Ignore parse errors for partial JSON
                }
              }
            }
          }

          // Process any remaining buffer
          if (buffer.startsWith('data: ') && buffer.slice(6).trim() !== '[DONE]') {
            try {
              const parsed = JSON.parse(buffer.slice(6).trim());
              if (parsed.choices?.[0]?.delta?.content) {
                fullContent += parsed.choices[0].delta.content;
                sendSSE(controller, 'content', { content: parsed.choices[0].delta.content });
              }
            } catch (e) {}
          }

          // Process tool calls if any
          if (toolCalls.length > 0) {
            console.log('🔧 Processing tool calls:', toolCalls.map(tc => tc.function.name));
            
            // Add assistant message with tool calls to conversation
            const assistantMsgWithTools = {
              role: 'assistant',
              content: fullContent || null,
              tool_calls: toolCalls
            };
            conversationMessages.push(assistantMsgWithTools);

            // Execute each tool call
            for (const toolCall of toolCalls) {
              const toolName = toolCall.function.name;
              toolsUsed.push(toolName);

              try {
                const args = JSON.parse(toolCall.function.arguments);

                if (toolName === 'web_search') {
                  sendSSE(controller, 'tool_start', { tool: 'web_search', query: args.query });
                  const searchResponse = await webSearch(args.query);
                  webSources = searchResponse.sources;
                  conversationMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: searchResponse.summary
                  });
                  sendSSE(controller, 'tool_complete', { tool: 'web_search', sources: webSources });
                } 
                else if (toolName === 'search_past_chats') {
                  sendSSE(controller, 'tool_start', { tool: 'search_past_chats' });
                  const chatResults = await searchPastChats(args.query, authHeader);
                  conversationMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: chatResults
                  });
                  sendSSE(controller, 'tool_complete', { tool: 'search_past_chats' });
                }
                else if (toolName === 'update_canvas') {
                  canvasUpdate = { content: args.content, label: args.label };
                  sendSSE(controller, 'canvas_update', canvasUpdate);
                  conversationMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `Canvas updated with "${args.label || 'New Draft'}"`
                  });
                }
                else if (toolName === 'update_code') {
                  codeUpdate = { code: args.code, language: args.language, label: args.label };
                  sendSSE(controller, 'code_update', codeUpdate);
                  conversationMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `Code Canvas updated with ${args.language} code`
                  });
                }
                else if (toolName === 'generate_file') {
                  sendSSE(controller, 'tool_start', { tool: 'generate_file', fileType: args.fileType });
                  const fileResponse = await supabase.functions.invoke('generate-file', {
                    body: { fileType: args.fileType, prompt: args.prompt },
                    headers: authHeader ? { Authorization: authHeader } : undefined
                  });
                  
                  let fileResult = '';
                  if (fileResponse.error || !fileResponse.data?.success) {
                    fileResult = `Error generating file: ${fileResponse.error?.message || 'Unknown error'}`;
                  } else {
                    fileResult = `File generated: [${fileResponse.data.fileName}](${fileResponse.data.fileUrl})`;
                  }
                  conversationMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: fileResult
                  });
                  sendSSE(controller, 'tool_complete', { tool: 'generate_file', result: fileResult });
                }
              } catch (e) {
                console.error('Tool execution error:', e);
                conversationMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `Error executing ${toolName}`
                });
              }
            }

            // If tools were used (except canvas/code which are final), make a second call
            const needsSecondCall = toolsUsed.includes('web_search') || 
                                   toolsUsed.includes('search_past_chats') ||
                                   toolsUsed.includes('generate_file');

            if (needsSecondCall) {
              console.log('🔄 Making second AI call to synthesize results...');
              sendSSE(controller, 'synthesizing', { tools: toolsUsed });

              // Determine tool choice for second call
              let secondToolChoice: any = "auto";
              let secondTools = tools;

              if (forceCode) {
                secondToolChoice = { type: "function", function: { name: "update_code" } };
                secondTools = tools.filter(t => t.function.name === 'update_code');
              } else if (forceCanvas) {
                secondToolChoice = { type: "function", function: { name: "update_canvas" } };
                secondTools = tools.filter(t => t.function.name === 'update_canvas');
              }

              const secondResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${lovableApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: model || 'google/gemini-2.5-flash',
                  messages: conversationMessages,
                  tools: secondTools,
                  tool_choice: secondToolChoice,
                  max_tokens: 65536,
                  stream: true,
                }),
              });

              if (secondResponse.ok && secondResponse.body) {
                const secondReader = secondResponse.body.getReader();
                let secondBuffer = '';
                fullContent = ''; // Reset for second response

                while (true) {
                  const { done, value } = await secondReader.read();
                  if (done) break;

                  secondBuffer += decoder.decode(value, { stream: true });
                  const lines = secondBuffer.split('\n');
                  secondBuffer = lines.pop() || '';

                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      const data = line.slice(6).trim();
                      if (data === '[DONE]') continue;

                      try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;

                        if (delta?.content) {
                          fullContent += delta.content;
                          sendSSE(controller, 'content', { content: delta.content });
                        }

                        // Handle tool calls in second response
                        if (delta?.tool_calls) {
                          for (const tc of delta.tool_calls) {
                            if (tc.index !== undefined) {
                              if (!toolCalls[tc.index + 100]) { // Offset to avoid collision
                                toolCalls[tc.index + 100] = {
                                  id: tc.id || `tool_2_${tc.index}`,
                                  type: 'function',
                                  function: { name: '', arguments: '' }
                                };
                              }
                              if (tc.function?.name) {
                                toolCalls[tc.index + 100].function.name = tc.function.name;
                              }
                              if (tc.function?.arguments) {
                                toolCalls[tc.index + 100].function.arguments += tc.function.arguments;
                              }
                            }
                          }
                        }
                      } catch (e) {}
                    }
                  }
                }

                // Process second response tool calls (for canvas/code updates after search)
                for (let i = 100; i < toolCalls.length; i++) {
                  const tc = toolCalls[i];
                  if (!tc) continue;
                  
                  try {
                    const args = JSON.parse(tc.function.arguments);
                    if (tc.function.name === 'update_canvas') {
                      canvasUpdate = { content: args.content, label: args.label };
                      sendSSE(controller, 'canvas_update', canvasUpdate);
                    } else if (tc.function.name === 'update_code') {
                      codeUpdate = { code: args.code, language: args.language, label: args.label };
                      sendSSE(controller, 'code_update', codeUpdate);
                    }
                  } catch (e) {}
                }
              }
            }
          }

          // Send completion event with metadata
          const finalData = {
            content: fullContent,
            tool_calls_used: toolsUsed,
            web_sources: webSources.length > 0 ? webSources : undefined,
            canvas_update: canvasUpdate,
            code_update: codeUpdate
          };
          sendSSE(controller, 'complete', finalData);

          // Save to database in background
          if (sessionId && user) {
            const messageType = codeUpdate ? 'code' : (canvasUpdate ? 'canvas' : 'text');
            saveResponseToDatabase(user.id, sessionId, {
              content: fullContent,
              type: messageType,
              ...(canvasUpdate && { canvasContent: canvasUpdate.content, canvasLabel: canvasUpdate.label }),
              ...(codeUpdate && { codeContent: codeUpdate.code, codeLanguage: codeUpdate.language, codeLabel: codeUpdate.label }),
            }).catch(e => console.error('Background save error:', e));
          }

          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          sendSSE(controller, 'error', { error: error instanceof Error ? error.message : 'Unknown error' });
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error: unknown) {
    console.error('Chat function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
