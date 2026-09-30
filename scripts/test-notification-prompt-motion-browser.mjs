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
const click = expression=>evaluate(`${expression}.click();true`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/NotificationPromptMotionQA.tsx").then(m=>{window.__arcNotificationQA=m.installNotificationPromptMotionQA();return true})');
    assert.equal(await evaluate('!!document.querySelector("#arc-notification-prompt-qa .arc-transition")'),false);
    await click('document.querySelector("#arc-notification-prompt-qa [data-qa-open]")');await wait(450);
    const enable='[...document.querySelectorAll("#arc-notification-prompt-qa button")].find(n=>n.textContent.trim()==="Enable"||n.textContent.trim()==="Enabling…")';
    await click('document.querySelector("#arc-notification-prompt-qa [data-qa-loading]")');await wait(50);assert.equal(await evaluate(`${enable}.disabled`),true);
    await click(enable);assert.deepEqual(await evaluate('window.__arcNotificationQA.calls'),[]);
    await click('document.querySelector("#arc-notification-prompt-qa [data-qa-loading]")');await wait(50);await click(enable);
    assert.deepEqual(await evaluate('window.__arcNotificationQA.calls'),['enable']);
    await evaluate('window.__arcPromptNode=document.querySelector("#arc-notification-prompt-qa .arc-transition");true');
    await click('[...document.querySelectorAll("#arc-notification-prompt-qa button")].find(n=>n.getAttribute("aria-label")==="Dismiss for 7 days")');await wait(20);
    if(!reduced)assert.ok(await evaluate('window.__arcPromptNode.hasAttribute("inert")'));
    await click('document.querySelector("#arc-notification-prompt-qa [data-qa-open]")');await wait(450);assert.equal(await evaluate('document.querySelector("#arc-notification-prompt-qa .arc-transition").hasAttribute("inert")'),false);
    await click('[...document.querySelectorAll("#arc-notification-prompt-qa button")].find(n=>n.textContent.trim()==="Don\'t show again")');await wait(450);
    assert.equal(await evaluate('!!document.querySelector("#arc-notification-prompt-qa .arc-transition")'),false);assert.deepEqual(await evaluate('window.__arcNotificationQA.calls'),['enable','dismiss','forever']);
    assert.equal(await evaluate('document.querySelector("#arc-notification-prompt-qa").scrollWidth>innerWidth'),false);
    await evaluate('window.__arcNotificationQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/NotificationPromptMotionQA.tsx").then(m=>{window.__arcNotificationQA=m.installNotificationPromptMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-notification-prompt-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await click('document.querySelector("#arc-notification-prompt-qa [data-qa-open]")');
        if(frame===10)await click('document.querySelector("#arc-notification-prompt-qa [data-qa-loading]")');
        if(frame===20)await click('[...document.querySelectorAll("#arc-notification-prompt-qa button")].find(n=>n.getAttribute("aria-label")==="Dismiss for 7 days")');
        if(frame===28)await click('document.querySelector("#arc-notification-prompt-qa [data-qa-open]")');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-notification-prompt-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-notification-prompt-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual notification prompt over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual notification prompt view passed: open/close, disabled loading, enable/dismiss/forever callback ports, inert exit/reopen, removal, 412/1280 geometry and reduced motion. No browser permission requested.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcNotificationQA?.dispose();true');ws.close();}
