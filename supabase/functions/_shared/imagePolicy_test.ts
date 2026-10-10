import { imageModelName } from '../../../src/lib/imageModelNames.ts';
import { assertImageModelReady, imageConfiguration, imageIdentityConfiguration, imageRequestIdentity, isGoogleImage, ImageModelUnavailableError } from './imagePolicy.ts';
import { callImageFlash, ARC_IMAGE_LITE_MODEL } from './arcImageFlash.ts';
function assert(v: unknown, message='Assertion failed'): asserts v { if(!v)throw new Error(message); }
Deno.test('image policy makes Free low, validates model, preserves explicit Boost settings',()=>{
 assert(imageConfiguration(undefined,'high','free','1024x1024').quality==='low');
 for(const model of ['gpt-image-2.5-sunburst','gemini-3.1-flash-image','gemini-3.1-flash-lite-image']){
 let denied=false;try{imageConfiguration(model,'low','free','1024x1024');}catch{denied=true;}assert(denied);
 }
 assert(imageConfiguration('gpt-image-2.5-flare','low','boost','1024x1024').quality==='low');
 assert(imageConfiguration('gpt-image-2.5-flare',undefined,'boost','1024x1024').quality==='medium');
 assert(imageConfiguration('gpt-image-2.5-sunburst','low','boost','1024x1024').quality==='high');
 assert(isGoogleImage(ARC_IMAGE_LITE_MODEL));
 assert(imageConfiguration('gpt-image-2.5-flare','medium','boost','1536x1024').size==='1536x1024');
});
Deno.test('request identity is stable, conflict-sensitive, and rejects forged keys',async()=>{
 const key=crypto.randomUUID(), a=await imageRequestIdentity(key,{prompt:'a'}),b=await imageRequestIdentity(key,{prompt:'a'}),c=await imageRequestIdentity(key,{prompt:'b'});
 assert(a.key===key&&a.hash===b.hash&&a.hash!==c.hash);let denied=false;try{await imageRequestIdentity('bad',{});}catch{denied=true;}assert(denied);
});
Deno.test('dormant Lite adapter remains reusable with native1K and no implicit fallback/retry',async()=>{
 let calls=0;
 const r=await callImageFlash({model:ARC_IMAGE_LITE_MODEL,apiKey:'fixture-key',prompt:'image',count:1,aspect:'3:2',fetchImpl:async(_,init)=>{
 calls++;const b=JSON.parse(String(init?.body));assert(b.model===ARC_IMAGE_LITE_MODEL&&b.response_format.image_size==='1K'&&b.store===false);
 return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'image',mime_type:'image/jpeg',data:btoa('bytes')}]}]});
 }});assert(r.ok&&calls===1);
});

Deno.test('only shipped legacy IDs alias to Flare HQ after verified Boost/admin tier',()=>{
 for (const model of ['gemini-3.1-flash-image', ARC_IMAGE_LITE_MODEL]) {
  for (const tier of ['free', 'unknown', 'BOOST', undefined]) {
   let denied=false;
   try { imageConfiguration(model,'native',tier as string,'1024x1024'); } catch (error) {
    denied=error instanceof ImageModelUnavailableError && error.message.includes('no longer available');
   }
   assert(denied);
  }
  let denied=false;try{assertImageModelReady(model);}catch(error){denied=error instanceof ImageModelUnavailableError;}assert(denied);
  for (const tier of ['boost', 'admin']) {
   for (const quality of ['low', 'medium', 'high', 'native', undefined]) {
    for (const size of ['1024x1024', '1536x1024', '1024x1536', '1536x864', 'auto']) {
     const config=imageConfiguration(model,quality,tier,size);
     assert(config.model==='gpt-image-2.5-flare'&&config.quality==='medium'&&config.size===size);
    }
   }
  }
 }
 for (const model of ['gemini-3.1-flash-image-preview','gemini-3.1-flash-lite-image-extra','gemini-3.8-flash']) {
  let denied=false;try{imageConfiguration(model,'native','admin','1024x1024');}catch(error){denied=error instanceof ImageModelUnavailableError;}assert(denied);
 }
 assertImageModelReady('gpt-image-2.5-flare');
 assertImageModelReady('gpt-image-2.5-sunburst');
});

Deno.test('compatibility hashes retain the original request while GPT configurations stay unchanged',async()=>{
 for (const model of ['gemini-3.1-flash-image', ARC_IMAGE_LITE_MODEL]) {
  const actual=imageConfiguration(model,'low','boost','1536x1024');
  const identityConfig=imageIdentityConfiguration(model,actual);
  assert(JSON.stringify(identityConfig)===JSON.stringify({model,quality:'native',size:'1K'}));
  const key=crypto.randomUUID();
  const original=await imageRequestIdentity(key,{rawPrompt:'tree',aspectRatio:'3:2',config:{model,quality:'native',size:'1K'},count:2});
  const compatibility=await imageRequestIdentity(key,{rawPrompt:'tree',aspectRatio:'3:2',config:identityConfig,count:2});
  assert(original.hash===compatibility.hash&&original.key===compatibility.key);
  assert(actual.model==='gpt-image-2.5-flare'&&actual.quality==='medium'&&actual.size==='1536x1024');
 }
 const actual=imageConfiguration('gpt-image-2.5-flare','low','free','1024x1024');
 assert(imageIdentityConfiguration('gpt-image-2.5-flare',actual)===actual);
});

Deno.test('recorded image model labels distinguish Lite from full Nano and retire image branding',()=>{
 assert(imageModelName('gemini-3.1-flash-lite-image')==='Nano Banana 2 Lite');
 assert(imageModelName('gemini-3.1-flash-image')==='Nano Banana 2');
 assert(imageModelName('gpt-image-2.5-flare')==='GPT 2.5 Flare');
 assert(imageModelName('gpt-image-2.5-flare','medium')==='GPT 2.5 Flare HQ');
 assert(imageModelName('gpt-image-2.5-sunburst')==='GPT 2.5 Sunburst');
 assert(imageModelName(undefined)==='Image generation');
});
