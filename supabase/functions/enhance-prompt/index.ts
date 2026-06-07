// Dedicated prompt-rewriter edge function. Does NOT execute the prompt — only
// rewrites it into a clearer, more detailed instruction for an AI.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MODEL = 'google/gemini-3-flash-preview';

const SYSTEM_CHAT = `You are a PROMPT REWRITER. Your ONLY job is to rewrite the user's prompt into a clearer, more specific, more effective prompt for an AI assistant.

ABSOLUTE RULES:
1. NEVER fulfill, answer, or execute the user's request. NEVER write the poem/story/code/essay/email/answer.
2. NEVER use tools. NEVER mention Canvas, files, or saving.
3. Output ONLY the rewritten prompt — clearer, more specific, with better context, structure, constraints, tone, and success criteria.
4. Preserve the user's intent and language. Keep it an INSTRUCTION TO an AI, not a response.
5. Return ONLY the improved prompt text. No preamble, no quotes, no markdown headers, no "Enhanced prompt:" label, no explanation.

Examples:
Input: "write me a poem"
Output: Write a short, emotionally resonant free-verse poem (12–16 lines) about quiet solitude at dusk, using concrete sensory imagery (light, sound, texture) and a subtle emotional turn near the end.

Input: "make a landing page"
Output: Design a modern, conversion-focused landing page for [product/service]. Include a hero with a clear value proposition and CTA, three benefit blocks with icons, social proof, an FAQ, and a closing CTA. Use a clean, minimal aesthetic with strong typography.

REMEMBER: rewrite the prompt. Do not answer it.`;

const SYSTEM_IMAGE = `You are an IMAGE PROMPT REWRITER. Rewrite the user's request into a vivid, detailed image-generation prompt: subject, style, lighting, composition, mood, and quality cues. Keep the user's original intent. NEVER generate or describe the image itself — only output the improved prompt text, with no quotes or preamble.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { text, kind = 'chat' } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const system = kind === 'image' ? SYSTEM_IMAGE : SYSTEM_CHAT;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Rewrite the following prompt. Do NOT answer it. Output only the improved prompt:\n\n${text.trim()}` },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Gateway ${res.status}: ${errText}` }), {
        status: res.status === 429 || res.status === 402 ? res.status : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const improved = data?.choices?.[0]?.message?.content?.trim();
    if (!improved) {
      return new Response(JSON.stringify({ error: 'No suggestion returned' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ improved }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
