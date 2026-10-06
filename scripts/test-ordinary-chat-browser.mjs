import assert from 'node:assert/strict';
const wsFactory=async url=>{
 const ws=new WebSocket(url);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 return {call,close:()=>ws.close()};
};
const chrome=await wsFactory((await(await fetch('http://127.0.0.1:9237/json/version')).json()).webSocketDebuggerUrl);
const contexts=[];
const owner='10000000-0000-4000-8000-000000000001';
async function page(user=owner){
 const {browserContextId}=await chrome.call('Target.createBrowserContext');contexts.push(browserContextId);
 const {targetId}=await chrome.call('Target.createTarget',{url:'about:blank',browserContextId});
 const target=(await(await fetch('http://127.0.0.1:9237/json/list')).json()).find(x=>x.id===targetId);
 const c=await wsFactory(target.webSocketDebuggerUrl);await c.call('Runtime.enable');await c.call('Page.enable');
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const session={access_token:`${b64({alg:'HS256'})}.${b64({sub:user,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})}.fixture`,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:user,email:'fixture@example.test',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}};
 await c.call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});window.fixtureAccepted=false;window.addEventListener('ordinary-chat-accepted',()=>{window.fixtureAccepted=true;window.fixtureAcceptedAt=performance.now();});`});
 const evalPage=async expression=>{const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{const end=Date.now()+20000;while(Date.now()<end){if(await evalPage(expression))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out '+expression+' '+await evalPage('document.body?.innerText'));};
 await c.call('Page.navigate',{url:`http://127.0.0.1:5174/ordinary-chat-qa.html?owner=${user}`});await c.call('Page.bringToFront');await wait('!!document.querySelector("button")');
 return {evalPage,wait,c,targetId};
}
try{
 await fetch('http://127.0.0.1:5440/fixture-reset',{method:'POST'});
 const a=await page();await new Promise(r=>setTimeout(r,150));
 await a.evalPage('[...document.querySelectorAll("button")].find(x=>x.textContent==="Send").click()');await a.wait('window.fixtureAccepted');
 await chrome.call('Target.closeTarget',{targetId:a.targetId});a.c.close();
 const b=await page();await b.wait('document.querySelectorAll("[data-role=assistant]").length===1');
 assert.equal(await b.evalPage('document.querySelector("[data-role=assistant]").textContent'),'Ordinary reply');
 const firstMetrics=await(await fetch('http://127.0.0.1:5440/fixture-metrics')).json();assert.equal(firstMetrics.executions,1,'closing browser does not restart generation');
 assert.equal(await b.evalPage('document.querySelectorAll("[data-role=user]").length'),1,'accepted input recovered on another isolated browser');
 await b.evalPage('[...document.querySelectorAll("button")].find(x=>x.textContent==="Send").click()');await b.wait('document.body.innerText.includes("Complete")');
 const timing=await b.evalPage('({acceptance:window.fixtureAcceptedAt-window.fixtureSendStarted,firstToken:window.fixtureFirstTokenAt-window.fixtureSendStarted})');
 assert(timing.acceptance < timing.firstToken,'accept before profile and first token');
 console.log('Local fixture timing (not production):',timing);
 await new Promise(r=>setTimeout(r,1700));
 assert.equal(await b.evalPage('document.querySelectorAll("[data-role=assistant]").length'),2,'connected save plus recovery must not duplicate');
 const outsider=await page('90000000-0000-4000-8000-000000000009');await new Promise(r=>setTimeout(r,300));
 assert.equal(await outsider.evalPage('document.querySelectorAll("[data-role=assistant]").length'),0,'other owner does not recover these replies');
 await b.c.call('Page.bringToFront');await b.evalPage('window.fixtureAccepted=false;[...document.querySelectorAll("button")].find(x=>x.textContent==="Send").click()');await b.wait('window.fixtureAccepted');
 await b.evalPage('[...document.querySelectorAll("button")].find(x=>x.textContent==="Stop").click()');await new Promise(r=>setTimeout(r,2000));
 assert.equal(await b.evalPage('document.querySelectorAll("[data-role=assistant]").length'),2,'explicit Stop prevents recovery of a late answer');
 const metrics=await(await fetch('http://127.0.0.1:5440/fixture-metrics')).json();assert.equal(metrics.jobs.filter(x=>x.status==='cancelled').length,1);

 // A failed edit is stored locally, delivered after reload, then honored by another browser.
 await b.evalPage('window.fixtureAccepted=false;[...document.querySelectorAll("button")].find(x=>x.textContent==="Send").click()');await b.wait('window.fixtureAccepted');
 await fetch('http://127.0.0.1:5440/fixture-fail-invalidation',{method:'POST'});
 await b.evalPage('[...document.querySelectorAll("button")].find(x=>x.textContent==="Edit last input").click()');
 await b.wait('Object.keys(localStorage).filter(k=>k.startsWith("arc-chat-invalidation-v1:")).length===1');
 await b.c.call('Page.reload');await b.wait('Object.keys(localStorage).filter(k=>k.startsWith("arc-chat-invalidation-v1:")).length===0');
 await new Promise(r=>setTimeout(r,1500));
 const afterEdit=await(await fetch('http://127.0.0.1:5440/fixture-metrics')).json();
 const invalidated=afterEdit.jobs.find(j=>j.invalidated_at);assert(invalidated,'reload retries the durable edit');
 assert.equal(invalidated.assistant_message,null,'invalidated in-flight result cannot publish');
 const another=await page();await new Promise(r=>setTimeout(r,400));
 assert.equal(await another.evalPage(`!!document.querySelector('[data-id="${invalidated.submission_id}"]')`),false,'another browser does not recover edited-away output');another.c.close();
 console.log('PASS: edit invalidation survives failed RPC and reload; late output fenced across browsers.');
 console.log('PASS: actual AIService/store/recovery hook across isolated browser contexts; immediate acceptance, closed-page completion, same reply recovery, deduplication, owner isolation, explicit Stop. Local fake provider only.');

 const legacy=await page('70000000-0000-4000-8000-000000000007');await new Promise(r=>setTimeout(r,150));
 await legacy.evalPage('[...document.querySelectorAll("button")].find(x=>x.textContent==="Send").click()');
 await legacy.wait('document.body.innerText.includes("Complete")');
 assert.equal(await legacy.evalPage('document.querySelectorAll("[data-role=assistant]").length'),1,'disabled rollout retains successful legacy signed-in chat');
 assert.equal(await legacy.evalPage('window.fixtureAccepted'),false,'legacy path has no cloud acceptance UI');legacy.c.close();
 console.log('PASS: rollout-disabled ordinary signed-in chat completes on unchanged legacy path.');
 b.c.close();outsider.c.close();
}finally{for(const id of contexts)await chrome.call('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});chrome.close();}
