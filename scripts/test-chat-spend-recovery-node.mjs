// Offline Node adapter for the unchanged Deno unit suites. This does not claim
// Deno runtime parity or make service/provider calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const tests = [];
const cache = new Map();
let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork++; throw new Error('Network prohibited in recovery unit tests'); };
globalThis.Deno = { test: (name, run) => tests.push({ name, run }) };
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', compiled)(module, module.exports, name => {
    assert.ok(name.startsWith('./') || name.startsWith('../'), `Only local dependencies are allowed: ${name}`);
    return load(resolve(dirname(file), name));
  });
  return module.exports;
}
load('supabase/functions/_shared/arcChatSpendControlRecovery_test.ts');
load('supabase/functions/_shared/cloudAgentsProvider_test.ts');
let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
assert.equal(unexpectedNetwork, 0, 'provider I/O must stay mocked');
console.log(`${tests.length - failed}/${tests.length} unchanged recovery/provider tests passed through the offline Node adapter.`);
process.exitCode = failed ? 1 : 0;
