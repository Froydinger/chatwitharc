import assert from 'node:assert/strict';
const tabs = await (await fetch('http://localhost:9224/json/list')).json();
const tab = tabs.find(t => t.url.startsWith('http://127.0.0.1:5174/') && t.url.includes('preview=chat'));
assert.ok(tab, 'Use an isolated local preview browser; never production');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  const timer = setTimeout(() => reject(new Error('Local browser timeout')), 10000);
  pending.set(n, m => { clearTimeout(timer); if (m.error) reject(new Error(m.error.message)); else resolve(m.result); });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async expression => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!r.exceptionDetails, r.exceptionDetails?.exception?.description);
  return r.result?.value;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const setDraft = async text => {
  await evaluate(`(()=>{const t=document.querySelector('textarea[data-arc-composer]'); t.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(50);
};
try {
  await evaluate(`window.__arcImageQA?.dispose(); import('/src/dev/ImageModesQA.tsx').then(m=>{window.__arcImageQA=m.installImageModesQA();return true})`);
  await wait(150);
  for (const width of [412,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await evaluate(`document.querySelector('#arc-image-modes-qa button[aria-pressed]:last-child').click()`);
    assert.deepEqual(await evaluate('window.__arcImageQA.models()'),{generation:'gemini-3.1-flash-image',edit:'gemini-3.1-flash-image'});
    await evaluate(`document.querySelector('#arc-image-modes-qa button[aria-pressed]:first-child').click()`);
    assert.deepEqual(await evaluate('window.__arcImageQA.models()'),{generation:'gpt-image-2.5-flare',edit:'gpt-image-2.5-sunburst'});
    await evaluate(`Array.from(document.querySelectorAll('#arc-image-modes-qa button')).find(b=>b.textContent==='Open image usage').click()`);
    await wait(220);
    const card=await evaluate(`(()=>{const c=Array.from(document.querySelectorAll('.arc-transition-part')).find(c=>c.textContent.includes('Image usage'));const r=c.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom,text:c.textContent,animation:getComputedStyle(c).animationName}})()`);
    assert.ok(card.x>=0&&card.right<=width&&card.y>=0&&card.bottom<=915,'Usage card fits mobile and desktop');
    assert.ok(card.text.includes('25% used')&&card.text.includes('Less usage')&&card.text.includes('Nano Banana 2'));
    assert.ok(!/3 free|8 credits|3 images|20 messages/.test(card.text),'Exact free caps are not advertised');
    assert.equal(card.animation,'arc-modal-in');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Detailed Settings').click()`);
    assert.equal(await evaluate('window.__arcImageQA.calls.at(-1)'),'settings');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.arc-transition')).find(c=>c.textContent.includes('Image usage'))?.hasAttribute('inert')`),true);
    await wait(180);
    await evaluate(`Array.from(document.querySelectorAll('#arc-image-modes-qa button')).find(b=>b.textContent==='Open image usage').click()`);
    await wait(220);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Upgrade to Boost').click()`);
    assert.equal(await evaluate('window.__arcImageQA.calls.at(-1)'),'upgrade');
    await wait(180);
  }
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate(`Array.from(document.querySelectorAll('#arc-image-modes-qa button')).find(b=>b.textContent==='Open image usage').click()`);
  await wait(50);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.arc-transition-part')).filter(c=>c.textContent.includes('Image usage')).map(c=>getComputedStyle(c).animationName)[0]`),'none');
  await evaluate(`Array.from(document.querySelectorAll('.arc-transition-part')).find(c=>c.textContent.includes('Image usage')).querySelector('button[aria-label="Close"]').click()`);
  await wait(50);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.arc-transition-part')).some(c=>c.textContent.includes('Image usage'))`),false);
  console.log('Image UI browser checks passed: both real model selectors, source/edit routing, 412/1280 geometry, percentage copy, native animation, inert exit, settings/upgrade callbacks and reduced motion.');
} finally {
  await evaluate('window.__arcImageQA?.dispose()').catch(()=>{});
  await call('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});
  await call('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  ws.close();
}
