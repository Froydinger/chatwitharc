import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
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
const drag = type => evaluate(`document.dispatchEvent(new DragEvent('${type}',{bubbles:true})); true`);
try {
  await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('window.innerWidth'),412);
  assert.ok(await evaluate('!!document.querySelector("textarea[data-arc-composer]")'),'Actual local preview composer must be mounted');
  await drag('dragenter'); await wait(300);
  assert.equal(await evaluate(`(() => {window.__arcDropNode=[...document.querySelectorAll('.arc-transition[data-motion-state="open"]')].find(node=>node.textContent.includes('Drop files here')); return !!window.__arcDropNode;})()`),true);
  const image = await call('Page.captureScreenshot',{format:'png'});
  writeFileSync('/tmp/arc-drop-zone-native.png',Buffer.from(image.data,'base64'));
  await drag('dragenter'); await drag('dragleave'); await wait(30);
  assert.equal(await evaluate('window.__arcDropNode.dataset.motionState'),'open','Nested leave keeps outer drag overlay');
  await drag('dragleave'); await wait(30);
  assert.equal(await evaluate('window.__arcDropNode.dataset.motionState'),'closed');
  assert.equal(await evaluate('window.__arcDropNode.inert'),true,'Closing overlay does not intercept input');
  await drag('dragenter'); await wait(300);
  assert.equal(await evaluate('document.contains(window.__arcDropNode)'),true,'Interrupted drag close preserves node');
  assert.equal(await evaluate('window.__arcDropNode.dataset.motionState'),'open');
  await evaluate(`(() => {const transfer=new DataTransfer();transfer.items.add(new File(['offline fixture'],'drop-native.png',{type:'image/png'}));document.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));})()`);
  await wait(300);
  assert.equal(await evaluate('document.contains(window.__arcDropNode)'),false,'Drop completes overlay exit');
  assert.equal(await evaluate(`document.body.textContent.includes('Selected Images (1/6)')`),true,'File still reaches the actual attachment tray');
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim().toLowerCase()==='clear all').click()`);
  await wait(100);
  assert.equal(await evaluate(`document.body.textContent.includes('Selected Images (1/6)')`),false);
  console.log('Actual composer drop-overlay checks passed: native entrance, nested drag ownership, interrupted close, inert exit and captured attachment/clear. No provider request.');
} finally {
  await drag('drop');
  ws.close();
}
