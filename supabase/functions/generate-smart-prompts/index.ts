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

    // Build prompt for AI
    const systemPrompt = `You generate personalized prompt suggestions for a user to send to an AI assistant.

IMPORTANT CONTEXT - This is information ABOUT THE USER (not you, the AI):
${profile?.display_name ? `- The user's name is: ${profile.display_name}` : ''}
${profile?.memory_info ? `- Things the user has shared about themselves: ${profile.memory_info}` : ''}
${profile?.context_info ? `- Additional context about the user: ${profile.context_info}` : ''}

${chatContext}

Generate 6 smart, personalized prompt suggestions.

CRITICAL PERSPECTIVE RULES:
1. Prompts must be written FROM THE USER'S PERSPECTIVE - as things THEY would say/ask TO an AI
2. Use first-person language: "I", "my", "me", "we", "our"
3. NEVER write prompts from the AI's perspective
4. NEVER address the user or use "you/your" in the prompts
5. The user's profile info describes THEM - they are the founder, they have the podcast, etc.

CORRECT EXAMPLES (user speaking to AI):
✅ "Help me brainstorm ideas for my next podcast episode"
✅ "What are some marketing strategies I could use for my business?"
✅ "Can you review my latest article draft?"

WRONG EXAMPLES (do NOT do this):
❌ "Tell me about your podcast" (AI doesn't have a podcast - the USER does)
❌ "What else can you share about your work?" (addressing user, not AI)
❌ "As a co-founder, you might consider..." (AI perspective, addressing user)

Return ONLY a JSON array with exactly 6 objects, each with "label" and "prompt" fields.
Example format:
[
  {"label": "🎯 Topic name", "prompt": "Full prompt text written from user's perspective"},
  ...
]`;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Call AI to generate prompts
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate 6 personalized smart prompts for me based on my profile and chat history.' }
        ],
        temperature: 0.8,
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

  } catch (error) {
    console.error('Smart prompts error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
