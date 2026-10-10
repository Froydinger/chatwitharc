import { equal, deepStrictEqual, throws } from 'node:assert/strict';
import { ARC_TEXT_MODELS, arcTextAccess, normalizeArcTextSelection, arcModelContext, normalizeArcChatMode, arcResponseMode, arcImageCreditCost, arcUsageLabel, arcUsagePercent } from './arcModelCatalog.ts';
Deno.test('catalog exposes the three GPT models without restoring a retired provider', () => {
  deepStrictEqual(ARC_TEXT_MODELS.map(model => model.id), ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']);
  for (const old of ['low', 'medium', 'high', 'flynn', 'gemini-3.8-flash', 'retired']) equal(normalizeArcTextSelection(old), 'auto');
  for (const model of ARC_TEXT_MODELS) equal(normalizeArcTextSelection(model.id), model.id);
  for (const hasBoost of [false, true]) {
    deepStrictEqual(arcTextAccess('gpt-6-luna', hasBoost), { kind: 'included' });
    deepStrictEqual(arcTextAccess('gpt-6.1-sol', hasBoost), { kind: 'included' });
    deepStrictEqual(arcTextAccess('gpt-6-astra', hasBoost), { kind: hasBoost ? 'included' : 'boost-required' });
  }
  deepStrictEqual(arcTextAccess('gpt-6-astra', true, true), { kind: 'included' });
  deepStrictEqual(arcTextAccess('gemini-3.8-flash', true, true), { kind: 'unavailable' });
});
Deno.test('context uses real provider metadata and only authorized configured models', () => {
  const options = {selectedModel:'gpt-6-luna',hasBoost:false,availableTextModels:['gpt-6-luna','gpt-6.1-sol'],availableImageModels:['gpt-image-2.5-flare'],voiceModel:'gpt-live-1'};
  const context = arcModelContext(options);
  equal(context.includes('selected for this request is GPT 6 Luna'), true);
  equal(context.includes('GPT Live 1'), true);
  equal(context.includes('Nano Banana'), false);
  throws(() => arcModelContext({...options,selectedModel:'gpt-6-astra'}), /not available/);
  equal(arcModelContext({...options,selectedModel:'gpt-6-astra',hasBoost:true,availableTextModels:['gpt-6-astra']}).includes('selected for this request is GPT 6 Astra'), true);
  equal(arcModelContext({...options,selectedModel:'gpt-6-astra',isAdmin:true,availableTextModels:['gpt-6-astra']}).includes('selected for this request is GPT 6 Astra'), true);
});
Deno.test('new mode metadata is model-specific while retired selections migrate safely', () => {
  equal(normalizeArcChatMode('flynn'), 'auto');
  equal(arcResponseMode('gpt-6.1-sol'), 'gpt-6.1-sol');
  equal(arcResponseMode('gpt-6-astra'), 'gpt-6-astra');
});
Deno.test('square GPT display costs match existing image policy; retired requests fail', () => {
  equal(arcImageCreditCost('gpt-image-2.5-flare', 1), 1);
  equal(arcImageCreditCost('gpt-image-2.5-sunburst', 3), 12);
  for (const count of [0, -1, 1.5, 4, NaN]) throws(() => arcImageCreditCost('gpt-image-2.5-flare', count), /Invalid/);
  throws(() => arcImageCreditCost('gemini-3.1-flash-image', 1), /Invalid/);
});
Deno.test('percentage meters clamp without claiming blanket Boost unlimited usage', () => {
  equal(arcUsageLabel(false), 'Less usage'); equal(arcUsageLabel(true), 'More usage');
  equal(arcUsagePercent(5, 20), 25); equal(arcUsagePercent(-1, 20), 0); equal(arcUsagePercent(25, 20), 100);
  for (const limit of [0, -1, NaN, Infinity]) throws(() => arcUsagePercent(1, limit), /Invalid/);
});
