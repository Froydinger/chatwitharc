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
  await evaluate('window.__arcHandoffQA?.dispose(); import("/src/dev/ChatResponseHandoffQA.tsx").then(m => {window.__arcHandoffQA=m.installChatResponseHandoffQA();return true})');
  for (const width of [412,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    assert.equal(await evaluate('window.innerWidth'),width);
    await evaluate('window.__arcHandoffQA.render("waiting")'); await wait(300);
    assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa [data-arc-thinking-indicator]").length'),1);
    assert.equal(await evaluate('document.querySelector("#arc-response-handoff-qa textarea").placeholder'),'Thinking...');
    await evaluate('window.__arcHandoffQA.render("partial")'); await wait(60);
    assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa [data-arc-thinking-indicator]").length'),1,'Partial text keeps the same activity indicator');
    assert.equal(await evaluate('!!document.querySelector("#arc-response-handoff-qa [data-testid=live-chat-answer]")'),true);
    assert.equal(await evaluate('/finishing/i.test(document.querySelector("#arc-response-handoff-qa").textContent)'),false);
    assert.equal(await evaluate('document.querySelector("#arc-response-handoff-qa textarea").placeholder'),'Thinking...');
    await evaluate('window.__arcHandoffQA.render("done")');
    assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa [data-arc-thinking-indicator]").length'),0,'No retained indicator after completed reply');
    assert.equal(await evaluate('!!document.querySelector("#arc-response-handoff-qa [data-testid=live-chat-answer]")'),false);
    assert.equal(await evaluate('document.querySelector("#arc-response-handoff-qa textarea").placeholder'),'Type or talk...');
    assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa [data-reply-actions]").length'),1);
    assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa .arc-response-reveal").length'),0,'Streamed text is not animated again at final handoff');
    await evaluate('window.__arcHandoffQA.render("waiting");window.__arcHandoffQA.render("done")');
    const motion=await evaluate('(()=>{const node=document.querySelector("#arc-response-handoff-qa .arc-response-reveal");const s=getComputedStyle(node);return {name:s.animationName,duration:s.animationDuration,filter:s.filter,transform:s.transform,children:[...node.children].map(n=>getComputedStyle(n).animationName)}})()');
    assert.deepEqual(motion,{name:'arc-reveal-fade-in',duration:'0.18s',filter:'none',transform:'none',children:['none','none','none','none','none','none']});
    for(const phase of ['cancelled','failed']) {
      await evaluate('window.__arcHandoffQA.render("waiting");window.__arcHandoffQA.render("partial")');
      await evaluate(`window.__arcHandoffQA.render(${JSON.stringify(phase)})`);
      assert.equal(await evaluate('document.querySelectorAll("#arc-response-handoff-qa [data-arc-thinking-indicator],#arc-response-handoff-qa [data-testid=live-chat-answer]").length'),0);
      assert.equal(await evaluate('document.querySelector("#arc-response-handoff-qa textarea").placeholder'),'Type or talk...');
    }
  }
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('window.__arcHandoffQA.render("waiting");window.__arcHandoffQA.render("done")');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-response-handoff-qa .arc-response-reveal")).animationName'),'none');
  console.log('Response handoff browser checks passed: one indicator through partial text, no finishing labels, immediate completion/cancel/error cleanup, no stream replay, one 180ms fade and reduced motion at 412/1280px.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});
  await evaluate('window.__arcHandoffQA?.dispose(); true');
  ws.close();
}
