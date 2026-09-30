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
  await evaluate('window.__arcConditionalQA?.dispose(); import("/src/dev/ConditionalMotionQA.tsx").then(m => { window.__arcConditionalQA = m.installConditionalMotionQA(); return true; })');
  assert.equal(await evaluate('!!document.querySelector("#arc-conditional-target")'),false);
  await evaluate('window.__arcConditionalQA.render({label:"First value"})'); await wait(300);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-conditional-part")).animationName'),'arc-modal-in');
  await evaluate('window.__arcConditionalQA.render({label:"Latest committed value"}); window.__arcConditionalNode=document.querySelector("#arc-conditional-target");window.__arcConditionalNode.focus()');
  const point = await evaluate('(() => {const r=window.__arcConditionalNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await evaluate('window.__arcConditionalQA.render(null)');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-conditional-part")).animationName'),'arc-modal-out');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-conditional-part")).animationDuration'), await evaluate('getComputedStyle(document.querySelector("#arc-conditional-target")).animationDuration'));
  await wait(30); // Let the browser apply inert to its focus tree.
  assert.equal(await evaluate('document.querySelector("#arc-conditional-target").textContent'),'Latest committed value','Exit keeps last committed data without evaluating null');
  assert.equal(await evaluate('document.querySelector("#arc-conditional-target").getAttribute("inert")'),'');
  assert.equal(await evaluate('document.querySelector("#arc-conditional-target").getAttribute("aria-hidden")'),'true');
  assert.equal(await evaluate('document.activeElement === window.__arcConditionalNode'),false,'Closing controls lose focus immediately');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  assert.equal(await evaluate('window.__arcConditionalQA.clicks()'),0,'Real pointer cannot activate closing controls');
  await evaluate('window.__arcConditionalQA.render({label:"Reopened value"})'); await wait(300);
  assert.equal(await evaluate('window.__arcConditionalNode === document.querySelector("#arc-conditional-target")'),true,'Interrupted close preserves DOM');
  assert.equal(await evaluate('document.querySelector("#arc-conditional-target").getAttribute("inert")'),null);
  assert.equal(await evaluate('document.querySelector("#arc-conditional-target").textContent'),'Reopened value');
  await evaluate('window.__arcConditionalQA.render(null)'); await wait(300);
  assert.equal(await evaluate('!!document.querySelector("#arc-conditional-target")'),false,'Completed exit removes DOM');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('window.__arcConditionalQA.render({label:"Reduced motion"})');
  await evaluate('window.__arcConditionalQA.render(null)'); await wait(30);
  assert.equal(await evaluate('!!document.querySelector("#arc-conditional-target")'),false);
  console.log('Conditional transition checks passed: lazy guarded data, last committed values, inert pointer/focus, interrupted reopen, completed exit and reduced motion.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});
  await evaluate('window.__arcConditionalQA?.dispose(); true');
  ws.close();
}
