import { imageConfiguration, imageRequestIdentity, isGoogleImage } from './imagePolicy.ts';
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
 assert(isGoogleImage(ARC_IMAGE_LITE_MODEL));assert(imageConfiguration(ARC_IMAGE_LITE_MODEL,'high','boost','1536x1024').size==='1K');
});
Deno.test('request identity is stable, conflict-sensitive, and rejects forged keys',async()=>{
 const key=crypto.randomUUID(), a=await imageRequestIdentity(key,{prompt:'a'}),b=await imageRequestIdentity(key,{prompt:'a'}),c=await imageRequestIdentity(key,{prompt:'b'});
 assert(a.key===key&&a.hash===b.hash&&a.hash!==c.hash);let denied=false;try{await imageRequestIdentity('bad',{});}catch{denied=true;}assert(denied);
});
Deno.test('Lite uses explicit supported model with native1K and no implicit fallback/retry',async()=>{
 let calls=0;
 const r=await callImageFlash({model:ARC_IMAGE_LITE_MODEL,apiKey:'fixture-key',prompt:'image',count:1,aspect:'3:2',fetchImpl:async(_,init)=>{
 calls++;const b=JSON.parse(String(init?.body));assert(b.model===ARC_IMAGE_LITE_MODEL&&b.response_format.image_size==='1K'&&b.store===false);
 return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'image',mime_type:'image/jpeg',data:btoa('bytes')}]}]});
 }});assert(r.ok&&calls===1);
});
