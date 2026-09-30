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
 for(const width of [412,1280])for(const reduced of [false,true]) {
  await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
  await evaluate('import("/src/dev/SearchCanvasMotionQA.tsx").then(m=>{window.__arcSearchQA=m.installSearchCanvasMotionQA();return true})');await wait(250);
  const sources=`[...document.querySelectorAll('#arc-search-canvas-qa button')].find(n=>n.textContent.trim()==='Sources')`;
  assert.ok(await evaluate(`!!(${sources})`));await evaluate(`${sources}.click();true`);await wait(450);
  assert.ok(await evaluate(`!!document.querySelector('#arc-search-canvas-qa a[href=\"https://example.com/bicycle\"]')`));
  await evaluate(`${sources}.click();true`);await wait(40);
  assert.ok(await evaluate(`!!document.querySelector('#arc-search-canvas-qa .t-acc[data-open="false"] [aria-hidden="true"]')`));
  await evaluate(`${sources}.click();true`);await wait(450);
  assert.equal(await evaluate('document.querySelector("#arc-search-canvas-qa").scrollWidth>innerWidth'),false);
  const history=`[...document.querySelectorAll('#arc-search-canvas-qa button')].find(n=>n.textContent.includes('History'))`;
  await evaluate(`${history}.click();true`);await wait(450);
  assert.ok(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('Recent Searches')`));
  await evaluate(`${history}.click();true`);await wait(450);
  assert.equal(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('Recent Searches')`),false);
  if(width===412){await evaluate(`document.querySelector('#arc-search-canvas-qa button[aria-label="Saved links"]').click();true`);await wait(450);assert.ok(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('Synthetic saved link')`));await evaluate(`document.querySelector('#arc-search-canvas-qa button[aria-label="Saved links"]').click();true`);await wait(450);}
  if(width===412){await evaluate(`document.querySelector('#arc-search-canvas-qa button[aria-label="Saved links"]').click();true`);await wait(450);}
  await evaluate(`[...document.querySelectorAll('#arc-search-canvas-qa button')].find(n=>n.textContent.trim()==='Select').click();true`);await wait(100);
  await evaluate(`document.querySelector('#arc-search-canvas-qa .lucide-square').closest('button').click();true`);await wait(450);
  assert.ok(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('1 selected')`));
  await evaluate(`document.querySelector('#arc-search-canvas-qa .lucide-square-check-big').closest('button').click();true`);await wait(450);
  assert.equal(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('1 selected')`),false);
  await evaluate('window.__arcSearchQA.pending();true');await wait(450);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#arc-search-canvas-qa .arc-search-spinner')).animationName`),reduced?'none':'arc-search-spin');
  await evaluate('window.__arcSearchQA.searching(true);true');await wait(450);
  assert.ok(await evaluate(`document.querySelector('#arc-search-canvas-qa').textContent.includes('Searching the web...')`));
  if(reduced)assert.equal(await evaluate(`getComputedStyle(document.querySelector('#arc-search-canvas-qa .arc-search-enter')).animationName`),'none');
  await evaluate('window.__arcSearchQA.searching(false);true');await wait(450);
  await evaluate('window.__arcSearchQA.dispose();true');
 }
 if(process.env.ARC_RECORD_MOTION==='1') {
  await call('Emulation.setEmulatedMedia',{features:[]});await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});
  await evaluate('import("/src/dev/SearchCanvasMotionQA.tsx").then(m=>{window.__arcSearchQA=m.installSearchCanvasMotionQA();return true})');await wait(250);
  const folder=mkdtempSync('/tmp/arc-search-frames-');const start=performance.now();
  try{for(let frame=0;frame<36;frame++){
   if(frame===2||frame===16)await evaluate(`[...document.querySelectorAll('#arc-search-canvas-qa button')].find(n=>n.textContent.trim()==='Sources').click();true`);
   if(frame===20)await evaluate(`[...document.querySelectorAll('#arc-search-canvas-qa button')].find(n=>n.textContent.includes('History')).click();true`);
   const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===30)writeFileSync('/tmp/arc-search-native-frame.png',bytes);await wait(60);
  }const duration=(performance.now()-start)/1000;execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-search-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded search workspace over ${duration.toFixed(2)}s`);}finally{rmSync(folder,{recursive:true,force:true});}
 }
 console.log('Actual SearchCanvas passed source panel open/close/reopen and mobile/desktop reduced-motion geometry. Synthetic data; no search request.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcSearchQA?.dispose();true');ws.close();}
