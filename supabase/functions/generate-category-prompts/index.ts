import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fallbackPrompts = {
  chat: [
    { label: "Plan Week", prompt: "Help me plan the rest of my week around what matters most." },
    { label: "Think Through", prompt: "Help me think through a decision and compare the tradeoffs clearly." },
    { label: "Explain Simply", prompt: "Explain a topic I am curious about in plain language with examples." },
    { label: "Reset Focus", prompt: "Help me reset my focus and choose the next useful thing to do." },
    { label: "Practice Talk", prompt: "Role-play an important conversation so I can practice what to say." },
    { label: "Fresh Angle", prompt: "Give me a fresh perspective on a situation I am stuck on." },
  ],
  create: [
    { label: "Brand Mark", prompt: "Generate image: a polished logo mark concept for a modern digital product." },
    { label: "Profile Shot", prompt: "Generate image: a clean cinematic profile picture with strong lighting and personality." },
    { label: "Product Mockup", prompt: "Generate image: a realistic product mockup in a premium editorial ad style." },
    { label: "Social Graphic", prompt: "Generate image: a bold social media graphic with a clear focal point and crisp typography space." },
    { label: "Wallpaper", prompt: "Generate image: a high-resolution wallpaper with rich detail and balanced composition." },
    { label: "Poster Concept", prompt: "Generate image: a striking poster concept with strong contrast and memorable art direction." },
  ],
  write: [
    { label: "Draft Email", prompt: "Draft a clear email for something I need to send, then make it warmer and more concise." },
    { label: "Polish Text", prompt: "Improve this writing so it sounds cleaner, sharper, and more natural." },
    { label: "Outline Piece", prompt: "Help me outline a piece of writing with a strong structure and useful talking points." },
    { label: "Rewrite Tone", prompt: "Rewrite this in a tone that feels confident, friendly, and professional." },
    { label: "Meeting Notes", prompt: "Turn rough notes into a clean summary with decisions and next steps." },
    { label: "Strong Hook", prompt: "Help me write a stronger opening hook for something I am working on." },
  ],
  code: [
    { label: "Mini Tool", prompt: "Code: Build a useful mini tool with HTML, CSS, and JavaScript." },
    { label: "Landing Page", prompt: "Code: Create a responsive landing page with modern visuals and clear sections." },
    { label: "Dashboard UI", prompt: "Code: Build a compact dashboard interface with stats, charts, and controls." },
    { label: "Interactive Demo", prompt: "Code: Create a polished interactive demo using HTML, CSS, and JavaScript." },
    { label: "Form Flow", prompt: "Code: Build a clean form flow with validation and helpful states." },
    { label: "Animation Lab", prompt: "Code: Create a smooth animation playground with controls." },
  ],
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let requestedCategory: keyof typeof fallbackPrompts = 'chat';

  // Require signed-in user — this consumes paid AI gateway credits
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { category } = await req.json();
    requestedCategory = ['chat', 'create', 'write', 'code'].includes(category) ? category : 'chat';

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

CRITICAL: Labels SHORT (2-3 words). Prompts concise (1-2 sentences). Keep them GENERAL — never invent fake user context (no fake counts, leftover items, names, dates, possessions).
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

CRITICAL: Labels SHORT (2-3 words). Prompts general and open-ended (1-2 sentences) — never fabricate user-specific details.
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
9. KEEP PROMPTS GENERAL & OPEN-ENDED. The user will add their own context in follow-ups.
   - DO NOT invent fake user-specific details (e.g. "5 ingredients in my fridge", "leftover screws from a flat-pack project", "my friend Sarah's wedding next Tuesday").
   - DO NOT pretend the user has a specific situation, possession, deadline, count, or backstory.
   - DO write prompts that invite the user to bring their own details: "Suggest a recipe with ingredients I have", "Help me troubleshoot a DIY project", "Draft an email I need to send".
   - Good: "🍳 Quick Dinner" → "Suggest a quick dinner idea I can make tonight."
   - Bad: "🍳 Fridge Sandwich" → "Suggest a sandwich using the 5 ingredients left in my fridge before grocery day."

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

CRITICAL: Every single label MUST have an emoji at the start! Use only regular quotes in JSON! Keep prompts general — never fabricate specific user details!`;

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const PROMPT_MODEL = 'gpt-5.4-nano';
    console.log('Using model for category prompts:', PROMPT_MODEL);

    const requestBody = {
      model: PROMPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate 6 completely unique, never-before-seen ${category} prompts. Be wildly creative! Timestamp: ${timestamp}` }
      ],
      max_completion_tokens: 2000,
    };

    // Call AI to generate prompts
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('AI gateway error:', response.status, errText);
      return new Response(
        JSON.stringify({ prompts: fallbackPrompts[category as keyof typeof fallbackPrompts], fallback: true, error: `AI service temporarily unavailable (${response.status})` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        console.error(`Failed to parse AI response JSON: ${parseMessage}`);
        return new Response(
          JSON.stringify({ prompts: fallbackPrompts[category as keyof typeof fallbackPrompts], fallback: true, error: `Failed to parse AI response JSON: ${parseMessage}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
      JSON.stringify({ prompts: fallbackPrompts[requestedCategory], fallback: true, error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
