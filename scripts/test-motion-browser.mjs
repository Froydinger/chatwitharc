import assert from 'node:assert/strict';
const tabs = await (await fetch('http://localhost:9224/json/list')).json();
const tab = tabs.find(t => t.url.startsWith('http://127.0.0.1:5174/'));
assert.ok(tab, 'Start local Vite and an isolated QA Chrome on port 9224');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let sequence = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Local QA timeout')); }, 10000);
  pending.set(id, m => { clearTimeout(timeout); if (m.error) reject(new Error(m.error.message)); else resolve(m.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!r.exceptionDetails, r.exceptionDetails?.exception?.description || r.exceptionDetails?.text);
  return r.result?.value;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  await evaluate('window.__arcMotionQA?.dispose(); import("/src/dev/TransitionQA.tsx").then(m => { window.__arcMotionQA = m.installTransitionQA(); return true; })');
  assert.equal(await evaluate('document.querySelector("#arc-transition-target").parentElement.id'), 'arc-transition-qa', 'No extra layout wrapper');
  for (const preset of ['fade', 'modal', 'dropdown', 'panel', 'page', 'text']) {
    await evaluate(`window.__arcMotionQA.render(true, "${preset}")`);
    assert.ok((await evaluate('getComputedStyle(document.querySelector("#arc-transition-target")).animationName')).startsWith('arc-'));
    await wait(420);
    await evaluate(`window.__arcMotionQA.render(false, "${preset}")`);
    assert.equal(await evaluate('document.querySelector("#arc-transition-target")?.dataset.motionState'), 'closed', 'Retain during exit');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-transition-target")).pointerEvents'), 'none');
    await wait(420);
    assert.equal(await evaluate('!!document.querySelector("#arc-transition-target")'), false, 'Exit removes node');
  }
  await evaluate('window.__arcMotionQA.render(true); window.__arcMotionNode = document.querySelector("#arc-transition-target"); true');
  await wait(300);
  await evaluate('window.__arcMotionQA.render(false)');
  await wait(30);
  await evaluate('window.__arcMotionQA.render(true)');
  await wait(300);
  assert.equal(await evaluate('document.querySelector("#arc-transition-target") === window.__arcMotionNode'), true, 'Rapid reopen preserves node');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate('window.__arcMotionQA.render(false)');
  await wait(30);
  assert.equal(await evaluate('!!document.querySelector("#arc-transition-target")'), false, 'Reduced motion settles immediately');
  await evaluate('window.__arcMotionQA.render(true); document.querySelector(`#arc-transition-qa button[aria-label="About this reply"]`).click()');
  await wait(30);
  const details = await evaluate('document.querySelector("[role=dialog]").innerText');
  assert.ok(details.includes('Arc Think') && details.includes('Powered by GPT 6'));
  assert.ok(details.toLowerCase().includes('web search') && details.toLowerCase().includes('weather'));
  assert.ok(!details.includes('gpt-6-luna') && !details.includes('Reasoning'));
  await evaluate('document.querySelector(`[role=dialog] button[aria-expanded="false"][aria-controls]`).click()');
  await wait(30);
  assert.equal(await evaluate('document.querySelector("[role=dialog] .arc-accordion").dataset.open'), 'true');
  await evaluate('document.querySelector(`[role=dialog] button[aria-expanded="true"][aria-controls]`).click()');
  await wait(30);
  assert.equal(await evaluate('document.querySelector("[role=dialog] .arc-accordion a").tabIndex'), -1, 'Collapsed sources cannot receive keyboard focus');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[role=dialog]")).animationName'), 'none');
  await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === "Close").click()');
  await wait(30);
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate('document.querySelector(`#arc-transition-qa button[aria-label="About this reply"]`).click()');
  await wait(300);
  const bounds = await evaluate('(()=>{const r=document.querySelector("[role=dialog]").getBoundingClientRect();return {center:r.x+r.width/2,viewport:innerWidth,w:r.width}})()');
  assert.ok(Math.abs(bounds.center - bounds.viewport / 2) < 2, 'Modal positioning transform is preserved');
  assert.ok(bounds.w <= 448, 'Modal stays within intended width');
  await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === "Close").click()');
  await wait(300);
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'About this reply', 'Focus returns to trigger');
  for (const width of [412, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width === 412 });
    const trigger = 'document.querySelector(`#arc-transition-qa button[aria-label^="Arc Matrix model:"]`)';
    await evaluate(`${trigger}.click()`);
    await wait(300);
    const menu = await evaluate('(()=>{const n=document.querySelector(`[data-testid="chat-model-menu"]`);const r=n.getBoundingClientRect();return {x:r.x,right:r.right,animation:getComputedStyle(n).animationName,text:n.textContent}})()');
    assert.ok(menu.x >= 0 && menu.right <= width, 'Picker stays inside viewport');
    assert.equal(menu.animation, 'arc-dropdown-in');
    assert.ok(menu.text.includes('Arc Flash') && menu.text.includes('Less usage'), 'Both modes use public usage labels');
    assert.equal((menu.text.match(/Powered by/g) || []).length, 2, 'Picker contains exactly two model choices');
    await evaluate(`${trigger}.click()`);
    await wait(20);
    assert.equal(await evaluate('document.querySelector(`[data-testid="chat-model-menu"]`)?.dataset.motionState'), 'closed');
    assert.equal(await evaluate('document.querySelector(`[data-testid="chat-model-menu"]`)?.hasAttribute("inert")'), true);
    await evaluate(`${trigger}.click()`);
    await wait(300);
    assert.equal(await evaluate('document.querySelectorAll(`[data-testid="chat-model-menu"]`).length'), 1, 'Rapid reopen retains one menu');
    await evaluate('[...document.querySelectorAll(`[data-testid="chat-model-menu"] button`)].find(b=>b.textContent.includes("Arc Think")).click()');
    await wait(250);
    assert.equal(await evaluate('!!document.querySelector(`[data-testid="chat-model-menu"]`)'), false);
    assert.ok((await evaluate(`${trigger}.getAttribute("aria-label")`)).includes('Arc Think'));
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate(`${trigger}.click()`);
    await wait(30);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(`[data-testid="chat-model-menu"]`)).animationName'), 'none');
    await evaluate(`${trigger}.click()`);
    await wait(30);
    assert.equal(await evaluate('!!document.querySelector(`[data-testid="chat-model-menu"]`)'), false);
    await call('Emulation.setEmulatedMedia', { features: [] });
  }
  console.log('Motion browser checks passed: six presets, exit cleanup, interruption, reduced motion, branding/tools, modal position/focus and actual model picker at 412/1280px.');
} finally {
  await evaluate('window.__arcMotionQA?.dispose()').catch(() => {});
  ws.close();
}
