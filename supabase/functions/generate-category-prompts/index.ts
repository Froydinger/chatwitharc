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

    // Define prompts for each category
    const categoryPrompts = {
      chat: `Generate 6 fresh, creative chat prompt suggestions that encourage engaging conversations. Focus on:
- Personal reflection and growth
- Wellness and mental health
- Goal setting and productivity
- Casual conversations and connection
- Problem-solving and advice
- Gratitude and mindfulness

Make them feel personal, supportive, and diverse. Use an emoji at the start of each label.`,

      create: `Generate 6 fresh, creative image generation prompts. Mix different styles and themes:
- Retro/90s aesthetics and vaporwave
- Cosmic and space scenes
- Nature and landscapes
- Fantasy and surreal art
- Cyberpunk and futuristic
- Artistic portraits and compositions

Each prompt should start with "Generate an image:" and be vivid and detailed. Use an emoji at the start of each label.`,

      write: `Generate 6 fresh, creative writing prompt suggestions. Cover different writing styles:
- Creative fiction (stories, scenes, scripts)
- Personal writing (essays, letters, journals)
- Poetry and artistic writing
- Professional writing (blog posts, articles)
- Structured content (outlines, briefs)
- Expressive writing (manifestos, speeches)

Make them inspiring and actionable. Use an emoji at the start of each label.`,

      code: `Generate 6 fresh, creative coding project prompts. Focus on fun, interactive demos:
- Interactive games and animations
- Data visualizations and dashboards
- UI components and form builders
- Utility tools (calculators, timers, generators)
- Creative coding (particle systems, generative art)
- Practical web components

Each should specify using HTML, CSS, and JavaScript. Use an emoji at the start of each label.`,
    };

    const systemPrompt = `You are an AI assistant that generates creative, diverse prompt suggestions.

${categoryPrompts[category as keyof typeof categoryPrompts]}

Return ONLY a JSON array with exactly 6 objects, each with "label" and "prompt" fields.
Example format:
[
  {"label": "🎯 Topic name", "prompt": "Full prompt text here"},
  ...
]

Make each prompt unique, engaging, and different from common or generic options. Be creative and varied!`;

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
          { role: 'user', content: `Generate 6 fresh, creative ${category} prompts.` }
        ],
        temperature: 0.9, // Higher temperature for more creativity/variety
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
