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
const text = () => evaluate("document.querySelector('#arc-subagent-motion-qa').textContent");
const store = code => evaluate(`(()=>{const s=window.__arcSubagentQA.store.getState();${code};return true})()`);
try {
  await call('Page.reload'); await wait(1000);
  for (const width of [412,1280]) for (const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/SubagentMotionQA.tsx").then(m=>{window.__arcSubagentQA=m.installSubagentMotionQA();return true})');
    await store('s.startRun("qa")'); await wait(350);
    assert.ok((await text()).includes('splitting the request'));
    assert.equal(await evaluate('document.querySelector("#arc-subagent-motion-qa section").getAttribute("aria-busy")'),'true');
    await store('s.setPlan("qa",[{id:"one",label:"Research",focus:"Find evidence"},{id:"two",label:"Review",focus:"Check evidence"}]);s.setTaskStatus("qa","one","working")');await wait(300);
    assert.ok((await text()).includes('0/2'));
    assert.equal(await evaluate('document.querySelectorAll("#arc-subagent-motion-qa [data-layout-row]").length'),2);
    await evaluate('window.__arcHelperNode=document.querySelector("#arc-subagent-motion-qa [data-layout-row]");true');
    if(reduced)assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-subagent-motion-qa .animate-spin")).animationName'),'none');
    await store('s.setTaskStatus("qa","one","complete");s.setPhase("qa","synthesizing")');await wait(50);
    assert.ok((await text()).includes('1/2'));assert.ok((await text()).includes('strongest pieces'));
    assert.ok(await evaluate('window.__arcHelperNode===document.querySelector("#arc-subagent-motion-qa [data-layout-row]")'));
    await store('s.completeRun("qa")');await wait(50);assert.ok((await text()).includes('finished the parallel pass'));
    assert.equal(await evaluate('document.querySelector("#arc-subagent-motion-qa section").getAttribute("aria-busy")'),'false');
    await store('s.failRun("qa","Synthetic provider failure")');await wait(50);assert.ok((await text()).includes('Synthetic provider failure'));
    await store('s.clearRun("qa")');await wait(20);
    if(!reduced)assert.equal(await evaluate('document.querySelector("#arc-subagent-motion-qa section").hasAttribute("inert")'),true);
    await store('s.startRun("reopen")');await wait(350);assert.ok((await text()).includes('splitting'));
    assert.equal(await evaluate('document.querySelector("#arc-subagent-motion-qa section").hasAttribute("inert")'),false);
    await store('s.clearRun()');await wait(400);assert.equal(await evaluate('document.querySelector("#arc-subagent-motion-qa section")'),null);
    await evaluate('window.__arcSubagentQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/SubagentMotionQA.tsx").then(m=>{window.__arcSubagentQA=m.installSubagentMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-subagent-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await store('s.startRun("qa")');
        if(frame===10)await store('s.setPlan("qa",[{id:"one",label:"Research",focus:"Find evidence"},{id:"two",label:"Review",focus:"Check evidence"}]);s.setTaskStatus("qa","one","working")');
        if(frame===20)await store('s.setTaskStatus("qa","one","complete");s.setPhase("qa","synthesizing")');
        if(frame===28)await store('s.completeRun("qa")');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-subagent-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-subagent-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual helper progress over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual SubagentProgress and store passed: planning, task state, stable keyed nodes, synthesis, completion, failure, inert close/reopen, removal and reduced spinner at 412/1280. Synthetic runs only, no provider calls.');
} finally {await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcSubagentQA?.dispose();true');ws.close();}
