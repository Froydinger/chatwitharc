import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

// Execute the production edge handlers with in-memory auth/DB and provider
// stubs. These checks cannot call a real API or consume credits.
const ctx = { handler: null, calls: [], jobs: [], tasks: [], allowed: false, fetches: [] };
globalThis.__arcMediaTest = ctx;
globalThis.Deno = { env: { get: () => 'test-only' } };
globalThis.EdgeRuntime = { waitUntil: task => ctx.tasks.push(task) };
ctx.client = {
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from(table) {
    const query = {
      insert(row) { ctx.jobs.push(row); return query; },
      update(row) { ctx.calls.push({ update: row }); return query; },
      select() { return query; }, eq() { return query; }, in() { return query; },
      single: async () => ({ data: { id: 'test-job' } }),
    };
    return query;
  },
  async rpc(name, args) { ctx.calls.push({ name, args }); return { data: { allowed: ctx.allowed, remaining: 0 } }; },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  ctx.fetches.push({url,body:JSON.parse(init.body)});
  return new Response(JSON.stringify({error:{message:'Invalid request'}}), {status:400});
};
async function loadEdge(entry) {
  const result = await build({ entryPoints: [entry], bundle:true, write:false, format:'esm', platform:'node', plugins:[{
    name:'edge-stubs', setup(b) {
      b.onResolve({filter:/^https:\/\//}, args=>({path:args.path,namespace:'stub'}));
      b.onLoad({filter:/.*/,namespace:'stub'}, ({path})=>({contents:
        path.includes('/http/server') ? 'export const serve = handler => { globalThis.__arcMediaTest.handler = handler; };' :
        path.includes('supabase-js') ? 'export const createClient = () => globalThis.__arcMediaTest.client;' :
        path.includes('imagescript') ? 'export class Image {}; export const decode = () => { throw new Error("Unexpected image decoding"); };' : ''
      }));
    },
  }] });
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return ctx.handler;
}
const request = body => new Request('https://arc.test/', {method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)});
try {
  const video = await loadEdge('supabase/functions/generate-video/index.ts');
  const videoResult = await (await video(request({prompt:'test'}))).json();
  assert.equal(videoResult.errorType,'provider_unavailable');
  assert.equal(ctx.jobs.length,0); assert.equal(ctx.calls.length,0); assert.equal(ctx.fetches.length,0);
  const image = await loadEdge('supabase/functions/generate-image/index.ts');
  for (const model of ['gpt-image-1-mini','gpt-image-1','gpt-image-1.5-flash','gpt-image-2']) {
    const response = await (await image(request({prompt:'test',preferredModel:model,count:999}))).json();
    assert.equal(response.errorType,'daily_limit');
    assert.equal(ctx.jobs.at(-1).preferred_model,'gpt-image-2');
    assert.equal(ctx.calls.findLast(c=>c.name==='reserve_image_quota').args.requested_count,3);
  }
  assert.equal(ctx.fetches.length,0,'denied quota never reaches provider');
  ctx.allowed=true;
  await image(request({prompt:'test',preferredModel:'gpt-image-1-mini',count:1}));
  await Promise.all(ctx.tasks);
  assert.equal(ctx.fetches.length,1,'provider failure must not cascade to another model');
  assert.equal(ctx.fetches[0].body.model,'gpt-image-2');
  assert.equal(ctx.calls.findLast(c=>c.name==='finalize_image_quota').args.successful_count,0);

  // Stored Quick/legacy choices migrate without losing shape/count preferences.
  const storeBuild = await build({entryPoints:['src/store/useImageGenStore.ts'],bundle:true,write:false,format:'esm',platform:'node'});
  for (const [version,prefs] of [[1,{model:'gpt-image-1-mini'}],[2,{quick:true}]]) {
    let stored = JSON.stringify({version,state:{...prefs,aspectRatio:'2:3',editAspectRatio:'1:1',count:2}});
    globalThis.localStorage={getItem:()=>stored,setItem:(key,value)=>{stored=value;},removeItem(){}};
    const store = await import(`data:text/javascript;base64,${Buffer.from(storeBuild.outputFiles[0].text).toString('base64')}#v${version}`);
    assert.equal(store.getResolvedImageModel(),'gpt-image-2');
    assert.equal(store.useImageGenStore.getState().aspectRatio,'2:3');
    assert.equal(store.useImageGenStore.getState().editAspectRatio,'1:1');
    assert.equal(store.useImageGenStore.getState().count,2);
    assert.equal(JSON.parse(stored).version,3);
    assert.equal(JSON.parse(stored).state.quick,undefined);
  }
  console.log('PASS: video disabled before spend, legacy models normalize before quotas, denied quota blocks API, failed job refunds, preferences migrate');
} finally {
  globalThis.fetch=originalFetch;
  delete globalThis.__arcMediaTest; delete globalThis.Deno; delete globalThis.EdgeRuntime; delete globalThis.localStorage;
}
