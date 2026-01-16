import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, recentChats } = await req.json();

    // Extract user context
    const displayName = profile?.display_name || 'there';
    const memoryInfo = profile?.memory_info || '';
    const contextInfo = profile?.context_info || '';
    
    // Get recent chat topics
    const recentTopics = recentChats?.slice(0, 3).map((chat: any) => chat.title).join(', ') || '';

    // Build context for AI
    let userContext = '';
    if (memoryInfo) userContext += `User memories: ${memoryInfo}\n`;
    if (contextInfo) userContext += `User context: ${contextInfo}\n`;
    if (recentTopics) userContext += `Recent conversations: ${recentTopics}\n`;

    // If no context, return empty array to use generic prompts
    if (!userContext.trim()) {
      return new Response(JSON.stringify({ prompts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Always use Gemini 2.5 Flash for prompt generation - fast, efficient, reliable
    const PROMPT_MODEL = 'google/gemini-2.5-flash';
    console.log('Using model for personalized prompts:', PROMPT_MODEL);

    const requestBody = {
      model: PROMPT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You generate personalized conversation prompts for a user to send to an AI assistant.

User context that you ALREADY KNOW about them:
${userContext}

Return ONLY a JSON array of prompt objects with this structure:
[
  {
    "text": "SHORT display text (25-35 chars max)",
    "fullPrompt": "the complete personalized prompt that will be sent to AI",
    "icon": "emoji that fits the prompt",
    "category": "chat|create|write|code"
  }
]

CRITICAL STYLE RULES:
1. DO NOT re-state or summarize the user's context in prompts
2. Reference context IMPLICITLY - the AI already knows their background
3. Be PRACTICAL and ACTIONABLE - focus on real tasks, not ethereal/spiritual stuff
4. Get straight to the point - these are continuation prompts, not introductions

WORD RESTRICTIONS:
- For coding tasks, use: "code", "build", "develop", "program", "write code"
- NEVER use: "generate", "create", "make", "draw", "image", "picture", "photo", "visualize", "render", "illustrate"

CORRECT EXAMPLES (implicit context reference):
✅ "Review my pitch deck draft" (assumes AI knows they're a founder)
✅ "Ideas for Episode 24's topic?" (assumes AI knows about their podcast)
✅ "Draft a follow-up for yesterday's lead" (assumes AI knows their sales job)

WRONG EXAMPLES (explicitly re-stating context - DON'T DO):
❌ "I'm a sales manager at ABC Corp, help me with..." (don't re-explain)
❌ "As a podcast host with 50 episodes..." (don't re-state their context)
❌ "Given that I work in window sales..." (don't repeat known info)

Keep "text" short (25-35 chars), put full context in "fullPrompt".`
        },
        {
          role: 'user',
          content: userContext
        }
      ],
      temperature: 0.8,
      max_tokens: 500,
    };

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('Unexpected OpenAI response:', data);
      return new Response(JSON.stringify({ prompts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = data.choices[0].message.content.trim();
    
    // Parse JSON response
    let prompts = [];
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      prompts = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content, parseError);
      return new Response(JSON.stringify({ prompts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ prompts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error generating personalized prompts:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      prompts: [],
      error: message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
