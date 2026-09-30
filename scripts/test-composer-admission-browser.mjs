import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
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
  await evaluate('import("/src/dev/ComposerAdmissionQA.tsx").then(m=>{window.__arcAdmissionQA=m.installComposerAdmissionQA();return true})');
  await evaluate('window.__arcAdmissionQA.send("first");window.__arcAdmissionQA.send("second")');
  assert.deepEqual(await evaluate('window.__arcAdmissionQA.started'),['first']);
  assert.deepEqual(await evaluate('window.__arcAdmissionQA.queued'),['second']);
  assert.equal(await evaluate('window.__arcAdmissionQA.state().busy'),true);
  await evaluate('window.__arcAdmissionQA.finish(true)');await wait(40);
  assert.equal(await evaluate('window.__arcAdmissionQA.state().busy'),false,'Failure releases atomic guard');
  await evaluate('window.__arcAdmissionQA.send("retry");window.__arcAdmissionQA.setOwner("owner-b")');await wait(100);
  assert.deepEqual(await evaluate('window.__arcAdmissionQA.state()'),{busy:false,cancellations:1},'Account switch cancels old admission once');
  assert.deepEqual(await evaluate('window.__arcAdmissionQA.outcomes'),['returned','Error','AbortError']);
  await evaluate('window.__arcAdmissionQA.send("new owner");window.__arcAdmissionQA.finish()');await wait(40);
  assert.deepEqual(await evaluate('window.__arcAdmissionQA.started'),['first','retry','new owner']);
  assert.equal(await evaluate('window.__arcAdmissionQA.state().busy'),false);
  assert.equal(await evaluate('window.__arcAdmissionQA.state().cancellations'),1,'Stable account does not cancel again');
  console.log('Actual composer admission hook checks passed: synchronous duplicate guard, queued overlap, failed release, owner-change cancellation once and subsequent new-owner completion.');
} finally {await evaluate('window.__arcAdmissionQA?.dispose();true');ws.close();}
