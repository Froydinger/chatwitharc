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
  for (const width of [412,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await setDraft('');
    await evaluate('document.querySelector(".ci-menu-btn").click()');
    await wait(300);
    const bounds = await evaluate('(()=>{const m=document.querySelector(`[data-testid="composer-create-menu"] .arc-transition-part`);const r=m.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,count:m.querySelectorAll("button").length,animation:getComputedStyle(m).animationName};})()');
    assert.ok(bounds.x>=0 && bounds.right<=width && bounds.y>=0 && bounds.bottom<=915,'Menu geometry stays inside viewport');
    assert.equal(bounds.count,9,'All existing actions retained');
    assert.equal(bounds.animation,'arc-modal-in');
    await evaluate('document.querySelector(".ci-menu-btn").click()');
    assert.equal(await evaluate('document.querySelector(`[data-testid="composer-create-menu"]`)?.dataset.motionState'),'closed');
    assert.equal(await evaluate('document.querySelector(`[data-testid="composer-create-menu"]`)?.hasAttribute("inert")'),true);
    await wait(20);
    await evaluate('document.querySelector(".ci-menu-btn").click()');
    await wait(300);
    assert.equal(await evaluate('document.querySelectorAll(`[data-testid="composer-create-menu"]`).length'),1,'Rapid reopen retains one menu');
    await evaluate('[...document.querySelectorAll(`[data-testid="composer-create-menu"] button`)].find(b=>b.textContent.trim()==="Writing Canvas").click()');
    await wait(250);
    assert.equal(await evaluate('!!document.querySelector(`[data-testid="composer-create-menu"]`)'),false);
    assert.equal(await evaluate('document.querySelector("textarea[data-arc-composer]").value'),'write/ ');
    assert.equal(await evaluate('document.activeElement.matches("textarea[data-arc-composer]")'),true,'Action returns focus to draft');
    await setDraft('');
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate('document.querySelector(".ci-menu-btn").click()');
    await wait(30);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(`[data-testid="composer-create-menu"] .arc-transition-part`)).animationName'),'none');
    await evaluate('document.querySelector(".ci-tiles.bg-transparent").click()');
    await wait(30);
    assert.equal(await evaluate('!!document.querySelector(`[data-testid="composer-create-menu"]`)'),false,'Backdrop dismissal settles immediately with reduced motion');
    await call('Emulation.setEmulatedMedia',{features:[]});
  }
  console.log('Composer create menu passed: actual controls at 412/1280px, viewport bounds, nine actions, interrupted exits, inert closing, draft/focus and reduced motion.');
} finally { await call('Emulation.setEmulatedMedia',{features:[]}); ws.close(); }
