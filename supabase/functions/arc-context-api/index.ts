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

  // GET request returns integration instructions
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      name: "Arc Context API",
      version: "1.0",
      description: "Access Arc AI's brain (system prompt, user memories, context blocks) for use in external applications.",
      modes: {
        "context-only": "Returns the fully assembled system prompt + user data as JSON. Inject as your system prompt with any model.",
        "chat": "Proxied chat — send messages and get AI responses with Arc's full brain applied automatically."
      },
      authentication: "Pass your Arc JWT token in the Authorization header as 'Bearer <token>'.",
      endpoints: {
        "POST /arc-context-api": {
          body: {
            mode: "'context-only' (default) | 'chat'",
            messages: "Required for 'chat' mode. Array of { role, content } objects.",
            model: "Optional. AI model to use for chat mode. Default: google/gemini-3-flash-preview"
          }
        }
      },
      example_context_only: {
        method: "POST",
        headers: { "Authorization": "Bearer YOUR_ARC_JWT", "Content-Type": "application/json" },
        body: { mode: "context-only" }
      },
      example_chat: {
        method: "POST",
        headers: { "Authorization": "Bearer YOUR_ARC_JWT", "Content-Type": "application/json" },
        body: { mode: "chat", messages: [{ role: "user", content: "Hello!" }] }
      }
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const user = userData.user;
    const body = await req.json();
    const mode = body.mode || 'context-only';

    // Fetch all context data in parallel
    const [settingsResult, profileResult, blocksResult] = await Promise.all([
      supabaseAdmin
        .from('admin_settings')
        .select('key, value')
        .in('key', ['system_prompt', 'global_context']),
      supabaseAdmin
        .from('profiles')
        .select('display_name, context_info, memory_info')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('context_blocks')
        .select('content, source')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

    const settings = (settingsResult.data || []).reduce((acc: Record<string, string>, s: any) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    const profile = profileResult.data;
    const contextBlocks = blocksResult.data || [];

    // Assemble the system prompt (mirrors chat/index.ts logic)
    const basePrompt = settings.system_prompt || 'You are Arc AI, a helpful assistant.';
    const globalContext = settings.global_context || '';

    let systemPrompt = basePrompt;

    systemPrompt += `\n\nCurrent date and time: ${new Date().toUTCString()}`;

    if (profile?.display_name) {
      systemPrompt += `\n\nUser: ${profile.display_name}`;
    }
    if (profile?.context_info?.trim()) {
      systemPrompt += ` | Context: ${profile.context_info}`;
    }
    if (profile?.memory_info?.trim()) {
      systemPrompt += `\n\n📝 Memories: ${profile.memory_info}`;
    }
    if (globalContext) {
      systemPrompt += `\n\nGlobal: ${globalContext}`;
    }

    // Append context blocks
    if (contextBlocks.length > 0) {
      systemPrompt += '\n\n--- USER CONTEXT BLOCKS ---';
      for (const block of contextBlocks) {
        systemPrompt += `\n• ${block.content}`;
      }
    }

    // Behavioral guidelines (simplified for external use — no tool descriptions)
    systemPrompt += '\n\n--- BEHAVIORAL GUIDELINES ---\n' +
      '• Keep responses conversational, SHORT, and CONCISE unless asked for detail.\n' +
      '• Use save_memory whenever the user shares personal info or asks you to remember something.\n' +
      '• Default to conversation, not coding. Only generate code when explicitly requested.\n';

    // ========== CONTEXT-ONLY MODE ==========
    if (mode === 'context-only') {
      return new Response(JSON.stringify({
        system_prompt: systemPrompt,
        user: {
          display_name: profile?.display_name || null,
          memories: profile?.memory_info || null,
          context_info: profile?.context_info || null,
        },
        context_blocks: contextBlocks,
        metadata: {
          generated_at: new Date().toISOString(),
          block_count: contextBlocks.length,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========== CHAT MODE ==========
    if (mode === 'chat') {
      const messages = body.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'messages array is required for chat mode' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (messages.length > 50) {
        return new Response(JSON.stringify({ error: 'Too many messages (max 50)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        return new Response(JSON.stringify({ error: 'AI gateway not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const model = body.model || 'google/gemini-3-flash-preview';
      const allowedModels = [
        'google/gemini-3-flash-preview',
        'google/gemini-3.1-pro-preview',
        'google/gemini-2.5-flash',
        'openai/gpt-5-nano',
        'openai/gpt-5.2',
        'openai/gpt-5',
      ];
      const validatedModel = allowedModels.includes(model) ? model : 'google/gemini-3-flash-preview';

      const conversationMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m: any) => m.role !== 'system').map((m: any) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.slice(0, 50000) : String(m.content)
        }))
      ];

      const stream = body.stream !== false; // default to streaming

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: validatedModel,
          messages: conversationMessages,
          stream,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded, try again later' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const errorText = await aiResponse.text();
        console.error('AI gateway error:', status, errorText);
        return new Response(JSON.stringify({ error: 'AI gateway error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (stream) {
        return new Response(aiResponse.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
        });
      } else {
        const data = await aiResponse.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid mode. Use "context-only" or "chat".' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('arc-context-api error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
