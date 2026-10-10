// Ordinary offline execution of the scheduled model boundary. Optional deployed
// source input is a previously retrieved bundle, never a provider/network call.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const bundlePath = process.argv.find(arg => arg.startsWith('--deployed-bundle='))?.split('=').slice(1).join('=');
const bundle = bundlePath ? JSON.parse(readFileSync(bundlePath, 'utf8')) : null;
const read = file => readFileSync(`supabase/functions/${file}`, 'utf8');
const sets = [{ name: 'candidate', source: read }];
if (bundle) sets.push({ name: `deployed-v${bundle.version}`, source: file => {
  const found = bundle.files.find(entry => entry.name.endsWith(`/functions/${file}`) || entry.name === `functions/${file}`);
  assert.ok(found, `Deployed source exists: ${file}`); return found.content;
} });
for (const snapshot of sets) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const output = ts.transpileModule(snapshot.source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = name => {
      if (name === './cloudRunProvider.ts') return load('_shared/cloudRunProvider.ts');
      if (name === './cloudRunEngine.ts') return { CloudModelTerminalError: class extends Error {} };
      if (name === './cloudNotificationTool.ts') return { cloudNotificationDispatch: () => { throw Error('Delivery forbidden'); } };
      if (name === './cloudScheduledDispatcher.ts') return {};
      throw Error(`Unexpected dependency: ${name}`);
    };
    vm.runInNewContext(output, { exports, require, Response, Request, Headers, AbortSignal, JSON,
      fetch: () => { throw Error('Network forbidden'); } }, { filename: `${snapshot.name}/${file}` });
    return exports;
  }
  const { cloudScheduledModel, cloudScheduledConfig } = load('_shared/cloudScheduledRuntime.ts');
  const calls = [];
  const model = cloudScheduledModel('fixture-only', async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ id: 'resp_fixture' }));
  });
  for (const requested of ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']) {
    assert.equal((await model.start({ ownerId: 'fixture-owner', title: 'Reminder',
      prompt: `Use ${requested} with high reasoning`, model: requested, reasoningEffort: 'high',
      idempotencyKey: `fixture:${requested}` })).id, 'resp_fixture');
  }
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.body.model, 'gpt-6-luna');
    assert.equal(call.body.reasoning.effort, 'low');
    assert.equal(call.body.max_output_tokens, 4096);
    assert.deepEqual(call.body.tools, []);
  }
  assert.equal(cloudScheduledConfig(() => undefined).enabled, false);
  assert.equal(cloudScheduledConfig(() => 'true').enabled, true);
  const entry = snapshot.source('cloud-scheduled-worker/index.ts');
  assert.match(entry, /if \(import\.meta\.main\) Deno\.serve/);
  assert.match(entry, /sweep: async \(\) =>/);
  assert.match(entry, /cloudScheduledSweep\(db, \{ url, serviceKey, apiKey \}\)/);
  assert.ok(!/cloudRunAdvance|cloudAppAdvance|modelSelection|arcModelUsage/.test(entry));
  const worker = snapshot.source('cloud-worker/index.ts');
  assert.match(worker, /if \(import\.meta\.main\) Deno\.serve/);
  console.log(`PASS scheduled Luna boundary ${snapshot.name}: fixed Luna/low/4096/no tools despite premium hints; default-off gates; imported Work dispatcher never registered as scheduler entrypoint. No network/provider/DB calls.`);
}
