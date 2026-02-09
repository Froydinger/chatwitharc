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

    // Define prompts for each category - PRACTICAL, DOWN-TO-EARTH
    const categoryPrompts = {
      chat: `Generate 6 PRACTICAL, ACTIONABLE prompts. Think everyday tasks:
- "Plan my week" / "What should I make for dinner?" / "Help me draft an email"
- "Explain [concept] simply" / "Give me workout ideas" / "Help me budget"
- "Recommend a book" / "Practice interview questions" / "Help me decide between X and Y"

IMPORTANT: Be practical and useful - NOT ethereal, spiritual, or wellness-focused.
Prompts should help with real tasks, decisions, and everyday problems.

CRITICAL: Labels SHORT (2-3 words). Prompts concise (1-2 sentences).
Be grounded and helpful, not poetic!`,

      create: `Generate 6 COMPLETELY DIFFERENT image prompts. Be creative but PRACTICAL:
- Logos, icons, illustrations for projects
- Wallpapers, profile pictures, social media graphics
- Concept art, product mockups, scene designs

CRITICAL: Labels SHORT (2-3 words). Each prompt MUST start with "Generate image:" (exactly) then 1-2 descriptive sentences.
Use VARIED emojis. Make them useful!`,

      write: `Generate 6 PRACTICAL writing prompts that help with REAL tasks:
- "Draft a thank-you note for..." / "Write a LinkedIn summary"
- "Help me outline a presentation on..." / "Create a meeting agenda"
- "Proofread this paragraph" / "Make this email more professional"
- "Write a product description" / "Draft an apology message"

Focus on real-world writing tasks people actually need help with.

CRITICAL: Labels SHORT (2-3 words). Prompts practical and specific (1-2 sentences).
Avoid creative writing prompts - focus on utility!`,

      code: `Generate 6 USEFUL coding prompts. Think tools people actually need:
- Calculators, converters, form validators
- Countdown timers, to-do apps, note widgets
- Data formatters, API helpers, automation scripts

CRITICAL: Labels SHORT (2-3 words). Prompts concise, specify HTML/CSS/JS.
Use VARIED emojis. Make them practical and buildable!`,
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
7. Use only regular straight quotes (") not smart/curly quotes
8. Avoid backslashes, use forward slashes if needed

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

CRITICAL: Every single label MUST have an emoji at the start! Use only regular quotes in JSON!`;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Always use Gemini 2.5 Flash for prompt generation - fast, efficient, reliable
    const PROMPT_MODEL = 'google/gemini-2.5-flash';
    console.log('Using model for category prompts:', PROMPT_MODEL);

    const requestBody = {
      model: PROMPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate 6 completely unique, never-before-seen ${category} prompts. Be wildly creative! Timestamp: ${timestamp}` }
      ],
      temperature: 1.0,
      top_p: 0.95,
      max_tokens: 2000,
    };

    // Call AI to generate prompts
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse JSON from response with better error handling
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in AI response:', content);
      throw new Error('Failed to parse AI response - no JSON array found');
    }

    let prompts;
    try {
      // Clean common problematic characters before parsing
      let jsonString = jsonMatch[0];

      // The AI might use fancy unicode characters - normalize them
      jsonString = jsonString
        .replace(/[\u201C\u201D]/g, '"')  // Replace smart quotes with regular quotes
        .replace(/[\u2018\u2019]/g, "'")  // Replace smart single quotes
        .replace(/[\u2013\u2014]/g, '-')  // Replace em/en dashes with regular dash
        .replace(/\u2026/g, '...')        // Replace ellipsis character
        .replace(/\r\n/g, ' ')            // Replace Windows line endings
        .replace(/\n/g, ' ')              // Replace newlines with spaces
        .replace(/\t/g, ' ')              // Replace tabs with spaces
        .replace(/\s+/g, ' ');            // Normalize multiple spaces

      prompts = JSON.parse(jsonString);
    } catch (parseError: unknown) {
      // Try to recover truncated JSON by extracting complete objects
      console.warn('Initial JSON parse failed, attempting recovery...');
      
      let jsonString = jsonMatch[0]
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ');
      
      // Find all complete JSON objects in the truncated response
      const objectMatches = jsonString.matchAll(/\{"label":\s*"[^"]+",\s*"prompt":\s*"[^"]+"\}/g);
      const recoveredPrompts = Array.from(objectMatches).map((m) => {
        try {
          return JSON.parse(m[0] as string);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      if (recoveredPrompts.length >= 3) {
        console.log(`Recovered ${recoveredPrompts.length} prompts from truncated response`);
        prompts = recoveredPrompts;
      } else {
        const parseMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        console.error('JSON parse error:', parseMessage);
        console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
        throw new Error(`Failed to parse AI response JSON: ${parseMessage}`);
      }
    }

    return new Response(
      JSON.stringify({ prompts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Category prompts error:', error);
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
