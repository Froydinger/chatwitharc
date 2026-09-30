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
  await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
  await evaluate('import("/src/dev/ComposerQueueQA.tsx").then(m=>{window.__arcQueueQA=m.installComposerQueueQA();return true})');await wait(200);
  await evaluate('window.__arcQueueQA.enqueue("First");window.__arcQueueQA.enqueue("Second");window.__arcQueueQA.enqueue("Third")');await wait(500);
  await evaluate('window.__arcSurvivingRow=document.querySelectorAll("#arc-queue-qa [data-layout-row]")[2];document.querySelector("#arc-queue-qa [data-layout-row] button[title=Remove]").click()');await wait(40);
  assert.equal(await evaluate('document.querySelectorAll("#arc-queue-qa [data-layout-row]").length'),2);
  assert.ok(await evaluate('window.__arcSurvivingRow.getAnimations().some(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition))'),'Surviving row animates to new layout');
  await evaluate('document.querySelector("#arc-queue-qa [data-layout-row] button[title=Remove]").click()');await wait(40);
  assert.equal(await evaluate('window.__arcSurvivingRow===document.querySelector("#arc-queue-qa [data-layout-row]")'),true,'Interrupted movement preserves keyed DOM');
  await evaluate('window.__arcRowMovement=window.__arcSurvivingRow.getAnimations().find(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition));window.__arcQueueQA.setDraft("New draft while row moves")');await wait(30);
  assert.equal(await evaluate('window.__arcSurvivingRow.getAnimations().includes(window.__arcRowMovement)'),true,'Typing does not restart unchanged movement');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(100);
  assert.equal(await evaluate('window.__arcSurvivingRow.getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length'),0,'Reduced motion cancels active native movement');
  await evaluate('window.__arcQueueQA.enqueue("Fourth")');await wait(40);
  await evaluate('document.querySelector("#arc-queue-qa [data-layout-row] button[title=Remove]").click()');await wait(40);
  assert.equal(await evaluate('document.querySelector("#arc-queue-qa [data-layout-row]").getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length'),0,'Reduced motion does not start layout movement');
  assert.equal(await evaluate('window.__arcQueueQA.started.length'),0,'Animation never dispatches a request');
  await call('Emulation.setEmulatedMedia',{features:[]});
  if(process.env.ARC_RECORD_MOTION==='1') {
    await evaluate('window.__arcQueueQA.enqueue("Fifth");window.__arcQueueQA.enqueue("Sixth")');await wait(300);
    const folder=mkdtempSync('/tmp/arc-queue-native-frames-');const started=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===4||frame===6)await evaluate('document.querySelector("#arc-queue-qa [data-layout-row] button[title=Remove]").click()');
        if(frame===16)await evaluate(`document.querySelector('#arc-queue-qa button[aria-label="Collapse queued messages"]').click()`);
        if(frame===26)await evaluate(`document.querySelector('#arc-queue-qa button[aria-label="Expand queued messages"]').click()`);
        const capture=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,Buffer.from(capture.data,'base64'));await wait(60);
      }
      const duration=(performance.now()-started)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-queue-native-motion.mp4'],{stdio:'ignore'});
      console.log(`Recorded actual native queue over ${duration.toFixed(2)}s`);
    } finally {rmSync(folder,{recursive:true,force:true});}
  }
  await evaluate('window.__arcQueueQA.dispose()');
  assert.equal(await evaluate('window.__arcSurvivingRow.getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length'),0,'Unmount cancels movement');
  console.log('Actual native queue layout checks passed: survivor movement, interrupted removal, stable keyed DOM, dynamic reduced motion, no dispatch and unmount cleanup.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcQueueQA?.dispose();true');ws.close();
}
