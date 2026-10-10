import { deepStrictEqual, equal, throws } from 'node:assert/strict';
import { ARC_LUNA, ARC_SOL, ARC_ASTRA, ArcModelAccessError, arcProviderEffort,
  arcRequestComplexity, arcRequestSelection, arcRequestTask, normalizeArcModelSelection,
  resolveArcModelRoute, legacyArcChatRoute } from './arcModelRouting.ts';

Deno.test('Auto routes real tasks and never treats requested effort as model authorization', () => {
  for (const hasBoost of [false, true]) {
    equal(resolveArcModelRoute({ selection: 'auto', task: 'chat', hasBoost }).model, ARC_LUNA);
    for (const task of ['write', 'code', 'search', 'file'] as const) {
      equal(resolveArcModelRoute({ selection: 'auto', task, hasBoost }).model, ARC_SOL);
    }
  }
  equal(arcRequestTask({ forceCanvas: true }), 'write');
  equal(arcRequestTask({ forceCode: true }), 'code');
  equal(arcRequestTask({ forceWebSearch: true }), 'search');
  for (const [content, task] of [['Hey, how are you?', 'chat'], ['Draft a short email', 'write'],
    ['Debug my app', 'code'], ['Search the web for the latest news', 'search'], ['Compare these trade-offs', 'analysis']]) {
    equal(arcRequestTask({ messages: [{ role: 'user', content }] }), task);
  }
  equal(arcRequestSelection({ modelSelection: ARC_LUNA, model: ARC_ASTRA, reasoningEffort: 'high' }), ARC_LUNA);
  equal(arcRequestSelection({ reasoningSelection: 'high', model: ARC_ASTRA }), 'auto');
  equal(arcRequestSelection({ model: ARC_ASTRA }), ARC_ASTRA);
});

Deno.test('explicit GPT ids persist, retired provider preferences migrate to Auto', () => {
  for (const model of [ARC_LUNA, ARC_SOL, ARC_ASTRA]) equal(normalizeArcModelSelection(model), model);
  for (const old of ['flynn', 'flash', 'think', 'gemini-3.8-flash', 'high', 'medium', 'none', 'gpt-6-sol', null, {}]) {
    equal(normalizeArcModelSelection(old), 'auto');
  }
});

Deno.test('legacy installed Chat requests preserve Luna effort without authorizing premium models', () => {
  for (const effort of ['none', 'low', 'medium', 'high'] as const) {
    const route = legacyArcChatRoute({ reasoningSelection: 'auto', reasoningEffort: effort, model: ARC_ASTRA });
    equal(route?.model, ARC_LUNA); equal(route?.effort, effort);
  }
  equal(legacyArcChatRoute({ reasoningSelection: 'flynn', reasoningEffort: 'high' })?.effort, 'low');
  equal(legacyArcChatRoute({ reasoningEffort: 'unsupported' })?.effort, 'medium');
  equal(legacyArcChatRoute({ reasoningEffort: 'high', collabChat: true })?.effort, 'low');
  for (const request of [{ modelSelection: 'auto' }, { modelSelection: null },
    { model: ARC_SOL }, { model: ARC_ASTRA }, { reasoningSelection: ARC_ASTRA },
    { reasoningSelection: ['low'] }, { reasoningSelection: { model: ARC_SOL } }]) {
    equal(legacyArcChatRoute(request), null);
  }
});

Deno.test('reasoning is model-specific and bounded at every complexity', () => {
  const luna = [], sol = [], astra = [];
  for (const complexity of [0, 1, 2, 3] as const) {
    luna.push(resolveArcModelRoute({ selection: ARC_LUNA, task: 'chat', complexity }).effort);
    sol.push(resolveArcModelRoute({ selection: ARC_SOL, task: 'write', complexity }).effort);
    astra.push(resolveArcModelRoute({ selection: ARC_ASTRA, task: 'analysis', complexity, isAdmin: true }).effort);
    equal(resolveArcModelRoute({ selection: ARC_SOL, task: 'chat', complexity }).effort, 'low');
    equal(resolveArcModelRoute({ selection: ARC_ASTRA, task: 'chat', complexity, isAdmin: true }).effort, 'low');
    equal(arcProviderEffort(ARC_ASTRA, 'high'), 'medium');
    equal(arcProviderEffort(ARC_SOL, 'none'), 'low');
  }
  deepStrictEqual(luna, ['none', 'low', 'medium', 'high']);
  deepStrictEqual(sol, ['low', 'medium', 'medium', 'high']);
  deepStrictEqual(astra, ['low', 'low', 'medium', 'medium']);
  equal(arcRequestComplexity({ prompt: 'Compare the alternatives' }), 2);
  equal(arcRequestComplexity({ prompt: 'x'.repeat(2001) }), 3);
});

Deno.test('Astra is available only to verified Boost or admin accounts', () => {
  throws(() => resolveArcModelRoute({ selection: ARC_ASTRA, task: 'chat', hasBoost: false, isAdmin: false }), ArcModelAccessError);
  equal(resolveArcModelRoute({ selection: ARC_ASTRA, task: 'chat', hasBoost: true, isAdmin: false }).model, ARC_ASTRA);
  equal(resolveArcModelRoute({ selection: ARC_ASTRA, task: 'chat', hasBoost: false, isAdmin: true }).model, ARC_ASTRA);
});

Deno.test('unflagged postfix code Git and builder aliases preserve code routing', () => {
  for (const prompt of ['code/ test', 'git/ status', 'app/ hello', 'build/ hello']) {
    equal(arcRequestTask({ prompt }), 'code');
  }
  equal(arcRequestTask({ prompt: '/codeword is text' }), 'chat');
});
