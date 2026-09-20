const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function voiceSearchHandler(options: {
  authenticate: (authorization: string) => Promise<boolean>;
  apiKey: () => string | undefined;
  fetcher?: typeof fetch;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const authorization = req.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ') || !await options.authenticate(authorization)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    let query: string;
    try {
      const body = await req.json();
      query = typeof body?.query === 'string' ? body.query.trim() : '';
      if (!query || query.length > 2000) return json({ error: 'A search query of up to 2000 characters is required' }, 400);
    } catch { return json({ error: 'Invalid request' }, 400); }
    const apiKey = options.apiKey();
    if (!apiKey) return json({ error: 'Search is unavailable' }, 503);
    try {
      // Voice already has a reasoning backend: return sources directly, without
      // a second model/tool loop or Tavily's generated answer and rich crawl.
      const response = await (options.fetcher || fetch)('https://api.tavily.com/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, search_depth: 'basic', max_results: 3,
          auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return json({ error: 'Search is temporarily unavailable' }, 502);
      const data = await response.json();
      const sources = (Array.isArray(data.results) ? data.results : [])
        .filter((result: any) => typeof result.url === 'string' && /^https?:\/\//i.test(result.url))
        .slice(0, 3).map((result: any) => ({
          title: typeof result.title === 'string' ? result.title.slice(0, 300) : result.url,
          url: result.url,
          snippet: typeof result.content === 'string' ? result.content.slice(0, 1200) : '',
        }));
      const content = sources.length
        ? sources.map((source: any, i: number) => `[${i + 1}] ${source.title}\n${source.snippet}\n${source.url}`).join('\n\n')
        : 'No relevant results found.';
      return json({ content, sources, search_provider: 'tavily' });
    } catch {
      return json({ error: 'Search took too long or is unavailable. Please try again.' }, 504);
    }
  };
}
