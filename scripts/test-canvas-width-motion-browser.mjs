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
const click = attr => evaluate(`document.querySelector('#arc-canvas-width-qa [${attr}]').click();true`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/CanvasWidthMotionQA.tsx").then(m=>{window.__arcCanvasWidthQA=m.installCanvasWidthMotionQA();return true})');
    assert.equal(await evaluate("document.querySelector('#arc-canvas-width-qa .arc-width-panel')"),null);
    await click('data-qa-history');await wait(50);
    if(!reduced){const middle=await evaluate("document.querySelector('#arc-canvas-width-qa [data-qa-history-shell] .arc-width-panel').getBoundingClientRect().width");assert.ok(middle>0&&middle<200,'History width must tween');}
    await wait(400);
    assert.equal(await evaluate("Math.round(document.querySelector('#arc-canvas-width-qa [data-qa-history-shell] .arc-width-panel').getBoundingClientRect().width)"),200);
    assert.ok(await evaluate("document.querySelector('#arc-canvas-width-qa [data-qa-history-shell]').textContent.includes('123 chars')"));
    await evaluate("[...document.querySelectorAll('#arc-canvas-width-qa [data-qa-history-shell] button')].find(n=>n.textContent.includes('Second version')).click()");await wait(50);
    assert.deepEqual(await evaluate('window.__arcCanvasWidthQA.calls'),[1]);
    await evaluate("window.__arcCanvasNode=document.querySelector('#arc-canvas-width-qa [data-qa-history-shell] .arc-width-panel');true");
    await click('data-qa-history');await wait(30);
    if(!reduced){assert.equal(await evaluate('window.__arcCanvasNode.hasAttribute("inert")'),true);await click('data-qa-history');await wait(450);assert.ok(await evaluate("window.__arcCanvasNode===document.querySelector('#arc-canvas-width-qa [data-qa-history-shell] .arc-width-panel')"));await click('data-qa-history');}
    await wait(350);assert.equal(await evaluate("document.querySelector('#arc-canvas-width-qa [data-qa-history-shell] .arc-width-panel')"),null);
    await click('data-qa-pane');await wait(450);
    let geometry=await evaluate("(()=>{const shell=document.querySelector('#arc-canvas-width-qa [data-qa-pane-shell]');return {available:shell.clientWidth,pane:shell.querySelector('.arc-width-panel').getBoundingClientRect().width}})()");assert.ok(Math.abs(geometry.pane-geometry.available*.6)<2);
    await click('data-qa-resize');await wait(30);
    geometry=await evaluate("(()=>{const shell=document.querySelector('#arc-canvas-width-qa [data-qa-pane-shell]');return {available:shell.clientWidth,pane:shell.querySelector('.arc-width-panel').getBoundingClientRect().width,duration:getComputedStyle(shell.querySelector('.arc-width-panel')).transitionDuration}})()");assert.ok(Math.abs(geometry.pane-geometry.available*.8)<2);assert.ok(geometry.duration.split(',').every(n=>parseFloat(n)===0));
    await click('data-qa-pane');await wait(50);assert.equal(await evaluate("document.querySelector('#arc-canvas-width-qa [data-qa-pane-shell] .arc-width-panel')"),null);
    assert.equal(await evaluate("document.querySelector('#arc-canvas-width-qa').scrollWidth>innerWidth"),false);
    await evaluate('window.__arcCanvasWidthQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/CanvasWidthMotionQA.tsx").then(m=>{window.__arcCanvasWidthQA=m.installCanvasWidthMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-canvas-width-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await click('data-qa-history');
        if(frame===10)await click('data-qa-pane');
        if(frame===20)await click('data-qa-resize');
        if(frame===28)await click('data-qa-history');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-canvas-width-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-canvas-width-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual Canvas width views over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual Canvas history and width adapter passed: 200px history, selected restore payload, retained inert exit/reopen, percentage pane sizing, immediate resize/close, 412/1280 geometry and reduced motion. Synthetic content only.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcCanvasWidthQA?.dispose();true');ws.close();}
