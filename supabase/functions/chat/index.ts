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
      enhancedSystemPrompt += ` Remember these details: ${profile.memory_info}`;
    }
    
    if (globalContext) {
      enhancedSystemPrompt += `\n\nGlobal Context: ${globalContext}`;
    }
    if (enableStepByStep && isWellnessCheck) {
      enhancedSystemPrompt += '\n\nIMPORTANT: This appears to be a wellness check or guidance request. Please provide clear, numbered step-by-step instructions and ask follow-up questions to guide the user through the process.';
    }

    enhancedSystemPrompt += '\n\nYou have access to web search. Use it when you need current information, news, facts, or anything beyond your training data.';

    // CODING ASSISTANCE - Critical instruction
    enhancedSystemPrompt += '\n\n🔥 CODING & TOOL CREATION - YOU ARE A PROFESSIONAL DEVELOPER:\n' +
      '✅ CREATE BEAUTIFUL, POLISHED, PRODUCTION-READY TOOLS - Not basic or ugly prototypes\n' +
      '✅ USE MODERN DESIGN: Tailwind CSS, gradients, shadows, animations, glassmorphism, smooth interactions\n' +
      '✅ ADD THOUGHTFUL UX: Loading states, error handling, validation, responsive design, accessibility\n' +
      '✅ WRITE COMPLETE, FUNCTIONAL CODE: React/JSX/TSX, HTML, CSS, JavaScript, Python - any language\n' +
      '✅ CODE DISPLAYS AS LIVE INTERACTIVE PREVIEWS by default - users see working apps immediately\n' +
      '✅ NO RESTRICTIONS on complexity - build sophisticated, feature-rich solutions\n' +
      '✅ JUST BUILD IT - Do NOT ask for confirmation or permission. When asked to create something, CREATE IT.\n\n' +
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
      '✅ The user cannot and will not prompt you again - you must output everything in ONE response.\n\n' +
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

    // Define the web search tool
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for current information, news, facts, or real-time data. Use this when you need information beyond your training data or when the user asks about recent events, current prices, live data, etc.",
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

    // Check if the AI wants to use the web search tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('AI requested web search:', assistantMessage.tool_calls[0].function.arguments);
      
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