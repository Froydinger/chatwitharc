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

// No upstream call gets to stall the whole search. A provider that misses its
// window is treated as a failure so the fallback path can run.
const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

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

    const { query, messages, skipImages, quickAnswerOnly, mainContent, deepResearch, ultra } = await req.json();

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
            model: 'gpt-5.6-luna',
            messages: [
              { role: 'system', content: 'You are a precise, concise summarizer. Output exactly one sentence of key facts. Strict maximum of 20 words. No quotes, no markdown, no headings.' },
              { role: 'user', content: prompt }
            ],
            max_completion_tokens: 4096,
            reasoning_effort: 'low',
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

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!PERPLEXITY_API_KEY && !TAVILY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Search is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Perplexity's Search API returns ranked results as structured data with no
    // LLM answer, which is exactly the shape wanted here — synthesis already
    // happens below with Luna, so the Agent API's own grounded answer would be
    // paid for twice and then thrown away.
    // Callers opt in with deepResearch: Deep Search and scheduled-task lookups
    // both do, since neither gets a chance to ask a follow-up. In-chat web
    // search never reaches here at all — it runs its own Tavily path inside the
    // chat function, where the user can just ask again.
    const provider: 'perplexity' | 'tavily' =
      PERPLEXITY_API_KEY && deepResearch ? 'perplexity' : 'tavily';
    console.log('Research search:', { query: userQuery, skipImages, provider });

    // Normalized across providers: retrieval fills these, synthesis reads them.
    let rawResults: any[] = [];
    let quickAnswer = '';
    let providerImages: any[] = [];

    // Ultra Deep Search runs Perplexity's agentic Pro Search, which browses
    // rather than just retrieving, and answers with its own citations. It costs
    // several times a standard search request, so it is only ever reached when
    // the user picks that tab explicitly — never as a default or a fallback.
    let ultraContent = '';
    let ultraSources: SearchResult[] = [];

    if (ultra && PERPLEXITY_API_KEY) {
      const callPro = async (includeSearchType: boolean) => {
        const webSearchOptions: Record<string, unknown> = { search_context_size: 'high' };
        if (includeSearchType) webSearchOptions.search_type = 'pro';

        return fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              {
                role: 'system',
                content: 'You are an expert research analyst. Answer thoroughly and specifically, comparing and reconciling sources rather than summarizing one. Use clear markdown headings and short paragraphs. Cite inline with [1], [2] matching your sources. State uncertainty plainly where the evidence is thin or conflicting. Never mention which search engine or model produced this.',
              },
              { role: 'user', content: userQuery },
            ],
            web_search_options: webSearchOptions,
          }),
        }, 90000);
      };

      try {
        let proResp = await callPro(true);
        // search_type is the newer agentic flag; if this account or version
        // rejects it, fall back to plain Sonar Pro rather than failing.
        if (proResp.status === 400) {
          console.warn('Pro Search rejected search_type — retrying without it');
          proResp = await callPro(false);
        }

        if (proResp.ok) {
          const proData = await proResp.json();
          ultraContent = proData.choices?.[0]?.message?.content || '';
          const proResults: any[] = proData.search_results || [];
          const proCitations: string[] = proData.citations || [];
          ultraSources = proResults.length > 0
            ? proResults.slice(0, 8).map((r: any, i: number) => ({
                title: r.title || `Source ${i + 1}`,
                url: r.url,
                snippet: r.snippet || '',
              }))
            : proCitations.slice(0, 8).map((url: string, i: number) => ({
                title: `Source ${i + 1}`,
                url,
                snippet: '',
              }));
        } else {
          console.error('Pro Search failed:', proResp.status, await proResp.text());
        }
      } catch (e) {
        console.error('Pro Search error:', e);
      }

      // Anything that went wrong drops through to the standard path below.
      if (ultraContent && ultraSources.length > 0) {
        const citations = ultraSources.map((sourceItem) => sourceItem.url);
        let content = ultraContent;

        const maxCite = citations.length;
        content = content.replace(/\[(\d+)\]/g, (m: string, n: string) => (parseInt(n) > maxCite ? '' : m));
        citations.forEach((url, index) => {
          const num = index + 1;
          const superDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
          const superNum = String(num).split('').map((d) => superDigits[parseInt(d)]).join('');
          [new RegExp(`\\[\\[${num}\\]\\]`, 'g'), new RegExp(`\\[${num}\\]`, 'g')]
            .forEach((pattern) => { content = content.replace(pattern, `[${superNum}](${url})`); });
        });
        content = content.replace(/(\]\([^)]+\))(\[)/g, '$1, $2').replace(/  +/g, ' ');

        return new Response(
          JSON.stringify({
            content,
            sources: ultraSources,
            citations,
            images: [],
            model: 'arc-research-ultra',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (provider === 'perplexity') {
      let pplxResp: Response;
      try {
        pplxResp = await fetchWithTimeout('https://api.perplexity.ai/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: userQuery,
            max_results: 10,
            search_context_size: 'medium',
          }),
        }, 20000);
      } catch (e) {
        console.error('Perplexity search timed out or failed:', e);
        pplxResp = new Response(null, { status: 504 });
      }

      if (!pplxResp.ok) {
        const errText = await pplxResp.text();
        console.error('Perplexity search error:', pplxResp.status, errText);
        // 401 is a key problem and 429 is rate limiting; neither is worth
        // failing the whole search when Tavily is still configured.
        if (!TAVILY_API_KEY) {
          return new Response(
            JSON.stringify({ error: `Search failed: ${pplxResp.status}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.warn('Falling back to Tavily for this search');
      } else {
        const pplxData = await pplxResp.json();
        rawResults = (pplxData.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.snippet || '',
          raw_content: r.snippet || '',
          date: r.date || r.last_updated || undefined,
        }));
      }
    }

    // Perplexity's Search API returns no images. Fetching them means a second,
    // separately billed Tavily call per search, so it is opt-in: set
    // SEARCH_IMAGES=tavily to turn the image strip back on under Perplexity.
    if (
      provider === 'perplexity' &&
      rawResults.length > 0 &&
      !skipImages &&
      TAVILY_API_KEY &&
      Deno.env.get('SEARCH_IMAGES') === 'tavily'
    ) {
      try {
        const imgResp = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TAVILY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: userQuery,
            search_depth: 'basic',
            max_results: 3,
            include_images: true,
          }),
        });
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          providerImages = imgData.images || [];
        }
      } catch (e) {
        console.warn('Image lookup failed (non-fatal):', e);
      }
    }

    // Tavily runs as the primary provider when no Perplexity key is set, and as
    // the fallback when a Perplexity call fails.
    if (rawResults.length === 0 && TAVILY_API_KEY) {
      const tavilyResp = await fetchWithTimeout('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TAVILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userQuery,
          search_depth: 'advanced',
          chunks_per_source: 3,
          max_results: 12,
          include_answer: 'advanced',
          include_raw_content: true,
          include_images: !skipImages,
        }),
      }, 20000);

      if (!tavilyResp.ok) {
        const errText = await tavilyResp.text();
        console.error('Tavily error:', tavilyResp.status, errText);
        return new Response(
          JSON.stringify({ error: `Search failed: ${tavilyResp.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tavilyData = await tavilyResp.json();
      rawResults = tavilyData.results || [];
      quickAnswer = tavilyData.answer || '';
      providerImages = tavilyData.images || [];
    }

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
        const body = (r.raw_content || r.content || '').slice(0, 1800);
        return `[${i + 1}] ${r.title}\nURL: ${r.url}\nExcerpt: ${body}`;
      }).join('\n\n');

      const tavilyAnswer = quickAnswer ? `\n\nQuick answer (reference only, do not cite directly): ${quickAnswer}` : '';

      const synthSystem = `You are an expert research analyst. Produce a thorough, well-structured answer to the user's query using ONLY the retrieved sources. These sources were found by ArcAI; they were NOT pasted, shared, provided, or included by the user. Never attribute source material to the user. Answer the query directly and do not ask the user to paste a link, quote, or timestamp. If evidence is incomplete or conflicting, state the uncertainty and provide the best-supported answer. Synthesize across sources — compare, contrast, and reconcile differences. Use clear markdown headings, short paragraphs, and bullet points where helpful. Aim for depth and nuance, not just summary. CITATION RULES: Cite inline with [1], [2] etc. matching source numbers. Use a MINIMUM of 4 and MAXIMUM of 8 distinct sources. Never invent source numbers or write full URLs inline. Do not mention which search engine or AI was used.`;

      const synthUser = `Query: ${userQuery}\n\nArcAI-retrieved sources (not user-provided):\n${sourceBlock}${tavilyAnswer}\n\nWrite the comprehensive cited research answer now.`;

      try {
        const aiResp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.6-luna',
            messages: [
              { role: 'system', content: synthSystem },
              { role: 'user', content: synthUser },
            ],
            // Medium effort with a real cap: high effort against a 65k budget
            // was most of the wait, for an answer nobody reads to the end of.
            reasoning_effort: 'medium',
            max_completion_tokens: 6000,
          }),
        }, 60000);
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
      const tavilyAnswer = quickAnswer;
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

    const images = !skipImages ? providerImages.map((img: any) => {
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
