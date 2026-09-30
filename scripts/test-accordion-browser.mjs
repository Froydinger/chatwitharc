import assert from 'node:assert/strict';
const tab = (await (await fetch('http://localhost:9224/json/list')).json())
  .find(tab => tab.url.startsWith('http://127.0.0.1:5174/'));
assert.ok(tab, 'Isolated local QA Chrome must be running');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  pending.get(message.id)?.(message);
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(Error('Local browser timeout')); }, 10000);
  pending.set(next, message => {
    clearTimeout(timer); pending.delete(next);
    message.error ? reject(Error(message.error.message)) : resolve(message.result);
  });
  ws.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description || result.exceptionDetails?.text);
  return result.result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await evaluate('window.__arcAccordionQA?.dispose(); import("/src/dev/AccordionQA.tsx").then(m => { window.__arcAccordionQA = m.installAccordionQA(); return true; })');
  for (const width of [412, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', {width,height:915,deviceScaleFactor:1,mobile:width===412});
    assert.equal(await evaluate('window.innerWidth'),width);
    await evaluate('window.__arcAccordionQA.render("auth")'); await wait(300);
    await evaluate(`(() => { const input=document.querySelector('[role=dialog] input[name=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'fixture@example.invalid');input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await wait(30);
    await evaluate(`document.querySelector('[role=dialog] button[aria-controls][aria-expanded="true"]').click()`);
    await wait(40);
    assert.equal(await evaluate('document.querySelector("[role=dialog] .t-acc-panel-inner").inert'),true);
    await wait(300);
    assert.equal(await evaluate('document.querySelector("[role=dialog] .t-acc-panel").getBoundingClientRect().height'),0);
    assert.equal(await evaluate('!!document.querySelector("[role=dialog] input[name=email]")'),false);
    await evaluate(`document.querySelector('[role=dialog] button[aria-controls][aria-expanded="false"]').click()`);
    await wait(300);
    assert.equal(await evaluate('document.querySelector("[role=dialog] input[name=email]").value'),'fixture@example.invalid','Form values survive presentation unmount');
    await evaluate('window.__arcAccordionQA.render("docs")'); await wait(300);
    assert.equal(await evaluate('document.querySelector("#arc-accordion-qa .t-acc-panel-inner").childElementCount'),0);
    await evaluate(`document.querySelector('#arc-accordion-qa .t-acc button[aria-controls]').click()`);
    await wait(300);
    assert.ok(await evaluate('document.querySelector("#arc-accordion-qa .t-acc-panel").getBoundingClientRect().height > 0'));
    await evaluate(`window.__arcAccordionSpeed=document.documentElement.style.getPropertyValue('--motion-speed-scale');document.documentElement.style.setProperty('--motion-speed-scale','2');document.querySelector('#arc-accordion-qa .t-acc button[aria-controls]').click()`);
    await wait(300);
    assert.equal(await evaluate('document.querySelector("#arc-accordion-qa .t-acc-panel-inner").childElementCount'),1,'Resolved calc duration retains content at slower speed');
    await wait(300);
    assert.equal(await evaluate('document.querySelector("#arc-accordion-qa .t-acc-panel-inner").childElementCount'),0);
    await evaluate(`document.documentElement.style.setProperty('--motion-speed-scale',window.__arcAccordionSpeed || '1')`);
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate(`document.querySelector('#arc-accordion-qa .t-acc button[aria-controls]').click()`); await wait(30);
    await evaluate(`document.querySelector('#arc-accordion-qa .t-acc button[aria-controls]').click()`); await wait(30);
    assert.equal(await evaluate('document.querySelector("#arc-accordion-qa .t-acc-panel-inner").childElementCount'),0);
    await call('Emulation.setEmulatedMedia',{features:[]});
  }
  console.log('Actual auth/docs accordion checks passed: collapse height, inert state, controlled form retention, calc speed preference and reduced motion at 412/1280px. No auth submission.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});
  await evaluate(`if(window.__arcAccordionSpeed !== undefined) document.documentElement.style.setProperty('--motion-speed-scale',window.__arcAccordionSpeed || '1'); window.__arcAccordionQA?.dispose(); true`);
  ws.close();
}
