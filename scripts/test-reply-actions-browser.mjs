import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
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
const active = () => evaluate('[...document.querySelectorAll("#arc-reply-actions-qa [data-reply-actions]")].map(node => node.dataset.replyActions)');
const tap = id => evaluate(`document.querySelector('[data-qa-reply="${id}"] [tabindex="0"]').click()`);
try {
  await evaluate('window.__arcReplyActionsQA?.dispose(); import("/src/dev/ReplyActionsQA.tsx").then(m => { window.__arcReplyActionsQA = m.installReplyActionsQA(); return true; })');
  for (const width of [412, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width === 412 });
    assert.equal(await evaluate('window.innerWidth'), width, 'Actual viewport width');
    await evaluate('window.__arcReplyActionsQA.reset()');
    await wait(100);
    assert.deepEqual(await active(), ['latest']);
    if (width === 412) { const image = await call('Page.captureScreenshot', {format:'png'}); writeFileSync('/tmp/arc-reply-controls-latest.png', Buffer.from(image.data,'base64')); }
    await tap('older'); await wait(50);
    assert.deepEqual(await active(), ['older'], 'Tapping an older reply moves the sole controls row');
    if (width === 412) { const image = await call('Page.captureScreenshot', {format:'png'}); writeFileSync('/tmp/arc-reply-controls-older.png', Buffer.from(image.data,'base64')); }
    await evaluate(`document.querySelector('[data-qa-reply="older"] button[aria-label="About this reply"]').click()`);
    await wait(300);
    assert.ok((await evaluate('document.querySelector("[role=dialog]").textContent')).includes('Maya'));
    await evaluate(`document.querySelector('[role="dialog"] button span.sr-only')?.parentElement.click()`);
    await wait(300);
    assert.deepEqual(await active(), ['older'], 'Model dialog belongs to selected older reply');
    await evaluate(`document.querySelector('[data-qa-reply="user"] .user-message-bubble').click()`);
    await wait(50);
    assert.deepEqual(await active(), ['older'], 'User messages do not move assistant controls');
    await evaluate(`(() => { const node=document.querySelector('[data-qa-reply="latest"] [tabindex="0"]'); node.focus(); node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
    await wait(50);
    assert.deepEqual(await active(), ['latest'], 'Keyboard Enter selects a reply');
    await evaluate(`(() => { const link=document.querySelector('[data-qa-reply="older"] a'); link.addEventListener('click',e=>e.preventDefault(),{once:true}); link.click(); })()`);
    await wait(50);
    assert.deepEqual(await active(), ['latest'], 'Links do not unexpectedly move controls');
    await evaluate(`(() => { const text=document.querySelector('[data-qa-reply="older"] p'); const range=document.createRange(); range.selectNodeContents(text); window.getSelection().addRange(range); })()`);
    await tap('older'); await wait(50);
    assert.deepEqual(await active(), ['latest'], 'Text selection does not move controls');
    await evaluate('window.getSelection().removeAllRanges()');
    await tap('older'); await wait(50);
    await evaluate('window.__arcReplyActionsQA.add("new-user", "user")'); await wait(50);
    assert.deepEqual(await active(), ['older'], 'A submitted user message keeps the selected reply');
    await evaluate('window.__arcReplyActionsQA.add("live-request")'); await wait(50);
    assert.deepEqual(await active(), ['live-request'], 'First streamed reply restores latest controls');
    await evaluate('window.__arcReplyActionsQA.remove("live-request"); window.__arcReplyActionsQA.add("final-request")'); await wait(50);
    assert.deepEqual(await active(), ['final-request'], 'Final persistence leaves one controls row');
    await tap('older'); await wait(50);
    await evaluate('window.__arcReplyActionsQA.setScope("chat-b")'); await wait(50);
    assert.deepEqual(await active(), ['final-request'], 'Switching chats restores latest');
    await evaluate('window.__arcReplyActionsQA.setScope("chat-a")'); await wait(50);
    assert.deepEqual(await active(), ['final-request'], 'Returning to a chat does not restore stale selection');
    await tap('older'); await wait(50);
    await evaluate('window.__arcReplyActionsQA.remove("older")'); await wait(50);
    assert.deepEqual(await active(), ['final-request'], 'Deleted selected reply falls back to latest');
  }
  console.log('Reply controls browser checks passed: one latest row, older tap, model ownership, keyboard, links/selection, user messages, stream/final, chat switches and deletion at 412/1280px.');
} finally {
  await evaluate('window.__arcReplyActionsQA?.dispose(); true');
  ws.close();
}
