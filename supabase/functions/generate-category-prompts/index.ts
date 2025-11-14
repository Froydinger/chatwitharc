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
      chat: `Generate 6 COMPLETELY DIFFERENT chat prompts. Be creative and unexpected! Mix topics like:
- Self-reflection, mental wellness, focus
- Casual chat, advice, life decisions
- Gratitude, goal-setting, productivity

CRITICAL: Labels should be SHORT (2-3 words max). Prompts should be concise (1-2 sentences).
AVOID generic options like "Reflect", "Check-in", "Gratitude" - be creative and unique!`,

      create: `Generate 6 COMPLETELY DIFFERENT image prompts. Be wild and creative! Mix styles:
- Retro/vaporwave, cosmic/space, nature
- Fantasy/surreal, cyberpunk, artistic

CRITICAL: Labels SHORT (2-3 words). Each prompt starts with "Generate an image:" then 1-2 descriptive sentences.
Use VARIED emojis. Avoid repeating styles or themes!`,

      write: `Generate 6 COMPLETELY DIFFERENT writing prompts. Be inventive! Mix types:
- Fiction, personal essays, poetry
- Blog posts, creative briefs, letters

CRITICAL: Labels SHORT (2-3 words). Prompts concise (1-2 sentences).
Use VARIED emojis and topics. NO generic titles!`,

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
1. Every label must be SHORT (2-3 words maximum)
2. Every prompt must be CONCISE (1-2 sentences)
3. Use DIFFERENT emojis for each item
4. NO repetition of themes, topics, or styles
5. Be CREATIVE and UNEXPECTED - surprise the user!

Return ONLY valid JSON array with 6 objects:
[
  {"label": "🎯 Short Title", "prompt": "Concise prompt text."},
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
