import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch admin settings for system prompt and global context
    const { data: systemPromptData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'system_prompt')
      .maybeSingle();

    const { data: globalContextData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'global_context')
      .maybeSingle();

    const systemPrompt = systemPromptData?.value || 'You are Arc AI, a helpful assistant. For wellness checks, therapy sessions, or step-by-step guidance requests, always provide clear numbered steps and ask follow-up questions to guide the user through the process.';
    const globalContext = globalContextData?.value || '';

    // Prepare messages with system prompt and global context
    const systemMessage = {
      role: 'system',
      content: `${systemPrompt}\n\nGlobal Context: ${globalContext}`.trim()
    };
    
    const messagesWithSystem = [systemMessage, ...messages];
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-nano-2025-08-07', // Fastest model
        messages: messagesWithSystem,
        max_completion_tokens: 4096, // Maximum tokens for GPT-5 nano
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    
    return new Response(
      JSON.stringify(data),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});