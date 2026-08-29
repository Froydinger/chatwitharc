import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fallbackPrompts = {
  ask: [
    { label: "🌐 Search The Web", prompt: "Search the web and tell me what's happening with a topic I'm following — give me the sources you used." },
    { label: "🌦️ Local Weather", prompt: "What's the weather where I am right now, and what should I plan around it today?" },
    { label: "⚖️ Weigh A Decision", prompt: "Help me weigh a decision I'm sitting on. Ask me what matters most, then lay out the tradeoffs honestly." },
    { label: "⏰ Remind Me", prompt: "Set me a reminder for something I keep forgetting, and pick a time that actually makes sense." },
    { label: "🔎 Fact Check This", prompt: "Fact-check a claim I heard. Search for it, tell me what holds up, and link where it came from." },
    { label: "🧠 Explain It Simply", prompt: "Explain a topic I'm curious about in plain language, then check whether I actually followed it." },
  ],
  reflect: [
    { label: "🌙 Rough Day", prompt: "I had a rough day. Help me talk through what happened without rushing me to a solution." },
    { label: "💾 Remember This", prompt: "There's something about me I want you to remember for future chats. Save it, and tell me how you'll use it." },
    { label: "🪞 What You Know", prompt: "What do you remember about me so far? Tell me what you've picked up and whether any of it is out of date." },
    { label: "🔁 Same Pattern", prompt: "I keep circling the same problem. Search our past chats and show me the pattern I'm not seeing." },
    { label: "🎯 Set An Intention", prompt: "Help me set one clear intention for today, and make it small enough that I'll actually do it." },
    { label: "📝 Weekly Review", prompt: "Walk me through a review of my week — what worked, what didn't, and what's worth carrying forward." },
  ],
  create: [
    { label: "🎨 Surprise Me", prompt: "image/ Something beautiful and unexpected — you pick the subject, the palette, and the mood. Make a real choice, not a safe one." },
    { label: "🌆 Neon City", prompt: "image/ A rain-slicked city street at night, neon signs reflecting in the puddles, one lit window telling a whole story." },
    { label: "🖼️ Profile Shot", prompt: "image/ A clean, cinematic portrait with strong directional light and real personality." },
    { label: "🕹️ Build Something Fun", prompt: "code/ Build me a small interactive toy in one page — you choose what. Make it something I'll actually play with for a minute." },
    { label: "📊 Dashboard Mock", prompt: "code/ Build a compact dashboard with live-looking stats, a chart, and a clean layout in a single HTML file." },
    { label: "🌈 Color Playground", prompt: "code/ Build a color palette playground where I can nudge values and instantly see the result on a sample layout." },
  ],
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let requestedCategory: keyof typeof fallbackPrompts = 'ask';

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
    requestedCategory = ['ask', 'reflect', 'create'].includes(category) ? category : 'ask';

    if (!category || !['ask', 'reflect', 'create'].includes(category)) {
      throw new Error('Invalid category');
    }

    // Add timestamp to ensure different results each time
    const timestamp = Date.now();
    const randomSeed = Math.random().toString(36).substring(7);

    // Define prompts for each category - PRACTICAL, DOWN-TO-EARTH
    const categoryPrompts = {
      ask: `Generate 6 prompts for the ASK tab: ordinary, day-to-day usefulness.

This is the practical tab — errands, plans, questions, logistics, decisions, learning something. Lean on what Arc can actually do: live web search with citations, current weather, reading an attached file or PDF, searching the user's own past chats, setting reminders and recurring tasks.

Examples of the RIGHT register: look something up, plan the week, compare two options, explain a topic, what to cook, draft a plan, set a reminder, practise for an interview.

STAY OUT of feelings, therapy, journaling, self-reflection or personal growth — that is the Reflect tab and must not appear here. No prefix on these; they are plain chat.`,

      reflect: `Generate 6 prompts for the REFLECT tab: therapy-adjacent, journaling, deep thought.

This is the inward tab — processing a hard day, sitting with something, journaling, noticing patterns, self-understanding, values, grief, burnout, relationships, growth. It leans on Arc's memory and past-chat search: what Arc remembers about the user, patterns across old conversations, saving something about themselves.

Examples of the RIGHT register: talk me through what happened today, what do you remember about me, help me journal on something, show me the pattern I keep repeating, help me sit with this rather than fix it, what am I avoiding.

STAY OUT of errands, logistics, lookups, planning and productivity — that is the Ask tab and must not appear here. Warm and human, never clinical or corporate-wellness. Some should invite Arc to listen rather than solve. No prefix on these; they are plain chat.`,

      create: `Generate 6 prompts for the CREATE tab: making something. Exactly 3 image and 3 coding — an even split, no writing prompts.

EVERY prompt in this tab MUST start with its command prefix, exactly:
- the 3 image prompts start with "image/ " then a vivid one-or-two-sentence description
- the 3 coding prompts start with "code/ " then what to build in a single HTML page

Image prompts should describe a real image worth looking at — specific light, mood, and subject, not a list of adjectives. Coding prompts should be things worth actually opening: small tools, toys, generators, visualisers.`,
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

FOR THE CREATE TAB: every prompt MUST start with "image/ ", "write/ " or "code/ " (exactly, including the slash and space). Ask and Reflect prompts take no prefix.
Example: {"label": "🎨 Neon City", "prompt": "image/ a cyberpunk cityscape, rain-slicked streets, neon bleeding into the puddles."}

CRITICAL: Every single label MUST have an emoji at the start! Use only regular quotes in JSON! Keep prompts general — never fabricate specific user details!`;

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const PROMPT_MODEL = 'gpt-5.6-luna';
    console.log('Using model for category prompts:', PROMPT_MODEL);

    const requestBody = {
      model: PROMPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate 6 completely unique, never-before-seen ${category} prompts. Be wildly creative! Timestamp: ${timestamp}` }
      ],
      reasoning_effort: 'low',
      max_completion_tokens: 65536,
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
