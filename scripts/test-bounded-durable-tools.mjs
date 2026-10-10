// Runs the real durable engine, worker, App wrapper and metered provider fixtures
// offline when Deno is unavailable. All paid transports and persistence are fakes.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const tests = [], modules = new Map();
const noNetwork = () => { throw new Error('Unexpected network access in offline regression'); };
function load(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = name => {
    if (name.startsWith('node:')) return nodeRequire(name);
    if (name.startsWith('.')) return load(resolve(dirname(file), name));
    // App publication imports esbuild but these tests never compile/deploy.
    if (name === 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.27.1/esm/browser.min.js') {
      return { initialize: noNetwork, build: noNetwork };
    }
    throw new Error(`Unexpected external dependency in offline regression: ${name}`);
  };
  new Function('exports', 'require', 'Deno', 'fetch', source)(exports, require,
    { test: (name, run) => tests.push({ name, run }) }, noNetwork);
  return exports;
}
for (const file of ['cloudRunEngine_test.ts', 'cloudRunWorker_test.ts', 'cloudApp_test.ts', 'durableArcProvider_test.ts', 'chatArtifactStream_test.ts']) {
  load(`supabase/functions/_shared/${file}`);
}
let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack || error}`); }
}
console.log(`${tests.length - failed}/${tests.length} durable regression groups passed; all provider and database calls mocked.`);
process.exitCode = failed ? 1 : 0;
