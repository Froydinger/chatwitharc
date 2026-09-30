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
const button = label => evaluate(`[...document.querySelectorAll('#arc-support-motion-qa button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}).click();true`);
const input = (selector,value) => evaluate(`(()=>{const n=document.querySelector('#arc-support-motion-qa '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(n.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/SupportMotionQA.tsx").then(m=>{window.__arcSupportQA=m.installSupportMotionQA();return true})');
    assert.equal(await evaluate('document.querySelector("#arc-support-motion-qa input")'),null);
    await button('New Ticket');await wait(350);
    assert.equal(await evaluate('[...document.querySelectorAll("#arc-support-motion-qa button")].find(n=>n.textContent.trim()==="Submit Ticket").disabled'),true);
    await input('input','Subject QA');await input('textarea','Body QA');await wait(50);
    await button('Submit Ticket');assert.deepEqual(await evaluate('window.__arcSupportQA.calls'),['create:Subject QA:Body QA']);
    await button('Cancel');await wait(20);
    if(!reduced)assert.ok(await evaluate('document.querySelector("#arc-support-motion-qa input").closest("[inert]")!==null'));
    await button('New Ticket');await wait(350);assert.equal(await evaluate('document.querySelector("#arc-support-motion-qa input").value'),'Subject QA');
    await button('Cancel');await wait(400);assert.equal(await evaluate('document.querySelector("#arc-support-motion-qa input")'),null);
    await evaluate('[...document.querySelectorAll("#arc-support-motion-qa h3")].find(n=>n.textContent==="Synthetic ticket").closest(".cursor-pointer").click();true');
    assert.deepEqual(await evaluate('window.__arcSupportQA.calls'),['create:Subject QA:Body QA','ticket:one']);
    assert.equal(await evaluate('document.querySelector("#arc-support-motion-qa").scrollWidth>innerWidth'),false);
    await evaluate('window.__arcSupportQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/SupportMotionQA.tsx").then(m=>{window.__arcSupportQA=m.installSupportMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-support-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await button('New Ticket');
        if(frame===10){await input('input','Subject QA');await input('textarea','Body QA');}
        if(frame===20)await button('Cancel');
        if(frame===28)await button('New Ticket');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-support-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-support-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual support view over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual support view passed: create disabled/enable, controlled subject/body, callback payload, cancel inert exit/reopen with draft, final removal, ticket selection, 412/1280 geometry and reduced motion. No ticket writes or emails.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcSupportQA?.dispose();true');ws.close();}
