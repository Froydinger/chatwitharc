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
  await evaluate('import("/src/dev/PanelMotionQA.tsx").then(m=>{window.__arcPanelQA=m.installPanelMotionQA();return true})');
  for (const reduced of [false,true]) {
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('window.__arcPanelQA.render("history")');await wait(200);
    await evaluate('window.__arcPanelQA.render("quote")');
    if (!reduced) {
      assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa button").dataset.page'),'history','Old page stays for exit');
      assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa .arc-transition").hasAttribute("inert")'),true,'Exiting page cannot be activated');
    }
    await evaluate('window.__arcPanelQA.render("settings")');await wait(250);
    assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa button").dataset.page'),'settings','Rapid changes coalesce to latest page');
    await evaluate('window.__arcPanelQA.render("history");window.__arcPanelQA.render("settings")');await wait(250);
    assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa button").dataset.page'),'settings','Reopening cancels pending exit');
    await evaluate('window.__arcPanelQA.render("settings",false)');await wait(450);
    assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa .arc-history-drawer").hasAttribute("inert")'),true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-panel-motion-qa .arc-history-drawer")).translate'),'-100%');
    await evaluate('window.__arcPanelQA.render("history",true)');await wait(500);
    assert.equal(await evaluate('document.querySelector("#arc-panel-motion-qa button").dataset.page'),'history');
    if(reduced)assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-panel-motion-qa .arc-transition")).animationName'),'none');
  }
  if(process.env.ARC_RECORD_MOTION === '1') {
    const folder=mkdtempSync('/tmp/arc-panel-frames-');const start=performance.now();
    try {
      await call('Emulation.setEmulatedMedia',{features:[]});
      await evaluate('window.__arcPanelQA.render("history",false)');await wait(450);
      for(let frame=0;frame<36;frame++) {
        if(frame===1)await evaluate('window.__arcPanelQA.render("history",true)');
        if(frame===12)await evaluate('window.__arcPanelQA.render("quote",true)');
        if(frame===24)await evaluate('window.__arcPanelQA.render("quote",false)');
        const capture=await call('Page.captureScreenshot',{format:'png'});
        writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,Buffer.from(capture.data,'base64'));await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-panel-native-motion.mp4'],{stdio:'ignore'});
      console.log(`Recorded native panel sequence over ${duration.toFixed(2)}s`);
    } finally {rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Native panel checks passed: sequenced exit, inert outgoing page, rapid latest selection, reopened exit cancellation, drawer close/reopen and reduced motion.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});
  await evaluate('window.__arcPanelQA?.dispose();true');ws.close();
}
