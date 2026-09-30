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
  await call('Page.reload');await wait(1000);
  for(const reduced of [false,true]) {
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/FingerPopupMotionQA.tsx").then(m=>{window.__arcFingerQA=m.installFingerPopupMotionQA();return true})');await wait(350);
    assert.equal(await evaluate("document.querySelectorAll('#arc-finger-popup-qa [data-finger-popup]').length"),2);
    assert.deepEqual(await evaluate("(()=>{const r=document.querySelector('#arc-finger-popup-qa [data-finger-popup=\"one\"]').getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)}})()"),{left:160,top:180});
    await evaluate("window.__arcFingerNode=document.querySelector('#arc-finger-popup-qa [data-finger-popup=\"one\"]');window.__arcFingerQA.render(['two']);true");await wait(20);
    if(!reduced) {
      assert.equal(await evaluate("window.__arcFingerNode.dataset.motionState"),'closed');
      assert.equal(await evaluate("window.__arcFingerNode.hasAttribute('inert')"),true);
      await evaluate("window.__arcFingerQA.render(['one','two']);true");await wait(350);
      assert.ok(await evaluate("window.__arcFingerNode===document.querySelector('#arc-finger-popup-qa [data-finger-popup=\"one\"]')"));
      await evaluate("window.__arcFingerQA.render(['two']);true");
    }
    await wait(350);assert.equal(await evaluate("document.querySelectorAll('#arc-finger-popup-qa [data-finger-popup]').length"),1);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-finger-popup-qa [data-finger-popup]')).pointerEvents"),'none');
    await evaluate('window.__arcFingerQA.render([]);true');await wait(350);assert.equal(await evaluate("document.querySelectorAll('#arc-finger-popup-qa [data-finger-popup]').length"),0);
    await evaluate('window.__arcFingerQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    const folder=mkdtempSync('/tmp/arc-finger-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('import("/src/dev/FingerPopupMotionQA.tsx").then(m=>{window.__arcFingerQA=m.installFingerPopupMotionQA();return true})');
        if(frame===12)await evaluate("window.__arcFingerQA.render(['two']);true");
        if(frame===24)await evaluate("window.__arcFingerQA.render([]);true");
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===8)writeFileSync('/tmp/arc-finger-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-finger-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual finger popups over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual finger popup passed: keyed multi-notice exit, inert closure, same-node interrupted reopen, reduced motion and unmount. No composer/store writes.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcFingerQA?.dispose();true');ws.close();}
