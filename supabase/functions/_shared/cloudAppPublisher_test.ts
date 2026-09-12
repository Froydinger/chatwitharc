import { deepStrictEqual, equal, match } from 'node:assert/strict';
import { publishCloudApp } from './cloudAppPublisher.ts';

Deno.test('cloud publisher bundles the durable app and sends an idempotent Netlify deploy shape', async () => {
  const calls: Array<{ url: string; method: string; body?: BodyInit | null }> = [];
  const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.includes('/sites?')) return new Response('[]');
    if (url.endsWith('/sites')) return Response.json({ site_id: 'site-1' });
    if (url.endsWith('/site-1')) return new Response('{}', { status: 200 });
    if (url.endsWith('/site-1/deploys')) return Response.json({ id: 'deploy-1', ssl_url: 'https://site-1.netlify.app' });
    return new Response('{}', { status: 404 });
  };
  const result = await publishCloudApp({
    'src/App.tsx': { language: 'tsx', content: 'export default function App(){return <main>hello</main>}' },
  }, {
    projectId: '00000000-0000-4000-8000-000000000001', runId: '00000000-0000-4000-8000-000000000002',
    siteId: null, subdomain: 'bakery-demo', title: 'Bakery Demo', description: 'A demo bakery site',
  }, { netlifyAccessToken: 'fixture-token', fetcher });
  deepStrictEqual({ siteId: result.siteId, deployId: result.deployId, url: result.url }, {
    siteId: 'site-1', deployId: 'deploy-1', url: 'https://bakery-demo.askarc.chat',
  });
  equal(calls.filter(call => call.url.endsWith('/deploys')).length, 1);
  const deploy = calls.find(call => call.url.endsWith('/deploys'));
  match(String(deploy?.body && (deploy.body as Uint8Array)[0]), /80/);
});
