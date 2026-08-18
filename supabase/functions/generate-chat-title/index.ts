// Dedicated chat-title generator.
//
// Naming used to piggyback on the [ENHANCE_MODE] short-circuit inside the main
// `chat` function. That path drags in admin settings, profile fetches, location
// injection, guest-mode branching and strict message validation before it ever
// reaches the model — any one of which silently aborts naming, and the client
// swallows the error, so every chat stays "New Chat" forever. Naming needs none
// of that, so it gets its own tiny function with a flat, auditable failure mode.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MODEL = 'gpt-5.6-luna';

const SYSTEM = `You name chat conversations.

Read the conversation and reply with a short, specific title of 3 to 5 words that captures what it is actually about.

RULES:
1. Output ONLY the title. No quotes, no markdown, no trailing period, no "Title:" label.
2. Be specific to this conversation — never generic ("New Chat", "Chat", "Conversation", "Untitled", "General Discussion").
3. Use the language the user is writing in.
4. Title Case. No emoji.`;

// Titles are short; this only needs to survive a stray label or quote pair.
function sanitize(raw: string): string {
  return raw
    .trim()
    .replace(/^(title|chat title)\s*[:\-–]\s*/i, '')
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/[.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

const GENERIC = new Set([
  'new chat',
  'chat',
  'untitled',
  'untitled chat',
  'conversation',
  'new conversation',
  'general discussion',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Keep only usable turns. Empty/placeholder messages are dropped rather than
    // rejected — a half-written turn should not block naming the whole chat.
    const turns = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0,
      )
      .slice(0, 6)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (turns.length === 0) {
      return new Response(JSON.stringify({ title: null, reason: 'no usable messages' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // Luna is a gpt-5.6 reasoning model: reasoning_effort, never temperature.
        reasoning_effort: 'none',
        // This is a ceiling, not an allocation — a title spends ~10 tokens. It is
        // set high because gpt-5.6 rejects a small budget outright: the old naming
        // path asked for 1200 and got a flat 400 on every single call, which is
        // what kept every chat named "New Chat". Matches the value the main chat
        // path has been using successfully.
        max_completion_tokens: 65536,
        messages: [
          { role: 'system', content: SYSTEM },
          ...turns,
          { role: 'user', content: 'Title this conversation. Reply with the title only.' },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ OpenAI ${res.status} while naming chat:`, errText);
      return new Response(JSON.stringify({ error: `OpenAI ${res.status}: ${errText}` }), {
        status: res.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const title = sanitize(data?.choices?.[0]?.message?.content ?? '');

    if (title.length < 3 || GENERIC.has(title.toLowerCase())) {
      console.warn('⚠️ Model returned an unusable title:', JSON.stringify(title));
      return new Response(JSON.stringify({ title: null, reason: 'unusable title' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✨ Generated chat title:', title);
    return new Response(JSON.stringify({ title }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('❌ generate-chat-title failed:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
