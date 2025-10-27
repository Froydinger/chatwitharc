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

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a thoughtful AI assistant generating personalized conversation prompts. Based on the user's context, generate 2-3 highly relevant, personalized prompts that:
- Reference their specific memories, interests, or recent topics
- Feel natural and conversational (not generic)
- Use their name (${displayName}) when appropriate
- Are actionable and engaging
- Vary in category (reflection, creation, conversation)

Return ONLY a JSON array of prompt objects with this structure:
[
  {
    "text": "SHORT display text (25-35 chars max)",
    "fullPrompt": "the complete personalized prompt with full context that will be sent to AI",
    "icon": "emoji that fits the prompt",
    "category": "chat|create|write|code"
  }
]

CRITICAL RULES:
1. Write ALL prompts from the USER's perspective (e.g., "Help me code...", "Show me how to...", "Build a...")
2. NEVER write from AI perspective (don't say "I'll help you..." or "Let me...")
3. For coding tasks, ALWAYS use: "code", "build", "develop", "program", "write code"
4. NEVER use these words as they trigger image generation: "generate", "create", "make", "draw", "image", "picture", "photo", "visualize", "render", "illustrate"
5. Keep "text" field very short (25-35 characters) for display
6. Put the full contextual prompt in "fullPrompt"

Example:
- text: "Code a todo app"
- fullPrompt: "Help me code a todo app with React and TypeScript that has task management features"

Make them feel like they're coming from someone who knows the user.`
          },
          {
            role: 'user',
            content: userContext
          }
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
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

  } catch (error) {
    console.error('Error generating personalized prompts:', error);
    return new Response(JSON.stringify({ 
      prompts: [],
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
