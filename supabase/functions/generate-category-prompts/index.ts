import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();

    if (!category || !['chat', 'create', 'write', 'code'].includes(category)) {
      throw new Error('Invalid category');
    }

    // Add timestamp to ensure different results each time
    const timestamp = Date.now();
    const randomSeed = Math.random().toString(36).substring(7);

    // Define prompts for each category - KEEP CONCISE
    const categoryPrompts = {
      chat: `Generate 6 COMPLETELY DIFFERENT prompts where the USER is asking the AI for support. Think:
- "I had a rough day" / "Let's check in" / "Help me focus"
- "I'm feeling overwhelmed" / "I need motivation"
- "Can we talk about [topic]?" / "Help me process [feeling]"

The AI is a supportive assistant for the user's wellness and creative journey, NOT a human friend interviewing them.
Prompts should be what the USER would SAY to get help, support, or guidance.

CRITICAL: Labels SHORT (2-3 words). Prompts concise (1-2 sentences).
Avoid generic labels - be creative and relatable!`,

      create: `Generate 6 COMPLETELY DIFFERENT image prompts. Be wild and creative! Mix styles:
- Retro/vaporwave, cosmic/space, nature
- Fantasy/surreal, cyberpunk, artistic

CRITICAL: Labels SHORT (2-3 words). Each prompt MUST start with "Generate image:" (exactly) then 1-2 descriptive sentences.
Use VARIED emojis. Avoid repeating styles or themes!`,

      write: `Generate 6 COMPLETELY DIFFERENT prompts that HELP the user with their writing process:
- "Help me develop this character's backstory"
- "Create lore for my fantasy world"
- "Draft an outline for my blog post about [topic]"
- "Polish this rough draft" / "Brainstorm plot twists"

NOT just "write a story" - help them with THEIR writing, drafts, worldbuilding, and creative process.

CRITICAL: Labels SHORT (2-3 words). Prompts practical and specific (1-2 sentences).
Use VARIED emojis. Focus on supporting the writer!`,

      code: `Generate 6 COMPLETELY DIFFERENT coding prompts. Be fun and creative! Mix types:
- Games, animations, visualizations
- Tools, generators, interactive demos

CRITICAL: Labels SHORT (2-3 words). Prompts concise, specify HTML/CSS/JS.
Use VARIED emojis. Avoid common projects!`,
    };

    const systemPrompt = `You are a creative AI that generates UNIQUE, NEVER-REPEATED prompt suggestions.

TIMESTAMP: ${timestamp} | SEED: ${randomSeed}

${categoryPrompts[category as keyof typeof categoryPrompts]}

STRICT REQUIREMENTS:
1. EVERY label MUST start with a unique emoji character (🎯, 🚀, 💡, etc.)
2. Every label must be SHORT (2-3 words maximum) AFTER the emoji
3. Every prompt must be CONCISE (1-2 sentences)
4. Use DIFFERENT emojis for each of the 6 items - NO repeating emojis
5. NO repetition of themes, topics, or styles
6. Be CREATIVE and UNEXPECTED - surprise the user!

LABEL FORMAT (MANDATORY):
"[EMOJI] Short Title" - Example: "🎯 Dream Journal" or "🚀 Space Opera"

Return ONLY valid JSON array with 6 objects:
[
  {"label": "🎯 Short Title", "prompt": "Concise prompt text."},
  {"label": "🚀 Different Title", "prompt": "Another prompt."},
  ...
]

FOR IMAGE PROMPTS: prompt MUST start with "Generate image:" (exactly)
Example: {"label": "🎨 Neon City", "prompt": "Generate image: a cyberpunk cityscape with neon lights."}

CRITICAL: Every single label MUST have an emoji at the start!`;

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
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate 6 completely unique, never-before-seen ${category} prompts. Be wildly creative! Timestamp: ${timestamp}` }
        ],
        temperature: 1.0, // Maximum creativity for variety
        top_p: 0.95,
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
    console.error('Category prompts error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
