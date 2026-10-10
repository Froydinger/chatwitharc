import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';
const result = await build({ entryPoints: ['src/store/useModelStore.ts'], bundle: true, write: false, format: 'esm', define: { 'import.meta.env': '{}' } });
const { resolveReasoningEffort, getModelDisplayName, getModelRoute, useModelStore } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for (const [complexity, expected] of [[0, 'none'], [1, 'low'], [2, 'medium'], [3, 'high']]) {
  assert.equal(resolveReasoningEffort('auto', complexity, false), expected);
  assert.equal(resolveReasoningEffort('gpt-6-luna', complexity, true), expected);
}
for (const legacy of ['medium', 'high', 'flynn']) assert.equal(resolveReasoningEffort(legacy, 0, false), 'none');
assert.equal(getModelDisplayName('auto'), 'Auto');
assert.equal(getModelDisplayName('gpt-6-luna'), 'GPT 6 Luna');
assert.equal(getModelDisplayName('gpt-6.1-sol'), 'GPT 6.1 Sol');
assert.equal(getModelDisplayName('gpt-6-astra'), 'GPT 6 Astra');
assert.equal(getModelRoute('auto', 'code', 2).model, 'gpt-6.1-sol');
assert.equal(getModelRoute('gpt-6.1-sol', 'chat', 3).effort, 'low');
assert.throws(() => getModelRoute('gpt-6-astra', 'chat', 3), /Boost/);
useModelStore.getState().setIsAdmin(true);
assert.equal(getModelRoute('gpt-6-astra', 'code', 3).effort, 'medium');
useModelStore.getState().setIsAdmin(false);

const executionStoreBuild = await build({ entryPoints: ['src/store/useExecutionModelStore.ts'], bundle: true, write: false, format: 'esm' });
const { useExecutionModelStore, getExecutionModelChoices } = await import(`data:text/javascript;base64,${Buffer.from(executionStoreBuild.outputFiles[0].text).toString('base64')}`);
assert.deepEqual(getExecutionModelChoices('alice', true), { gitModelMode: 'normal', appModelMode: 'fast' });
useExecutionModelStore.getState().setOwnerId('alice');
useExecutionModelStore.getState().setGitModelMode('alice', 'pro', true);
useExecutionModelStore.getState().setAppModelMode('alice', 'pro', true);
assert.deepEqual(getExecutionModelChoices('alice', true), { gitModelMode: 'pro', appModelMode: 'pro' });
assert.deepEqual(getExecutionModelChoices('alice', false), { gitModelMode: 'normal', appModelMode: 'fast' });
useExecutionModelStore.getState().setGitModelMode('bob', 'normal', true);
assert.deepEqual(getExecutionModelChoices('alice', true), { gitModelMode: 'pro', appModelMode: 'pro' });
useExecutionModelStore.getState().setOwnerId('bob');
assert.deepEqual(getExecutionModelChoices('bob', true), { gitModelMode: 'normal', appModelMode: 'fast' });
useExecutionModelStore.getState().setAppModelMode('bob', 'pro', false);
assert.deepEqual(getExecutionModelChoices('bob', true), { gitModelMode: 'normal', appModelMode: 'fast' });
console.log('PASS model effort routing, execution-mode account isolation, entitlement fallback and GPT lineup labels');
