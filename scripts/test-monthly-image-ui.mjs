import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
// Start an isolated headless Chrome with --remote-debugging-port=9237, and Vite on 5174.
const targets=await (await fetch('http://127.0.0.1:9237/json/list')).json();
const ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let sequence=0;const pending=new Map(),listeners=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else listeners.get(m.method)?.(m.params);});
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(fn,...args)=>{const r=await cdp('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;};
const poll=async(fn)=>{const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(fn))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+fn+'; '+await evaluate(()=>document.body.innerText));};
const page={on:(name,fn)=>{if(name==='pageerror')listeners.set('Runtime.exceptionThrown',e=>fn({message:e.exceptionDetails.exception?.description||e.exceptionDetails.text}));if(name==='request')listeners.set('Fetch.requestPaused',async e=>{const respond=async x=>cdp('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:x.status,responseHeaders:Object.entries({...x.headers,'content-type':x.contentType||'application/json'}).map(([name,value])=>({name,value})),body:Buffer.from(x.body||'').toString('base64')});try{await fn({url:()=>e.request.url,method:()=>e.request.method,postData:()=>e.request.postData,continue:()=>cdp('Fetch.continueRequest',{requestId:e.requestId}),respond});}catch(err){console.error(err);await respond({status:500,body:'{}'});}});},setRequestInterception:()=>cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]}),evaluate,evaluateOnNewDocument:(fn,...args)=>cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`}),setViewport:({width,height})=>cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}),goto:async url=>{await cdp('Page.navigate',{url});await poll(()=>document.readyState==='complete');},reload:()=>cdp('Page.reload'),waitForFunction:poll,waitForSelector:sel=>poll(new Function(`return !!document.querySelector(${JSON.stringify(sel)})`)),$eval:(sel,fn)=>evaluate(new Function(`return (${fn.toString()})(document.querySelector(${JSON.stringify(sel)}))`)),screenshot:async({path})=>{const {data}=await cdp('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(path,Buffer.from(data,'base64'));},$:async sel=>({type:async value=>evaluate((s,v)=>{const el=document.querySelector(s);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));},sel,value)})};
await cdp('Runtime.enable');await cdp('Page.enable');
const user='10000000-0000-4000-8000-000000000001',calls=[];
let tier='boost',enabled=true,claimed=false,lite=true,transition='immediate';
const policy={id:true,free_limit:30,boost_limit:250,free_refill_enabled:true,boost_refill_enabled:true,builder_daily_limit:50,builder_run_limit:10,builder_pro_daily_limit:5,builder_pro_run_limit:3};
const snapshot=()=>({tier,liteAvailable:lite,unlimitedReason:tier==='boost'&&transition!=='immediate'?transition:null,grandfatheredUntil:transition==='grandfather'?'2026-11-01T00:00:00Z':null,isAdmin:tier==='admin',isBoost:tier==='boost',unlimited:tier==='admin'||(tier==='boost'&&transition!=='immediate'),used:0,remaining:tier==='admin'?null:tier==='free'?30:250,limit:tier==='admin'?null:tier==='free'?30:250,baseRemaining:tier==='free'?30:250,bonusRemaining:0,usage_percent:0,resetAt:'2026-11-01T00:00:00Z',refillEnabled:enabled,canRefill:enabled&&!claimed,refillOffers:[]});
const dashboard=()=>({transition:{capturedAt:null,counts:{valid:2,missing:1,expired:1},dateExceptions:[{user_id:user,date_status:'missing'}]},policy:{...policy,transition_mode:transition,lite_available:lite},offers:[],usage:[],balances:[],claims:[],audit:[]});

const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setRequestInterception(true);
page.on('request',async req=>{
 const url=new URL(req.url());if(url.hostname==='127.0.0.1'||url.protocol==='data:'||url.protocol==='blob:')return req.continue();
 const headers={'access-control-allow-origin':'http://127.0.0.1:5174','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'};
 if(req.method()==='OPTIONS')return req.respond({status:204,headers});
 let data=null;
 if(url.hostname==='fixture.supabase.co'){
 const name=url.pathname.split('/').at(-1),body=JSON.parse(req.postData()||'{}');calls.push({name,body});
 if(name==='user')data={id:user,email:'fixture@example.test',app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated'};
 else if(name==='profiles')data={user_id:user,display_name:'Fixture',welcome_email_sent:true};
 else if(name==='is_admin_user')data=tier==='admin';
 else if(name==='user_has_boost')data=tier!=='free';
 else if(name==='get_my_arc_image_credits')data=snapshot();
 else if(name==='claim_arc_image_refill'){claimed=true;data=snapshot();}
 else if(name==='get_arc_flash_usage_today')data={usage_percent:0};
 else if(name==='count_voice_sessions_today')data=0;
 else if(name==='subscriptions')data=[];
 else if(name==='admin_arc_images'){
 if(body.action==='dashboard')data=dashboard();
 else if(body.action==='preview')data={id:'20000000-0000-4000-8000-000000000001',payload:body.payload,preview:{affectedUsers:2,credits:60,estimatedOutputEnvelopeUSD:.81,exposure:'Output estimate only',unusedBaseForfeited:20,audience:'Snapshot at preview'}};
 else if(body.action==='confirm')data={applied_at:new Date().toISOString()};
 }
 }
 await req.respond({status:200,contentType:'application/json',headers,body:JSON.stringify(data)});
});
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
await page.evaluateOnNewDocument((session)=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(session)),{access_token:`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})}.fixture`,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:user,email:'fixture@example.test',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}});
const text=()=>page.evaluate(()=>document.body.innerText);
async function button(label){const ok=await evaluate(l=>{const el=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===l);if(!el)return false;el.click();return true;},label);if(!ok)throw Error('Missing button '+label+'; '+await text());}
mkdirSync('docs/qa/image-policy',{recursive:true});
try{
 for(const width of [412,1280]){
 await page.setViewport({width,height:980});tier='boost';claimed=false;enabled=true;
 await page.goto('http://127.0.0.1:5174/image-policy-qa.html');await page.waitForFunction(()=>document.body.innerText.includes('250 credits remaining'));
 assert((await text()).includes('Nano Banana 2 Lite'));await button('Nano Banana 2 Lite');assert.equal(await page.$eval('[aria-pressed="true"]',x=>x.textContent.trim()),'Nano Banana 2 Lite');
 await page.screenshot({path:`docs/qa/image-policy/picker-${width}.png`,fullPage:true});await page.goto('http://127.0.0.1:5174/image-policy-qa.html?dashboard');await page.waitForFunction(()=>document.body.innerText.includes('250 base credits'));
 await button('Refill monthly allowance');await page.waitForSelector('[role="alertdialog"]');assert((await text()).includes('Unused base usage is forfeited'));await button('Refill');await page.waitForFunction(()=>document.body.innerText.includes('Monthly refill used'));
 enabled=false;await page.evaluate(()=>window.dispatchEvent(new Event('arc-image-quota-changed')));await page.waitForFunction(()=>!document.body.innerText.includes('Monthly refill used'));
 await page.screenshot({path:`docs/qa/image-policy/boost-${width}.png`,fullPage:true});
 await page.goto('http://127.0.0.1:5174/image-policy-qa.html');await page.waitForFunction(()=>document.body.innerText.includes('250 credits remaining'));lite=false;await page.evaluate(()=>window.dispatchEvent(new Event('arc-image-quota-changed')));await page.waitForFunction(()=>!document.body.innerText.includes('Nano Banana 2 Lite'));assert.equal(await page.$eval('[aria-pressed="true"]',x=>x.textContent.trim()),'GPT 2.5 Flare');
 transition='staged';await page.reload();await page.waitForFunction(()=>document.body.innerText.includes('Unlimited images'));assert(!(await text()).includes('transition is staged'));await page.goto('http://127.0.0.1:5174/image-policy-qa.html?dashboard');await page.waitForFunction(()=>document.body.innerText.includes('while the transition is staged'));assert(!(await text()).includes('Refill monthly allowance'));
 transition='grandfather';await page.reload();await page.waitForFunction(()=>document.body.innerText.includes('Then 250 monthly credits apply'));assert(!(await text()).includes('Refill monthly allowance'));await page.screenshot({path:`docs/qa/image-policy/grandfather-${width}.png`,fullPage:true});
 transition='immediate';lite=true;
 tier='free';claimed=false;enabled=true;await page.goto('http://127.0.0.1:5174/image-policy-qa.html');await page.waitForFunction(()=>document.body.innerText.includes('30 images remaining'));
 assert((await text()).includes('Nano Banana 2 Lite'));assert((await text()).includes('GPT 2.5 Flare'));await page.evaluate(()=>window.addEventListener('open-upgrade-modal',e=>{window.fixtureUpgrade=e.detail;},{once:true}));await button('Nano Banana 2 Lite');assert((await page.evaluate(()=>window.fixtureUpgrade.reason)).includes('Nano Banana 2 Lite'));assert.equal(await page.$eval('[aria-pressed="true"]',x=>x.textContent.trim()),'GPT 2.5 Flare');await page.screenshot({path:`docs/qa/image-policy/free-${width}.png`,fullPage:true});
 tier='admin';await page.goto('http://127.0.0.1:5174/image-policy-qa.html?admin');await page.waitForFunction(()=>document.body.innerText.includes('Images & offers'));
 assert((await text()).includes('Unlimited images for admins'));
 const reason=await page.$('input[placeholder="Update, holiday, or support reason"]');await reason.type('Fixture test');
 await button('Preview base reset');await page.waitForSelector('[role="alertdialog"]');assert((await text()).includes('2 current accounts affected'));
 await button('Apply confirmed action');await page.waitForFunction(()=>!document.querySelector('[role="alertdialog"]'));
 await button('Review setting changes');await page.waitForSelector('[role="alertdialog"]');const preview=calls.filter(x=>x.name==='admin_arc_images'&&x.body.action==='preview').at(-1);assert(!('transition_mode'in preview.body.payload)&&!('lite_available'in preview.body.payload)&&!('id'in preview.body.payload)&&!('free_limit'in preview.body.payload),'Settings contain only allowed fields');await button('Cancel');
 await page.screenshot({path:`docs/qa/image-policy/admin-${width}.png`,fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal page overflow');
 }
 for(const [editTier,editMode,expected,quality] of [['free','pro','gpt-image-2.5-flare','low'],['boost','image','gpt-image-2.5-flare','medium'],['boost','pro','gpt-image-2.5-sunburst','high']]) {
 tier=editTier;transition='immediate';lite=true;await page.goto(`http://127.0.0.1:5174/image-policy-qa.html?edit&mode=${editMode}`);await page.waitForSelector('textarea');await page.waitForFunction(()=>!document.body.innerText.includes('Loading image allowance'));
 await page.evaluate(()=>{const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Make the background blue');el.dispatchEvent(new Event('input',{bubbles:true}));});await button('Edit Image');await page.waitForFunction(()=>!!window.fixtureEditRequest);
 const detail=await page.evaluate(()=>window.fixtureEditRequest);assert.equal(detail.imageModel,expected);assert.equal(detail.quality,quality,'Modal captures selected quality; server forces GPT 2.5 Sunburst');
 }
 assert.equal(calls.filter(x=>x.name==='claim_arc_image_refill').length,2,'One refill POST per confirmed click');assert.equal(errors.length,0,errors.join('\n'));
 console.log('Desktop/mobile browser fixtures passed: tier picker, Lite selection, balances, refill confirmation/claim, disable hiding, admin preview/confirm/settings and layout. Staged/grandfather notices and disabled Lite fallback passed. No live provider calls.');
}catch(e){console.error(errors);throw e;}finally{ws.close();}
