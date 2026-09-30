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
  const before = await evaluate('({classes:document.documentElement.className,style:document.documentElement.getAttribute("style"),accent:document.documentElement.getAttribute("data-accent")})');
  try {
    await evaluate('document.documentElement.className="light"; import("/src/dev/SettingsThemeQA.tsx").then(m=>{window.__settingsThemeQA=m.installSettingsThemeQA();return true})');
    for (const width of [412, 1280]) {
      await call('Emulation.setDeviceMetricsOverride', {width,height:915,deviceScaleFactor:1,mobile:width===412});
      for (const theme of ['light','dark','light','dark']) {
        await evaluate(`document.documentElement.className=${JSON.stringify(theme)}`);
        await wait(100);
        const colors=await evaluate('(()=>{const h=document.querySelector("#arc-settings-theme-qa");return {background:getComputedStyle(h.querySelector("main")).backgroundColor,icon:getComputedStyle(h.querySelector("svg")).color,primary:getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()}})()');
        assert.equal(colors.primary,theme==='light'?'0 0% 0%':'0 0% 95%');
        assert.equal(colors.icon,theme==='light'?'rgb(0, 0, 0)':'rgb(242, 242, 242)');
        assert.notEqual(colors.background, colors.icon);
        console.log(width,theme,colors);
      }
    }
  } finally {
    await evaluate(`window.__settingsThemeQA?.dispose();document.documentElement.className=${JSON.stringify(before.classes)};document.documentElement.setAttribute('style',${JSON.stringify(before.style || '')});document.documentElement.setAttribute('data-accent',${JSON.stringify(before.accent || 'noir')})`);
    await call('Emulation.clearDeviceMetricsOverride');
  }
  console.log('Settings theme color synchronization passed at mobile and desktop sizes.');
} finally {ws.close();}
