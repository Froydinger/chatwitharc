import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, messages, model = 'sonar-pro', stream = false } = await req.json();

    if (!query && (!messages || messages.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Query or messages required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build messages for Perplexity
    const perplexityMessages: PerplexityMessage[] = messages || [
      {
        role: 'system',
        content: 'You are a helpful research assistant. Be precise, cite sources, and provide comprehensive answers. Format your response with clear headings and bullet points when appropriate.'
      },
      {
        role: 'user',
        content: query
      }
    ];

    console.log('Perplexity search:', { query, model, messageCount: perplexityMessages.length });

    if (stream) {
      // Streaming response
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: perplexityMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perplexity API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `Perplexity API error: ${response.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return the stream directly
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    // Non-streaming response
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: perplexityMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Perplexity API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Perplexity response received, citations:', data.citations?.length || 0);

    // Extract content and citations
    let content = data.choices?.[0]?.message?.content || '';
    const citations: string[] = data.citations || [];

    // Convert citations to SearchResult format
    const sources: SearchResult[] = citations.map((url: string, index: number) => {
      // Extract domain for title fallback
      let domain = '';
      try {
        domain = new URL(url).hostname.replace('www.', '');
      } catch {
        domain = url;
      }

      return {
        title: `Source ${index + 1} - ${domain}`,
        url,
        snippet: '', // Perplexity doesn't provide snippets directly
      };
    });

    // Replace citation references [1], [2], etc. with actual markdown links
    citations.forEach((url: string, index: number) => {
      let domain = '';
      try {
        domain = new URL(url).hostname.replace('www.', '');
      } catch {
        domain = url;
      }
      
      // Replace [n] with superscript-style markdown link
      // Use a non-breaking format that won't merge into surrounding words
      const citationNum = index + 1;
      const patterns = [
        new RegExp(`\\[\\[${citationNum}\\]\\]`, 'g'),  // [[1]] first (greedy)
        new RegExp(`\\[${citationNum}\\]`, 'g'),  // [1]
      ];
      
      patterns.forEach(pattern => {
        content = content.replace(pattern, ` [${domain}](${url}) `);
      });
      
      // Clean up any double spaces introduced
      content = content.replace(/  +/g, ' ').replace(/ \./g, '.').replace(/ ,/g, ',');
    });

    return new Response(
      JSON.stringify({
        content,
        sources,
        citations,
        model: data.model,
        usage: data.usage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Perplexity search error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
