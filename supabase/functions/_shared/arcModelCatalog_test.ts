import { equal, deepStrictEqual, throws } from 'node:assert/strict';
import { ARC_TEXT_MODELS, arcTextAccess, normalizeArcTextSelection, arcModelContext, normalizeArcChatMode, arcResponseMode, arcImageCreditCost, arcUsageLabel, arcUsagePercent } from './arcModelCatalog.ts';
Deno.test('catalog preserves saved selections and expresses the latest free/Boost rules', () => {
  equal(normalizeArcTextSelection('high'), 'gpt-6.1-sol');
  equal(normalizeArcTextSelection('flynn'), 'gemini-3.8-flash');
  for (const old of ['low','medium','ava','maya','flash','retired']) equal(normalizeArcTextSelection(old),'gpt-6-luna');
  for (const model of ARC_TEXT_MODELS) {
    equal(normalizeArcTextSelection(model.id),model.id);
    deepStrictEqual(arcTextAccess(model.id,true),{kind:'included'});
    if (model.boostOnly) deepStrictEqual(arcTextAccess(model.id,false),{kind:'boost-required'});
  }
  deepStrictEqual(arcTextAccess('gemini-3.8-flash',false),{kind:'daily-limit',limit:20});
  deepStrictEqual(arcTextAccess('gpt-6-luna',false),{kind:'included'});
  deepStrictEqual(arcTextAccess('forged-provider',true),{kind:'unavailable'});
});
Deno.test('model context reports configured availability, actual selection and plan without advertising pending paths', () => {
  const options = {selectedModel:'gpt-6-luna',hasBoost:false,availableTextModels:['gpt-6-luna','gemini-3.8-flash'],availableImageModels:['gpt-image-2.5-flare'],voiceModel:'gpt-live-1'};
  const context=arcModelContext(options);
  equal(context.includes('20 free messages per UTC day'),true);
  equal(context.includes('GPT Live 1'),true);
  equal(context.includes('GPT 6 Astra'),false);
  equal(context.includes('Nano Banana 2'),false);
  equal(context.includes('selected for this request is GPT 6 Luna'),true);
  throws(()=>arcModelContext({...options,selectedModel:'gpt-6-astra'}),/not available/);
  const boost=arcModelContext({...options,hasBoost:true,availableTextModels:ARC_TEXT_MODELS.map(m=>m.id),availableImageModels:['gemini-3.1-flash-image']});
  equal(boost.includes('Arc Think'),true);
  equal(boost.includes('Arc Flash'),true);
  equal(boost.includes('Nano Banana 2 (2 credits per image)'),true);
  equal(boost.includes('Account plan: Boost'),true);
});

Deno.test('two-mode product migration keeps Flash choices and defaults all GPT preferences to Auto Think', () => {
  for (const old of ['auto','low','medium','high','gpt-6-sol','gpt-6.1-sol','unknown']) equal(normalizeArcChatMode(old),'think');
  for (const flash of ['flash','flynn','gemini-3.8-flash']) equal(normalizeArcChatMode(flash),'flash');
  equal(arcResponseMode('gemini-3.8-flash'),'flash');
  equal(arcResponseMode('gpt-6.1-sol'),'think');
});

Deno.test('shared image credits price mixed models and batches without rounding or invalid model fallback', () => {
  equal(arcImageCreditCost('gpt-image-2.5-flare',1),1);
  equal(arcImageCreditCost('gpt-image-2.5-sunburst',3),3);
  equal(arcImageCreditCost('gemini-3.1-flash-image',1),2);
  equal(arcImageCreditCost('gemini-3.1-flash-image',3),6);
  for (const count of [0,-1,1.5,4,NaN]) throws(()=>arcImageCreditCost('gpt-image-2.5-flare',count),/Invalid/);
  throws(()=>arcImageCreditCost('forged-provider',1),/Invalid/);
});

Deno.test('public usage copy omits quota counts and percentage meters clamp safely', () => {
  equal(arcUsageLabel(false),'Less usage'); equal(arcUsageLabel(true),'Unlimited usage');
  equal(arcUsagePercent(5,20),25); equal(arcUsagePercent(2,8),25);
  equal(arcUsagePercent(-1,20),0); equal(arcUsagePercent(25,20),100);
  for (const limit of [0,-1,NaN,Infinity]) throws(()=>arcUsagePercent(1,limit),/Invalid/);
});
