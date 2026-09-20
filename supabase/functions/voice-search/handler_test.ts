import { voiceSearchHandler } from './handler.ts';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const request = (body: unknown = { query: 'Chicago weather' }) => new Request('https://example.test', {
  method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body),
});
Deno.test('voice search authenticates before spending, validates query, and makes one basic lookup', async () => {
  let calls = 0;
  const fetcher = (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert(body.search_depth === 'basic' && body.max_results === 3, 'quick lookup only');
    assert(body.include_answer === false && body.include_images === false && body.auto_parameters === false, 'no generated answer or automatic advanced search');
    assert(!!init?.signal, 'bounded provider request');
    return Response.json({ results: [{ title: 'Result', url: 'https://example.com', content: 'x'.repeat(2000) },
      { title: 'unsafe', url: 'javascript:alert(1)', content: 'excluded' }] });
  }) as typeof fetch;
  const denied = voiceSearchHandler({ authenticate: async () => false, apiKey: () => 'test', fetcher });
  assert((await denied(request())).status === 401 && calls === 0, 'unauthorized must not spend');
  const handler = voiceSearchHandler({ authenticate: async () => true, apiKey: () => 'test', fetcher });
  assert((await handler(request({ query: '' }))).status === 400 && calls === 0, 'invalid must not spend');
  const result = await (await handler(request())).json();
  assert(calls === 1 && result.sources.length === 1 && result.sources[0].snippet.length === 1200, 'one lookup, bounded safe sources');
  assert(result.content.includes('https://example.com'), 'citations preserved');
});
Deno.test('provider failures do not retry or expose secrets', async () => {
  let calls = 0;
  const handler = voiceSearchHandler({ authenticate: async () => true, apiKey: () => 'test',
    fetcher: (async () => { calls++; return new Response('private provider details', { status: 429 }); }) as typeof fetch });
  const result = await handler(request());
  assert(result.status === 502 && calls === 1 && !(await result.text()).includes('private'), 'safe single failure');
});
