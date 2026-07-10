// Research search endpoint.
// Uses Tavily for live web results and OpenAI to synthesize a
// Perplexity-style cited answer. Response shape preserved for the frontend.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { query, messages, skipImages, quickAnswerOnly, mainContent } = await req.json();

    // Quick answer background generation short-circuit
    if (quickAnswerOnly) {
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500, headers: corsHeaders });
      }
      
      let quickAnswer = "";
      try {
        const textToSummarize = mainContent || query || "";
        console.log('Generating ultra-concise quick answer via GPT for length:', textToSummarize.length);
        
        const prompt = mainContent 
          ? `Summarize the provided text in exactly 1 clear, punchy sentence (strict maximum of 20 words). Focus only on direct, key facts. Do not use markdown headers, list markers, quotes, or punctuation formatting. Text: ${mainContent}`
          : `Provide a quick, direct 1-sentence answer (strict maximum of 20 words) to this question: "${query}". Plain text only, no markdown, no quotes, no punctuation.`;

        const quickResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.6-terra',
            messages: [
              { role: 'system', content: 'You are a precise, concise summarizer. Output exactly one sentence of key facts. Strict maximum of 20 words. No quotes, no markdown, no headings.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 50,
            temperature: 0.3,
          }),
        });

        if (quickResp.ok) {
          const quickData = await quickResp.json();
          quickAnswer = (quickData.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, '');
        } else {
          console.warn('Quick answer API call failed:', quickResp.status, await quickResp.text());
        }
      } catch (e) {
        console.warn('Quick answer generation error:', e);
      }

      return new Response(
        JSON.stringify({ quickAnswer }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userQuery: string = query || messages?.filter((m: any) => m.role === 'user').slice(-1)[0]?.content || '';
    if (!userQuery) {
      return new Response(
        JSON.stringify({ error: 'Query required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!TAVILY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Search is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Research search:', { query: userQuery, skipImages });

    // 1. Tavily search — research-grade settings (advanced depth, deep chunks, raw content, advanced answer)
    const tavilyResp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: userQuery,
        search_depth: 'advanced',
        chunks_per_source: 3,
        max_results: 12,
        include_answer: 'advanced',
        include_raw_content: true,
        include_images: !skipImages,
      }),
    });

    if (!tavilyResp.ok) {
      const errText = await tavilyResp.text();
      console.error('Tavily error:', tavilyResp.status, errText);
      return new Response(
        JSON.stringify({ error: `Search failed: ${tavilyResp.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tavilyData = await tavilyResp.json();
    const rawResults: any[] = tavilyData.results || [];

    // Dedupe by domain so we get diverse citations, cap at 8 for richer research
    const seenDomains = new Set<string>();
    const picked: any[] = [];
    for (const r of rawResults) {
      if (!r.url) continue;
      let domain = '';
      try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { domain = r.url; }
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      picked.push({ ...r, _domain: domain });
      if (picked.length >= 8) break;
    }

    if (picked.length === 0) {
      return new Response(
        JSON.stringify({
          content: `No results found for "${userQuery}".`,
          sources: [],
          citations: [],
          model: 'arc-research',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const citations: string[] = picked.map((r) => r.url);
    const sources: SearchResult[] = picked.map((r, i) => ({
      title: r.title || `Source ${i + 1} - ${r._domain}`,
      url: r.url,
      snippet: r.content || '',
    }));

    // 2. Synthesize a cited answer with OpenAI — use Gemini 2.5 Pro for research-grade reasoning
    let content = '';
    if (OPENAI_API_KEY) {
      const sourceBlock = picked.map((r, i) => {
        const body = (r.raw_content || r.content || '').slice(0, 3000);
        return `[${i + 1}] ${r.title}\nURL: ${r.url}\nExcerpt: ${body}`;
      }).join('\n\n');

      const tavilyAnswer = tavilyData.answer ? `\n\nQuick answer (reference only, do not cite directly): ${tavilyData.answer}` : '';

      const synthSystem = `You are an expert research analyst. Produce a thorough, well-structured answer to the user's query using ONLY the provided sources. Synthesize across sources — compare, contrast, and reconcile differences. Use clear markdown headings, short paragraphs, and bullet points where helpful. Aim for depth and nuance, not just summary. CITATION RULES: Cite inline with [1], [2] etc. matching source numbers. Use a MINIMUM of 4 and MAXIMUM of 8 distinct sources. Never invent source numbers or write full URLs inline. Do not mention which search engine or AI was used.`;

      const synthUser = `Query: ${userQuery}\n\nSources:\n${sourceBlock}${tavilyAnswer}\n\nWrite the comprehensive cited research answer now.`;

      try {
        const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.6-terra',
            messages: [
              { role: 'system', content: synthSystem },
              { role: 'user', content: synthUser },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          content = aiData.choices?.[0]?.message?.content || '';
        } else {
          console.warn('AI synth failed:', aiResp.status, await aiResp.text());
        }
      } catch (e) {
        console.warn('AI synth error:', e);
      }
    }

    // Fallback content if synthesis unavailable
    if (!content) {
      const tavilyAnswer = tavilyData.answer || '';
      content = tavilyAnswer
        ? `${tavilyAnswer}\n\n` + picked.map((r, i) => `[${i + 1}] ${r.title}`).join('\n')
        : picked.map((r, i) => `[${i + 1}] ${r.title}\n${(r.content || '').slice(0, 300)}`).join('\n\n');
    }

    // Strip any inline refs beyond available citation count
    const maxCite = citations.length;
    content = content.replace(/\[(\d+)\]/g, (m: string, n: string) => (parseInt(n) > maxCite ? '' : m));

    // Convert [n] markers to superscript markdown links pointing at the citation URL
    citations.forEach((url, index) => {
      const num = index + 1;
      const superDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
      const superNum = String(num).split('').map((d) => superDigits[parseInt(d)]).join('');
      const patterns = [
        new RegExp(`\\[\\[${num}\\]\\]`, 'g'),
        new RegExp(`\\[${num}\\]`, 'g'),
      ];
      patterns.forEach((p) => { content = content.replace(p, `[${superNum}](${url})`); });
    });

    // Add commas between consecutive superscript citations
    content = content.replace(/(\]\([^)]+\))(\[)/g, '$1, $2');
    content = content.replace(/  +/g, ' ');

    const images = !skipImages ? (tavilyData.images || []).map((img: any) => {
      if (typeof img === 'string') return img;
      return img?.url || '';
    }).filter(Boolean) : [];

    return new Response(
      JSON.stringify({
        content,
        sources,
        citations,
        images,
        model: 'arc-research',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Research search error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
