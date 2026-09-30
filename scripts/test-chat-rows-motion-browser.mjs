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
  for(const width of [412,1280])for(const reduced of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/ChatRowsMotionQA.tsx").then(m=>{window.__arcRowsQA=m.installChatRowsMotionQA();return true})');
    assert.equal(await evaluate('document.querySelector("#arc-chat-rows-qa .arc-chat-row-enter")'),null);
    await evaluate('window.__arcRowsQA.render(["history","user-new"])');
    const selector='document.querySelector("#arc-chat-rows-qa [data-qa-row=user-new]")';
    assert.equal(await evaluate(`getComputedStyle(${selector}).animationName`),reduced?'none':'arc-reveal-fade-in');
    await evaluate(`window.__arcUserNode=${selector};true`);
    await evaluate('window.__arcRowsQA.render(["history","user-new","assistant-final"])');
    assert.ok(await evaluate(`window.__arcUserNode===${selector}`));
    assert.ok(await evaluate(`${selector}.classList.contains("arc-chat-row-enter")`));
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-chat-rows-qa [data-qa-row=assistant-final]")).animationName'),'none');
    await evaluate('window.__arcRowsQA.render(["loaded-history","assistant-history"],true)');
    assert.equal(await evaluate('document.querySelector("#arc-chat-rows-qa .arc-chat-row-enter")'),null);
    assert.equal(await evaluate('document.querySelector("#arc-chat-rows-qa [data-qa-row=user-new]")'),null);
    await evaluate('window.__arcRowsQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/ChatRowsMotionQA.tsx").then(m=>{window.__arcRowsQA=m.installChatRowsMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-chat-rows-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('window.__arcRowsQA.render(["history","user-new"])');
        if(frame===10)await evaluate('window.__arcRowsQA.render(["history","user-new","assistant-final"])');
        if(frame===20)await evaluate('window.__arcRowsQA.render(["history","user-new","assistant-final","user-followup"])');
        if(frame===28)await evaluate('window.__arcRowsQA.render(["history","user-new","assistant-final","user-followup","assistant-next"])');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-chat-rows-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-chat-rows-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual chat rows over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Native chat rows passed: history mount suppression, new user fade, stable nodes/classes on answer insertion, no assistant replay, hydrated history suppression, removal, 412/1280 and reduced motion.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcRowsQA?.dispose();true');ws.close();}
