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
  for (const width of [1280, 412]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width === 412 });
    await setDraft('IME-characterization');
    assert.equal(await evaluate(`document.querySelector('textarea[data-arc-composer]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}))`), true);
    assert.equal(await evaluate(`document.querySelector('textarea[data-arc-composer]').value`), 'IME-characterization');
    assert.equal(await evaluate(`document.querySelector('textarea[data-arc-composer]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}))`), true);
    await setDraft('First line\nSecond line');
    const position = await evaluate(`(()=>{const t=document.querySelector('textarea[data-arc-composer]'); t.setSelectionRange(3,3);return {height:t.offsetHeight,width:t.getBoundingClientRect().width}})()`);
    assert.ok(position.height <= 72 && position.height >= 28);
    assert.ok(position.width > 50 && position.width < width);
    await call('Emulation.setDeviceMetricsOverride', { width, height: 650, deviceScaleFactor: 1, mobile: width === 412 });
    await wait(50);
    assert.equal(await evaluate(`document.querySelector('textarea[data-arc-composer]').selectionStart`), 3, 'Viewport changes preserve selection');
  }
  await setDraft('');
  await evaluate(`(()=>{
    const stats={created:0,revoked:0,listeners:new Set(),observers:new Set()};
    const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL,add:window.addEventListener,remove:window.removeEventListener,observer:window.ResizeObserver};
    URL.createObjectURL=function(file){stats.created++;return original.create.call(URL,file)};
    URL.revokeObjectURL=function(url){stats.revoked++;return original.revoke.call(URL,url)};
    window.addEventListener=function(type,fn,...rest){if(type==='resize'||type==='scroll')stats.listeners.add(fn);return original.add.call(window,type,fn,...rest)};
    window.removeEventListener=function(type,fn,...rest){stats.listeners.delete(fn);return original.remove.call(window,type,fn,...rest)};
    window.ResizeObserver=class extends original.observer{constructor(cb){super(cb);stats.observers.add(this)}disconnect(){stats.observers.delete(this);super.disconnect()}};
    window.__arcLifecycleStats=stats;
    window.__arcLifecycleRestore=()=>{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;window.addEventListener=original.add;window.removeEventListener=original.remove;window.ResizeObserver=original.observer};
  })()`);
  await evaluate(`import('/src/dev/ComposerLifecycleQA.tsx').then(m=>{window.__arcLifecycleQA=m.installComposerLifecycleQA();window.__arcCapturedFile=new File(['fixture'],'fixture.png',{type:'image/png'});window.__arcLifecycleQA.render([window.__arcCapturedFile]);return true})`);
  await wait(100);
  assert.equal(await evaluate('document.querySelector("#arc-lifecycle-target").dataset.previews'), '1');
  assert.equal(await evaluate('window.__arcLifecycleStats.created'), 1);
  await evaluate('window.__arcLifecycleQA.render([])');
  await wait(100);
  assert.equal(await evaluate('window.__arcLifecycleStats.revoked'), 1, 'Removed previews revoked once');
  assert.equal(await evaluate('window.__arcCapturedFile.size'), 7, 'Captured File survives preview cleanup');
  await evaluate('window.__arcLifecycleQA.render([window.__arcCapturedFile])');
  await wait(100);
  await evaluate('window.__arcLifecycleQA.dispose()');
  assert.equal(await evaluate('window.__arcLifecycleStats.created'), 2);
  assert.equal(await evaluate('window.__arcLifecycleStats.revoked'), 2, 'Unmount revokes remaining previews');
  assert.equal(await evaluate('window.__arcLifecycleStats.listeners.size'), 0, 'Window subscriptions cleaned up');
  assert.equal(await evaluate('window.__arcLifecycleStats.observers.size'), 0, 'Both resize observers cleaned up');
  console.log('Composer browser checks passed: desktop/narrow IME, newline, sizing, selection, preview lifetime, captured File retention and subscription teardown.');
} finally {
  await evaluate('window.__arcLifecycleQA?.dispose();window.__arcLifecycleRestore?.()').catch(() => {});
  ws.close();
}
