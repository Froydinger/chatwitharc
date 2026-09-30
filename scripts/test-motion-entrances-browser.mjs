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
  await evaluate('import("/src/dev/EntranceMotionQA.tsx").then(m => { window.__arcEntranceQA = m.installEntranceMotionQA(); return true; })');
  for (const width of [412, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width === 412 });
    for (const reduced of [false, true]) {
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await evaluate('window.__arcEntranceQA.render(false)');
      await wait(40);
      await evaluate('window.__arcEntranceQA.render(true)');
      await wait(550);
      const result = await evaluate(`(() => {
        const host = document.querySelector('#arc-entrance-qa');
        const nodes = [...host.querySelectorAll('.arc-transition')];
        return { count: nodes.length, states: nodes.map(node => ({ opacity: getComputedStyle(node).opacity, animation: getComputedStyle(node).animationName })), overflow: host.scrollWidth > host.clientWidth, text: host.textContent };
      })()`);
      assert.equal(result.count, 2, 'Actual welcome and caption entrances');
      assert.ok(result.states.every(state => Number(state.opacity) === 1), `Entrances settle visible: ${JSON.stringify(result.states)}`);
      if (reduced) assert.ok(result.states.every(state => state.animation === 'none'));
      assert.equal(result.overflow, false, 'No new horizontal overflow');
      assert.ok(/generat|image/i.test(result.text));
    }
  }
  console.log('Actual entrance browser checks passed: welcome and full-size Thinking at 412/1280px, visible settlement and reduced motion.');
} finally {
  await call('Emulation.setEmulatedMedia', { features: [] });
  await evaluate('window.__arcEntranceQA?.dispose(); true');
  ws.close();
}
