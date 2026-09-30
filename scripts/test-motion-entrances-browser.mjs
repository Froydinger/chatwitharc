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
  await evaluate('import("/src/dev/EntranceMotionQA.tsx").then(m => { window.__arcEntranceQA = m.installEntranceMotionQA(); return true; })');
  for (const width of [412, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width === 412 });
    for (const reduced of [false, true]) {
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await evaluate('window.__arcEntranceQA.render(false)');
      await wait(40);
      await evaluate('window.__arcEntranceQA.render(true)');
      if (process.env.ARC_RECORD_MOTION === '1' && width === 412 && !reduced) {
        const folder = mkdtempSync('/tmp/arc-thinking-frames-');
        const started = performance.now();
        try {
          for (let frame = 0; frame < 36; frame++) {
            const capture = await call('Page.captureScreenshot', {format:'png'});
            const bytes = Buffer.from(capture.data, 'base64');
            writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`, bytes);
            if (frame === 20) writeFileSync('/tmp/arc-thinking-native-frame.png', bytes);
            await wait(60);
          }
          const duration = (performance.now() - started) / 1000;
          execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-thinking-native-motion.mp4'],{stdio:'ignore'});
          console.log(`Recorded 36 actual component frames over ${duration.toFixed(2)}s to /tmp/arc-thinking-native-motion.mp4`);
        } finally { rmSync(folder,{recursive:true,force:true}); }
      }
      await wait(550);
      const result = await evaluate(`(() => {
        const host = document.querySelector('#arc-entrance-qa');
        const nodes = [...host.querySelectorAll('.arc-transition')];
        return { count: nodes.length, states: nodes.map(node => ({ opacity: getComputedStyle(node).opacity, animation: getComputedStyle(node).animationName })), overflow: host.scrollWidth > host.clientWidth, text: host.textContent,
          loops: [...host.querySelectorAll('.arc-image-thinking-spin,.arc-image-thinking-glow,.arc-welcome-avatar-float,.arc-welcome-avatar-glow')].map(node => ({name:getComputedStyle(node).animationName, iterations:getComputedStyle(node).animationIterationCount})) };
      })()`);
      assert.equal(result.count, 7, 'Actual welcome/avatar, two prompt chips, image card, spin wrapper and caption entrances');
      assert.ok(result.states.every(state => Number(state.opacity) === 1), `Entrances settle visible: ${JSON.stringify(result.states)}`);
      if (reduced) assert.ok(result.states.every(state => state.animation === 'none'));
      assert.equal(result.loops.length, 4, 'Image and avatar loops keep separate animation owners');
      if (reduced) assert.ok(result.loops.every(loop => loop.name === 'none'), 'Reduced motion stops both loops');
      else assert.ok(result.loops.every(loop => loop.name !== 'none' && loop.iterations === 'infinite'), 'Loop CSS must not replace an entrance lifetime');
      assert.equal(result.overflow, false, 'No new horizontal overflow');
      assert.equal(await evaluate('document.querySelector("#arc-entrance-qa img[alt=Arc]").naturalWidth > 0'), true, 'Avatar asset loads');
      const beforeClicks = await evaluate('Number(document.querySelector("#arc-entrance-qa").dataset.promptClicks)');
      await evaluate('document.querySelector("#arc-entrance-qa .arc-prompt-chip").click()');
      assert.equal(await evaluate('Number(document.querySelector("#arc-entrance-qa").dataset.promptClicks)'), beforeClicks + 1, 'A chip click invokes its callback exactly once');
      assert.ok(/generat|image/i.test(result.text));
    }
  }
  console.log('Actual entrance browser checks passed: welcome and full-size Thinking at 412/1280px, visible settlement and reduced motion.');
} finally {
  await call('Emulation.setEmulatedMedia', { features: [] });
  await evaluate('window.__arcEntranceQA?.dispose(); true');
  ws.close();
}
