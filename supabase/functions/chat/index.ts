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

// Search past chats tool
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

    // Search chat sessions by title (messages are encrypted and can't be searched server-side)
    const { data: sessions, error: sessionsError } = await supabaseWithAuth
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (sessionsError) {
      console.error('Chat search error:', sessionsError);
      return "Unable to search past chats.";
    }

    if (!sessions || sessions.length === 0) {
      return "No past chats found.";
    }

    console.log(`Searching through ${sessions.length} chat sessions`);

    // Search through chat titles for relevant content
    const queryLower = query.toLowerCase();
    const relevantChats: Array<{ title: string; date: string; id: string }> = [];

    sessions.forEach((session: any) => {
      const title = session.title || 'Untitled Chat';
      if (title.toLowerCase().includes(queryLower)) {
        relevantChats.push({
          title: title,
          date: new Date(session.updated_at).toLocaleDateString(),
          id: session.id
        });
      }
    });

    console.log(`Found ${relevantChats.length} relevant chat sessions`);

    if (relevantChats.length === 0) {
      return `No past conversations found with titles matching "${query}". Note: Message content is encrypted and cannot be searched. Try searching by conversation topic or title.`;
    }

    // Format results
    let result = `Found ${relevantChats.length} past conversation${relevantChats.length > 1 ? 's' : ''} with titles matching your search:\n\n`;
    relevantChats.slice(0, 10).forEach((chat, idx) => {
      result += `${idx + 1}. "${chat.title}" - Last updated: ${chat.date}\n`;
    });
    
    result += '\n💡 Note: I can see conversation titles but not message content (it\'s encrypted for your privacy). If you need specific information from these chats, please let me know which one and what you\'re looking for.';

    return result;
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
    const { messages, profile, model } = await req.json();
    
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

    // Build enhanced system prompt with user personalization
    let enhancedSystemPrompt = systemPrompt;
    
    if (profile?.display_name) {
      enhancedSystemPrompt += ` The user's name is ${profile.display_name}.`;
    }
    
    if (profile?.context_info?.trim()) {
      enhancedSystemPrompt += ` Context: ${profile.context_info}`;
    }
    
    if (profile?.memory_info?.trim()) {
      enhancedSystemPrompt += `\n\n📝 USER MEMORIES (stored facts about the user):\n${profile.memory_info}`;
      console.log('Including memory info in system prompt');
    }
    
    if (globalContext) {
      enhancedSystemPrompt += `\n\nGlobal Context: ${globalContext}`;
    }
    if (enableStepByStep && isWellnessCheck) {
      enhancedSystemPrompt += '\n\nIMPORTANT: This appears to be a wellness check or guidance request. Please provide clear, numbered step-by-step instructions and ask follow-up questions to guide the user through the process.';
    }

    enhancedSystemPrompt += '\n\n🔧 AVAILABLE TOOLS:\n' +
      '1. web_search: Search the internet for current information, news, facts, or real-time data\n' +
      '2. search_past_chats: Search through titles of the user\'s previous conversations. Note: Message content is encrypted and cannot be searched, only conversation titles are searchable. Use this when they mention a past conversation by topic.\n\n' +
      '⚠️ IMPORTANT DISTINCTION:\n' +
      '- MEMORIES (in system prompt above) = Specific facts the user asked you to remember (from "remember this" commands)\n' +
      '- PAST CHATS (search_past_chats tool) = Titles of previous conversation sessions\n' +
      'Memories are automatically available to you. Past chat titles can be searched using the tool.';
    
    // Add explicit tool usage boundary
    enhancedSystemPrompt += '\n\n⚠️ TOOL USAGE RULE - CRITICAL:\n' +
      '✅ Use web_search tool ONLY to fetch external data (news, facts, current events, real-time information)\n' +
      '❌ NEVER use web_search or ANY tool to output code, HTML, or programming content\n' +
      '❌ NEVER pass code through tools or functions\n' +
      '✅ Code must be responded DIRECTLY in your message - NOT through tools\n' +
      '✅ Tools are for INPUT (fetching data), not OUTPUT (displaying content)\n';

    // CODING ASSISTANCE - Critical instruction
    enhancedSystemPrompt += '\n\n🔥 CODING & TOOL CREATION - YOU ARE A PROFESSIONAL DEVELOPER:\n' +
      '✅ CREATE BEAUTIFUL, POLISHED, PRODUCTION-READY TOOLS - Not basic or ugly prototypes\n' +
      '✅ USE MODERN DESIGN: Tailwind CSS, gradients, shadows, animations, glassmorphism, smooth interactions\n' +
      '✅ ADD THOUGHTFUL UX: Loading states, error handling, validation, responsive design, accessibility\n' +
      '✅ WRITE COMPLETE, FUNCTIONAL CODE: React/JSX/TSX, HTML, CSS, JavaScript, Python - any language\n' +
      '✅ CODE DISPLAYS AS LIVE INTERACTIVE PREVIEWS by default - users see working apps immediately\n' +
      '✅ NO RESTRICTIONS on complexity - build sophisticated, feature-rich solutions\n' +
      '✅ JUST BUILD IT - Do NOT ask for confirmation or permission. When asked to create something, CREATE IT.\n\n' +
      '📝 COMPLETE CODE BLOCKS - ABSOLUTELY CRITICAL:\n' +
      '⚠️ ALWAYS output COMPLETE, FULL code - NEVER truncate or cut off the beginning or end\n' +
      '⚠️ For HTML files: MUST include <!DOCTYPE html>, <html>, <head>, <body> tags - START FROM THE VERY BEGINNING\n' +
      '⚠️ For React/JSX/TSX: Include ALL imports at the top, ALL functions, ALL components from start to finish\n' +
      '⚠️ NEVER start code in the middle - ALWAYS include the ENTIRE file from line 1\n' +
      '⚠️ NEVER end code early - include closing tags, brackets, and any final code\n' +
      '⚠️ If code is long, that is OK - output the COMPLETE working code, not a partial snippet\n' +
      '⚠️ Users need COMPLETE files they can copy and run immediately\n\n' +
      '🚨 CRITICAL OUTPUT RULE - READ THIS CAREFULLY:\n' +
      'NEVER EVER say phrases like:\n' +
      '❌ "Give me a moment"\n' +
      '❌ "I\'ll work on this"\n' +
      '❌ "When I come back"\n' +
      '❌ "Let me create this for you"\n' +
      '❌ "I\'m going to build"\n' +
      '❌ Any phrase suggesting you need more time or another message\n\n' +
      '✅ INSTEAD: Output the complete code block IN THE SAME RESPONSE immediately after a brief explanation.\n' +
      '✅ CORRECT FORMAT: "Here\'s a [description]:" followed immediately by the code block.\n' +
      '✅ CODE GOES DIRECTLY IN YOUR RESPONSE - Never route through tools or functions.\n' +
      '✅ The user cannot and will not prompt you again - you must output everything in ONE response.\n\n' +
      '🎨 COLOR CONTRAST RULE - ABSOLUTELY CRITICAL:\n' +
      '⚠️ ALWAYS ensure proper contrast between text and background colors\n' +
      '❌ NEVER use black text on black background\n' +
      '❌ NEVER use white text on white background\n' +
      '❌ NEVER use purple text on purple background\n' +
      '❌ NEVER use similar colored text on similar colored background\n' +
      '✅ ALWAYS use high contrast combinations (e.g., white on dark, dark on light)\n' +
      '✅ Test readability: If text and background are similar colors, CHANGE ONE OF THEM\n' +
      '✅ Use text-foreground and bg-background semantic tokens for automatic contrast\n\n' +
      '🔍 PLACEHOLDER DETECTION - MANDATORY:\n' +
      'If you see ANY placeholders or brackets in the user\'s request like:\n' +
      '- [describe problem]\n' +
      '- [your text here]\n' +
      '- [enter details]\n' +
      '- Any other bracketed placeholder text\n' +
      'YOU MUST:\n' +
      '1. ❌ DO NOT proceed with coding\n' +
      '2. ✅ ASK the user to fill in those specific details\n' +
      '3. ✅ List each placeholder that needs information\n' +
      '4. ✅ WAIT for their response before generating any code\n' +
      '5. ✅ Once they provide the details, THEN create the code with their specific information\n\n' +
      'DESIGN STANDARDS (ALWAYS FOLLOW):\n' +
      '- Beautiful color schemes with gradients and modern palettes\n' +
      '- Smooth animations and transitions (hover effects, loading states)\n' +
      '- Clean typography with proper hierarchy and spacing\n' +
      '- Responsive layouts that work on mobile and desktop\n' +
      '- Intuitive UI with clear labels, buttons, and feedback\n' +
      '- Professional styling: shadows, borders, rounded corners, glass effects\n\n' +
      'EXAMPLES OF WHAT TO BUILD:\n' +
      '- Calculator? → Beautiful, animated calculator with history and multiple modes\n' +
      '- Data viz? → Interactive charts with tooltips, legends, and smooth animations\n' +
      '- Form? → Polished form with validation, error states, and success feedback\n' +
      '- Game? → Engaging game with scoring, animations, and great visuals\n\n' +
      '⚡ BE PROACTIVE: When users ask for a tool, deliver a COMPLETE, BEAUTIFUL, WORKING solution immediately. No confirmations needed!';


    // Prepare messages with enhanced system prompt
    let conversationMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...messages.filter(m => m.role !== 'system') // Remove any existing system messages
    ];
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Define tools including web search and chat search
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
          description: "Search through titles of the user's past chat sessions. Note: Message content is encrypted for privacy and cannot be searched - only conversation titles are searchable. Use this when the user mentions a specific conversation topic or asks about past discussions by name.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search term to match against conversation titles"
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      }
    ];

    // First AI call with tools
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

    // Check if the AI wants to use tools (web search or chat search)
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('AI requested tools:', assistantMessage.tool_calls.map((tc: any) => tc.function.name));
      
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
    
    return new Response(
      JSON.stringify(data),
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
