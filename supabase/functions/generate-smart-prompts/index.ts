import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get request body to check for context
    const body = await req.json().catch(() => ({}));
    const context = body?.context || 'general';

    // Always use Gemini 2.5 Flash for prompt generation - fast, efficient, reliable
    const PROMPT_MODEL = 'google/gemini-2.5-flash';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Authentication failed');
    }

    // Fetch recent chat sessions and profile
    const { data: sessions } = await supabase
      .from('chat_sessions')
      .select('title, messages')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10);

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, memory_info, context_info')
      .eq('user_id', user.id)
      .single();

    // Build context from recent chats
    let chatContext = '';
    if (sessions && sessions.length > 0) {
      chatContext = 'Recent chat topics:\n';
      sessions.forEach((session: any) => {
        if (session.title) {
          chatContext += `- ${session.title}\n`;
        }
      });
    }

    // Build prompt for AI based on context type
    const isResearch = context === 'research';
    
    const systemPrompt = isResearch 
      ? `You generate personalized RESEARCH prompt suggestions for a user to search the web.

IMPORTANT CONTEXT - This is information ABOUT THE USER that you already know:
${profile?.display_name ? `- The user's name is: ${profile.display_name}` : ''}
${profile?.memory_info ? `- Things the user has shared about themselves: ${profile.memory_info}` : ''}
${profile?.context_info ? `- Additional context about the user: ${profile.context_info}` : ''}

${chatContext}

Generate 6 smart, personalized RESEARCH/SEARCH prompt suggestions.

CRITICAL RULES:
1. These are for WEB SEARCH - prompts should be things worth researching online
2. Reference user's interests, work, and context IMPLICITLY
3. Focus on: industry news, market research, competitive analysis, learning topics, current events
4. Make them specific and timely - things that benefit from fresh web data

GOOD RESEARCH EXAMPLES:
✅ "Latest trends in AI startups 2025" (for a founder)
✅ "Best practices for podcast monetization" (for a podcaster)
✅ "React 19 new features and migration guide" (for a developer)
✅ "Recent SEC filings for [industry] companies" (for finance role)
✅ "What's new in [their city] tech scene this week"

BAD EXAMPLES (not research-oriented):
❌ "Help me write an email" (not a search query)
❌ "What should I prioritize today" (not web research)
❌ "Generate a business plan" (creative task, not search)

Return ONLY a JSON array with exactly 6 objects, each with "label" and "prompt" fields.
Example format:
[
  {"label": "🔬 AI Research", "prompt": "Latest breakthroughs in AI agents 2025"},
  ...
]`
      : `You generate personalized prompt suggestions for a user to send to an AI assistant.

IMPORTANT CONTEXT - This is information ABOUT THE USER that you already know:
${profile?.display_name ? `- The user's name is: ${profile.display_name}` : ''}
${profile?.memory_info ? `- Things the user has shared about themselves: ${profile.memory_info}` : ''}
${profile?.context_info ? `- Additional context about the user: ${profile.context_info}` : ''}

${chatContext}

Generate 6 smart, personalized prompt suggestions.

CRITICAL STYLE RULES:
1. DO NOT re-state or summarize the user's context in the prompt
2. Reference context IMPLICITLY - assume the AI already knows their background
3. Be PRACTICAL and ACTIONABLE - help with real tasks, not spiritual/ethereal stuff
4. Write prompts that get straight to the point

CORRECT EXAMPLES (implicitly reference known context):
✅ "Help me prep for my investor meeting next week" (assumes AI knows they're a founder)
✅ "What topics should I cover in Episode 23?" (assumes AI knows they have a podcast)
✅ "Draft a follow-up email for the lead from yesterday" (assumes AI knows their job)
✅ "Given the Q3 numbers, what should I prioritize?" (assumes AI knows business context)

WRONG EXAMPLES (explicitly restating context - DO NOT DO THIS):
❌ "I work as a sales manager at XYZ Company. Can you help me..." (don't re-explain)
❌ "As a podcast host, I need ideas for..." (don't re-state their role)
❌ "Since I'm a co-founder of a startup, what should..." (don't repeat context)

The prompts should feel like a conversation continuation, not a cold start.

Return ONLY a JSON array with exactly 6 objects, each with "label" and "prompt" fields.
Example format:
[
  {"label": "🎯 Investor Prep", "prompt": "Help me prepare talking points for Friday's pitch"},
  ...
]`;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Using model for smart prompts:', PROMPT_MODEL, 'context:', context);

    // Call AI to generate prompts
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PROMPT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: isResearch 
            ? 'Generate 6 personalized research/search prompts for me based on my profile and interests.'
            : 'Generate 6 personalized smart prompts for me based on my profile and chat history.' 
          }
        ],
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const prompts = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ prompts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Smart prompts error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
