import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild-wasm';

// Execute production handlers with in-memory auth/DB/storage and provider stubs.
// Every request is intercepted: these tests cannot spend credits or contact APIs.
const ctx = { handler: null, client: null };
const originals = { fetch: globalThis.fetch, Deno: globalThis.Deno, EdgeRuntime: globalThis.EdgeRuntime, localStorage: globalThis.localStorage };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9xkAAAAASUVORK5CYII=', 'base64');
const source = index => `data:image/png;base64,${Buffer.concat([png, Buffer.from([index])]).toString('base64')}`;
const shapedSource = (width, height) => {
  // Header-only fixture; the provider is stubbed and no decoder is exercised.
  const bytes = Buffer.from(png);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
};
const reset = (extra = {}) => Object.assign(ctx, {
  calls: [], jobs: [], tasks: [], fetches: [], uploads: [], downloads: [], signed: [],
  allowed: true, tier: 'boost', responsePlan: [], uploadFailures: 0, statusJob: null, storedJobs: new Map(), snapshotError: false, ...extra,
});
reset();
globalThis.__arcMediaTest = ctx;
globalThis.Deno = { env: { get: () => 'test-only' } };
globalThis.EdgeRuntime = { waitUntil: task => ctx.tasks.push(task) };
ctx.client = {
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from(table) {
    let inserted = null;
    let update = null;
    const filters = {};
    const query = {
      upsert(row) {
        const key = `${row.user_id}:${row.image_request_key}`;
        if (!ctx.storedJobs.has(key)) {
          inserted = { id: `test-job-${ctx.jobs.length + 1}`, ...row };
          ctx.jobs.push({ table, ...inserted });
          ctx.storedJobs.set(key, inserted);
        }
        return query;
      },
      update(row) { update = row; ctx.calls.push({ table, update: row }); return query; },
      select() { return query; },
      eq(key, value) {
        filters[key] = value;
        if (update && key === 'id') {
          const existing = [...ctx.storedJobs.values()].find(row => row.id === value);
          if (existing) Object.assign(existing, update);
        }
        return query;
      },
      in() { return query; },
      maybeSingle: async () => ({ data: inserted ? { id: inserted.id } : null }),
      single: async () => ({ data: ctx.statusJob ?? [...ctx.storedJobs.values()].find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null }),
    };
    return query;
  },
  async rpc(name, args) {
    ctx.calls.push({ name, args });
    if (name === 'arc_image_snapshot') return ctx.snapshotError ? { error: { message: 'Fixture policy unavailable' } } : { data: { tier: ctx.tier, liteAvailable: true } };
    if (name === 'reserve_arc_image_credits') {
      const job = [...ctx.storedJobs.values()].find(row => row.id === args.target_job_id);
      assert(job, 'Reservation identifies an existing owned job');
      assert(['1024x1024', '1536x1024', '1024x1536', '1536x864', 'auto'].includes(job.image_size));
      const expectedSize = job.aspect_ratio === '1:1' ? '1024x1024' : job.job_type === 'edit' ? 'auto'
        : job.aspect_ratio === '16:9' ? '1536x864' : ['2:3', '3:4', '9:16'].includes(job.aspect_ratio) ? '1024x1536' : '1536x1024';
      assert.equal(job.image_size, expectedSize, 'New jobs satisfy the existing SQL size/cost contract');
      const unitCost = job.preferred_model === 'gpt-image-2.5-flare'
        ? job.image_quality === 'low' || job.image_size === '1024x1024' ? 1 : 2
        : job.preferred_model === 'gpt-image-2.5-sunburst' ? job.image_size === '1024x1024' ? 4 : 6 : null;
      assert(unitCost !== null, 'No new reservation uses a retired model or retired credit cost');
      return { data: { allowed: ctx.allowed, remaining: 0, unitCost } };
    }
    return { data: { allowed: ctx.allowed, remaining: 0 } };
  },
  storage: { from(bucket) { return {
    async upload(path, bytes, options) {
      ctx.uploads.push({ bucket, path, bytes, options });
      return ctx.uploadFailures-- > 0 ? { error: { message: 'Fixture storage failure' } } : { error: null };
    },
    async download(path) { ctx.downloads.push({ bucket, path }); return { data: new Blob([png], { type: 'image/png' }) }; },
    async createSignedUrl(path, ttl) { ctx.signed.push({ bucket, path, ttl }); return { data: { signedUrl: `https://arc.test/signed/${path}` } }; },
  }; } },
};
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/images\/(generations|edits)$/);
  const form = init.body instanceof FormData ? init.body : null;
  ctx.fetches.push({ url, body: form ?? JSON.parse(init.body) });
  const status = ctx.responsePlan.shift() ?? 200;
  return Response.json(status === 200 ? { data: [{ b64_json: png.toString('base64') }] } : { error: { message: 'Fixture provider failure' } }, { status });
};
async function loadEdge(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{
    name: 'edge-stubs', setup(b) {
      b.onResolve({ filter: /^https:\/\// }, args => ({ path: args.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents:
        path.includes('/http/server') ? 'export const serve = handler => { globalThis.__arcMediaTest.handler = handler; };' :
        path.includes('supabase-js') ? 'export const createClient = () => globalThis.__arcMediaTest.client;' :
        path.includes('imagescript') ? 'export class Image {}; export const decode = () => { throw new Error("Unexpected image decoding"); };' : '',
      }));
      b.onLoad({ filter: /\/edit-image\/index\.ts$/ }, ({ path }) => ({ contents: `${readFileSync(path, 'utf8')}\nexport { sizeFromDimensions };`, loader: 'ts' }));
    },
  }] });
  const exports = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return { handler: ctx.handler, ...exports };
}
const request = body => new Request('https://arc.test/', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const invoke = async (handler, body) => (await handler(request(body))).json();
const finish = async () => Promise.all(ctx.tasks);
const finalized = () => ctx.calls.filter(c => c.name === 'finalize_arc_image_credits');
const legacyHash = (kind, body) => {
  const config = { model: kind === 'generate' ? body.preferredModel : body.imageModel, quality: 'native', size: '1K' };
  const input = kind === 'generate'
    ? { rawPrompt: body.prompt.trim(), aspectRatio: body.aspectRatio, config, count: body.count }
    : { prompt: body.prompt, imageArray: body.baseImageUrls, aspect: body.aspectRatio, config, requestedCount: body.count };
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
};
try {
  const { handler: video } = await loadEdge('supabase/functions/generate-video/index.ts');
  assert.equal((await invoke(video, { prompt: 'test' })).errorType, 'provider_unavailable');
  assert.equal(ctx.jobs.length, 0); assert.equal(ctx.calls.length, 0); assert.equal(ctx.fetches.length, 0);

  const { handler: generate } = await loadEdge('supabase/functions/generate-image/index.ts');
  const { handler: edit, sizeFromDimensions } = await loadEdge('supabase/functions/edit-image/index.ts');
  for (const handler of [generate, edit]) {
    for (const tier of ['free', 'unknown']) {
      for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']) {
        reset({ tier });
        const result = await invoke(handler, { prompt: 'test', preferredModel: model, imageModel: model, baseImageUrls: [source(0)], tier: 'admin', isAdmin: true, hasBoost: true });
        assert.equal(result.success, false); assert.equal(result.errorType, 'model_unavailable');
        assert.match(result.error, /no longer available.*GPT/); assert.equal(result.fallback, undefined);
        assert.equal(ctx.jobs.length, 0, 'Retired requests cannot create jobs');
        assert.deepEqual(ctx.calls.map(c => c.name), ['arc_image_snapshot'], 'Only verified tier is read; no reservation or mutation');
        assert.equal(ctx.fetches.length, 0, 'Retired requests cannot call a provider');
        assert.equal(ctx.downloads.length, 0, 'Retired edit requests cannot retrieve image inputs');
        assert.equal(ctx.tasks.length, 0);
      }
    }
  }

  for (const [kind, handler] of [['generate', generate], ['edit', edit]]) {
    for (const tier of ['boost', 'admin']) {
      for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']) {
        for (const aspect of ['1:1', '3:2', '2:3', '16:9', ...(kind === 'edit' ? ['source'] : [])]) {
          reset({ tier });
          const body = { prompt: 'Combine the sources with a transparent background', preferredModel: model, imageModel: model,
            quality: 'low', aspectRatio: aspect, count: 3, requestKey: randomUUID(), baseImageUrls: Array.from({ length: 10 }, (_, i) => source(i)) };
          const response = await invoke(handler, body);
          assert.equal(response.success, true); assert.equal(response.preferredModel, 'gpt-image-2.5-flare');
          assert.equal(response.fallbackModel, 'gpt-image-2.5-flare', 'Existing clients receive their fallback notice');
          assert.equal(response.quota.unitCost, aspect === '1:1' ? 1 : 2, 'Only the normal Flare price applies');
          await finish();
          const job = [...ctx.storedJobs.values()][0];
          assert.equal(job.preferred_model, 'gpt-image-2.5-flare'); assert.equal(job.image_quality, 'medium');
          assert.equal(job.fallback_model, 'gpt-image-2.5-flare', 'Completion must retain the compatibility notice');
          assert.equal(job.image_request_hash, legacyHash(kind, body), 'Exact original hash contract survives aliasing');
          assert.equal(ctx.calls.find(c => c.name === 'reserve_arc_image_credits').args.requested_count, 3);
          assert.equal(ctx.fetches.length, 3);
          const size = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536', '16:9': '1536x864', source: '1024x1024' }[aspect];
          for (const call of ctx.fetches) {
            const field = name => kind === 'edit' ? call.body.get(name) : call.body[name];
            assert.equal(field('model'), 'gpt-image-2.5-flare'); assert.equal(field('quality'), 'medium'); assert.equal(field('size'), size);
            assert.equal(field('background'), 'transparent'); assert.equal(field('output_format'), 'png');
            if (kind === 'edit') {
              assert.equal(call.body.getAll('image[]').length, 10);
              for (const [index, image] of call.body.getAll('image[]').entries()) {
                assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.concat([png, Buffer.from([index])]));
              }
            }
          }
          assert.equal(finalized().at(-1).args.successful_count, 3);
        }
      }
    }

    for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']) {
      const body = { prompt: 'Legacy retry', preferredModel: model, imageModel: model, aspectRatio: '3:2', count: 2,
        requestKey: randomUUID(), baseImageUrls: [source(0), source(1)] };
      // A pre-release request may already be running, completed or failed.
      // No retry can rewrite it, restart it, reserve again or change its cost.
      for (const status of ['processing', 'completed', 'failed']) {
        const old = { id: 'legacy-job', user_id: 'test-user', image_request_key: body.requestKey,
          image_request_hash: legacyHash(kind, body), preferred_model: model, image_quality: 'native', image_size: '1K',
          status, fallback_model: null, result_image_urls: ['private-image://private-user-images/test-user/old.jpg'] };
        reset({ storedJobs: new Map([[`test-user:${body.requestKey}`, structuredClone(old)]]) });
        const response = await invoke(handler, body);
        assert.equal(response.jobId, 'legacy-job'); assert.equal(response.preferredModel, model); assert.equal(response.fallbackModel, null);
        assert.deepEqual([...ctx.storedJobs.values()][0], old, 'Existing job/history/in-flight metadata is untouched');
        assert.equal(ctx.jobs.length, 0); assert.equal(ctx.fetches.length, 0); assert.equal(ctx.tasks.length, 0);
        assert.deepEqual(ctx.calls.map(c => c.name), ['arc_image_snapshot']);
      }

      reset();
      const first = await invoke(handler, body); await finish();
      const unchangedJob = structuredClone([...ctx.storedJobs.values()][0]);
      const callsBefore = ctx.calls.length;
      for (const retry of [body, { ...body, quality: 'high' }]) {
        const replay = await invoke(handler, retry);
        assert.equal(replay.jobId, first.jobId); assert.equal(replay.preferredModel, 'gpt-image-2.5-flare');
        assert.equal(replay.fallbackModel, 'gpt-image-2.5-flare');
      }
      const otherAlias = model === 'gemini-3.1-flash-image' ? 'gemini-3.1-flash-lite-image' : 'gemini-3.1-flash-image';
      const conflicts = [{ prompt: 'Changed prompt' }, { count: 3 }, { aspectRatio: '1:1' }, { preferredModel: otherAlias, imageModel: otherAlias },
        { preferredModel: 'gpt-image-2.5-flare', imageModel: 'gpt-image-2.5-flare' },
        ...(kind === 'edit' ? [{ baseImageUrls: [source(1), source(0)] }, { baseImageUrls: [source(0)] }] : [])];
      for (const change of conflicts) {
        const conflict = await invoke(handler, { ...body, ...change });
        assert.equal(conflict.success, false); assert.match(conflict.error, /request conflict/);
      }
      assert(ctx.calls.slice(callsBefore).every(c => c.name === 'arc_image_snapshot'), 'Retries/conflicts never reserve, settle or modify jobs');
      assert.equal(ctx.jobs.length, 1); assert.equal(ctx.fetches.length, 2); assert.equal(ctx.tasks.length, 1);
      assert.deepEqual([...ctx.storedJobs.values()][0], unchangedJob);

      reset({ responsePlan: [400, 200] });
      const partial = await invoke(handler, body); await finish();
      assert.equal(partial.quota.unitCost, 2); assert.equal(ctx.fetches.length, 2);
      assert.equal(finalized().at(-1).args.successful_count, 1, 'Aliased partial failures retain generation-fenced refund accounting');
      assert.equal([...ctx.storedJobs.values()][0].fallback_model, 'gpt-image-2.5-flare');
    }
    for (const model of ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image-extra', 'gemini-3.8-flash']) {
      reset({ tier: 'admin' });
      const response = await invoke(handler, { prompt: 'test', preferredModel: model, imageModel: model, baseImageUrls: [source(0)] });
      assert.equal(response.errorType, 'model_unavailable'); assert.equal(ctx.jobs.length, 0); assert.equal(ctx.fetches.length, 0);
    }
    reset({ snapshotError: true });
    const unverified = await invoke(handler, { prompt: 'test', preferredModel: 'gemini-3.1-flash-image', imageModel: 'gemini-3.1-flash-image', baseImageUrls: [source(0)] });
    assert.equal(unverified.success, false); assert.equal(ctx.jobs.length, 0); assert.equal(ctx.fetches.length, 0);
  }

  for (const [model, quality, tier, expectedQuality] of [
    ['gpt-image-2.5-flare', 'high', 'free', 'low'],
    ['gpt-image-2.5-flare', 'low', 'boost', 'low'],
    ['gpt-image-2.5-flare', 'medium', 'boost', 'medium'],
    ['gpt-image-2.5-sunburst', 'low', 'boost', 'high'],
  ]) {
    reset({ tier });
    const result = await invoke(generate, { prompt: 'A transparent sticker', preferredModel: model, quality, aspectRatio: '16:9', count: 999 });
    assert.equal(result.success, true); await finish();
    assert.equal(ctx.jobs[0].preferred_model, model); assert.equal(ctx.jobs[0].image_quality, expectedQuality);
    assert.equal(ctx.calls.find(c => c.name === 'reserve_arc_image_credits').args.requested_count, 3);
    assert.equal(ctx.fetches.length, 3);
    for (const { body } of ctx.fetches) {
      assert.equal(body.model, model); assert.equal(body.quality, expectedQuality);
      assert.equal(body.size, '1536x864'); assert.equal(body.background, 'transparent'); assert.equal(body.output_format, 'png');
    }
    assert.equal(finalized().at(-1).args.successful_count, 3);
    assert(ctx.uploads.every(x => x.bucket === 'private-user-images' && x.path.startsWith('test-user/generated-')));
  }

  for (const handler of [generate, edit]) {
    reset({ allowed: false });
    const result = await invoke(handler, { prompt: 'test', preferredModel: 'gpt-image-2.5-flare', imageModel: 'gpt-image-2.5-flare', baseImageUrls: [source(0)] });
    assert.equal(result.errorType, 'daily_limit'); assert.equal(ctx.fetches.length, 0, 'Denied quota blocks all providers');
  }
  for (const handler of [generate, edit]) {
    reset({ responsePlan: [400] });
    await invoke(handler, { prompt: 'test', baseImageUrls: [source(0)] }); await finish();
    assert.equal(ctx.fetches.length, 1, 'Provider failure never switches models or starts another paid request');
    assert.equal(finalized().at(-1).args.successful_count, 0, 'Failed requests release their reservation');
  }
  for (const handler of [generate, edit]) {
    reset({ uploadFailures: 1 });
    await invoke(handler, { prompt: 'test', baseImageUrls: [source(0)], count: 3 }); await finish();
    assert.equal(finalized().at(-1).args.successful_count, 2, 'Partial storage success settles only stored outputs');
    assert.equal(ctx.calls.find(c => c.update?.status === 'completed').update.result_image_urls.length, 2);
  }

  // Verified OpenAI contract: repeated image[] multipart inputs, up to 16.
  // Arc keeps its existing maximum of 10; all sources must reach every output.
  // https://developers.openai.com/api/reference/resources/images/methods/edit
  // https://developers.openai.com/api/reference/go/resources/images/methods/edit
  for (const [model, expectedQuality] of [['gpt-image-2.5-flare', 'medium'], ['gpt-image-2.5-sunburst', 'high']]) {
    reset();
    await invoke(edit, { prompt: 'Merge these sources with a transparent background', imageModel: model, baseImageUrls: Array.from({ length: 10 }, (_, i) => source(i)), aspectRatio: 'source', count: 2 });
    await finish();
    assert.equal(ctx.jobs[0].image_size, 'auto', 'Source pricing input stays unchanged');
    assert.equal(ctx.jobs[0].aspect_ratio, 'source'); assert.equal(ctx.jobs[0].image_quality, expectedQuality);
    assert.equal(ctx.jobs[0].base_image_urls, null, 'No source payload is persisted in job metadata');
    for (const { body } of ctx.fetches) {
      assert.equal(body.get('model'), model); assert.equal(body.get('quality'), expectedQuality); assert.equal(body.get('size'), '1024x1024');
      assert.equal(body.get('background'), 'transparent'); assert.equal(body.get('output_format'), 'png');
      assert.equal(body.getAll('image[]').length, 10); assert.equal(body.getAll('image').length, 0);
      for (const [index, image] of body.getAll('image[]').entries()) {
        assert.equal(image.name, `input-${index}.png`); assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.concat([png, Buffer.from([index])]));
      }
    }
    assert.equal(finalized().at(-1).args.successful_count, 2);
  }
  reset();
  assert.equal((await invoke(edit, { prompt: 'test', baseImageUrls: Array.from({ length: 11 }, (_, i) => source(i)) })).errorType, 'invalid_request');
  assert.equal(ctx.jobs.length, 0); assert.equal(ctx.fetches.length, 0);

  for (const [w, h, expected] of [[1, 1, '1024x1024'], [1500, 1000, '1536x1024'], [1000, 1500, '1024x1536'], [1600, 900, '1536x864'], [3, 4, '1056x1408'], [4, 3, '1408x1056'], [9, 16, '864x1536']]) {
    assert.equal(sizeFromDimensions(w, h), expected);
  }
  for (const [w, h] of [[4, 5], [5, 4], [21, 9], [1, 3], [3, 1], [2_000_000, 1_000_000], [371, 719]]) {
    const [outW, outH] = sizeFromDimensions(w, h).split('x').map(Number);
    assert.equal(outW % 16, 0); assert.equal(outH % 16, 0);
    assert(outW <= 1536 && outH <= 1536 && outW * outH <= 1536 * 1024 && outW * outH >= 655360);
    assert(outW / outH >= 1 / 3 && outW / outH <= 3);
    assert(Math.abs((outW / outH) / (w / h) - 1) < 0.01, 'Source aspect remains within 1%');
  }
  for (const [w, h] of [[0, 1], [1, 0], [-1, 1], [NaN, 10], [Infinity, 10], [4, 1], [1, 4], [Number.MAX_SAFE_INTEGER + 1, 1]]) {
    assert.throws(() => sizeFromDimensions(w, h), /Source image/);
  }
  reset();
  await invoke(edit, { prompt: 'Keep the original shape', imageModel: 'gpt-image-2.5-sunburst', baseImageUrls: [shapedSource(300, 400)], aspectRatio: 'source' });
  await finish();
  assert.equal(ctx.fetches[0].body.get('size'), '1056x1408');
  assert.equal(ctx.jobs[0].image_size, 'auto'); assert.equal(ctx.jobs[0].image_quality, 'high');
  reset();
  await invoke(edit, { prompt: 'Keep the original shape', baseImageUrls: [shapedSource(400, 100)], aspectRatio: 'source' });
  await finish();
  assert.equal(ctx.fetches.length, 0, 'Unsupported source shapes never reach the provider');
  assert.equal(finalized().at(-1).args.successful_count, 0, 'Unsupported source shapes release reserved credits');

  // Old jobs are read without rewriting provider metadata or durable references.
  const { handler: status } = await loadEdge('supabase/functions/image-job-status/index.ts');
  for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']) {
    const ref = 'private-image://private-user-images/test-user/historical-image.jpg';
    reset({ statusJob: { id: 'old-job', user_id: 'test-user', status: 'completed', preferred_model: model, result_image_urls: [ref], job_type: 'generate', fallback_model: null } });
    const result = await invoke(status, { jobId: 'old-job' });
    assert.equal(result.preferredModel, model); assert.deepEqual(result.imageRefs, [ref]);
    assert.deepEqual(result.imageUrls, ['https://arc.test/signed/test-user/historical-image.jpg']);
    assert.equal(ctx.calls.length, 0); assert.equal(ctx.jobs.length, 0); assert.equal(ctx.fetches.length, 0);
  }

  const storeBuild = await build({ entryPoints: ['src/store/useImageGenStore.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  for (const [index, [version, mode]] of [[5, 'flash'], [6, 'lite'], [6, 'flash'], [7, 'lite'], [6, 'low'], [6, 'image'], [6, 'pro']].entries()) {
    let stored = JSON.stringify({ version, state: { imageMode: mode, aspectRatio: '2:3', editAspectRatio: '1:1', count: 2, proImage: true } });
    globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem() {} };
    const store = await import(`data:text/javascript;base64,${Buffer.from(storeBuild.outputFiles[0].text).toString('base64')}#case${index}`);
    const state = store.useImageGenStore.getState();
    assert.equal(state.imageMode, ['flash', 'lite'].includes(mode) ? 'low' : mode);
    assert.equal(store.getResolvedImageModel(), mode === 'pro' ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare');
    assert.equal(store.getResolvedImageModel(false), 'gpt-image-2.5-flare');
    assert.equal(state.aspectRatio, '2:3'); assert.equal(state.editAspectRatio, '1:1'); assert.equal(state.count, 2);
    assert.equal(JSON.parse(stored).version, 7); assert(store.IMAGE_MODEL_OPTIONS.every(x => x.id.startsWith('gpt-')));
    assert(store.ALLOWED_IMAGE_MODELS.every(x => x.startsWith('gpt-')));
    assert.equal(store.imageCreditCost('gpt-image-2.5-flare', 'source', 'medium'), 2);
    assert.equal(store.imageCreditCost('gpt-image-2.5-sunburst', 'source', 'high'), 6);
    assert.equal(store.imageCreditCost('gemini-3.1-flash-image', '1:1', 'native'), 5, 'Historical costs are retained');
    state.setImageMode('flash'); assert.equal(store.useImageGenStore.getState().imageMode, 'low');
  }
  console.log('PASS: exact legacy aliases use Flare HQ only for verified Boost/admin at 1–2 credits; Free/unverified/unknown IDs are blocked. Old/new retries preserve hashes, jobs and spend; conflicts are rejected. Actual-model notices, GPT settings, all-source edits, shapes, private storage, partial refunds, history and preference migration are preserved; video stays disabled. No live API calls.');
} finally {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  delete globalThis.__arcMediaTest;
}
