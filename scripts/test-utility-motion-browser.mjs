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
  await call("Page.reload"); await wait(1000);
  await evaluate('import("/src/dev/UtilityMotionQA.tsx").then(m=>{window.__arcUtilityQA=m.installUtilityMotionQA();return true})');
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    for(const [page,selector] of [['auth','.arc-auth-logo'],['info','.arc-info-logo'],['404','.arc-lost-compass']]) {
      await evaluate(`window.__arcUtilityQA.render(${JSON.stringify(page)})`);await wait(550);
      const state=await evaluate(`(()=>{const host=document.querySelector('#arc-utility-motion-qa'),node=host.querySelector(${JSON.stringify(selector)});const css=getComputedStyle(node);return {animation:css.animationName,overflow:host.scrollWidth>host.clientWidth,text:host.textContent}})()`);
      assert.ok(reduced?state.animation==='none':state.animation!=='none');assert.equal(state.overflow,false,`Horizontal overflow: ${page} ${width}px reduced=${reduced}`);
      if(page==='info'){assert.ok(state.text.includes('GPT 6 & 6.1'));assert.ok(state.text.includes('Gemini Flash'));assert.ok(!state.text.includes('GPT-5.6'));}
      if(page==='auth') {
        await evaluate(`document.querySelector('#arc-utility-motion-qa button[aria-label="Show password"]').click()`);
        assert.equal(await evaluate('document.querySelector("#arc-utility-motion-qa #password").type'),'text');
        await evaluate(`(()=>{[...document.querySelectorAll('#arc-utility-motion-qa button')].find(b=>b.textContent.trim()==='Forgot password?').click()})()`);await wait(100);
        assert.equal(await evaluate('document.querySelector("#arc-utility-motion-qa #password")'),null);
        await evaluate(`(()=>{[...document.querySelectorAll('#arc-utility-motion-qa button')].find(b=>b.textContent.trim()==='Back to sign in').click()})()`);await wait(100);
        assert.ok(await evaluate('!!document.querySelector("#arc-utility-motion-qa #password")'));
      }
      if(page==='404') {
        await evaluate(`(()=>{[...document.querySelectorAll('#arc-utility-motion-qa button')].find(b=>b.textContent.trim()==='Home').click()})()`);await wait(100);
        assert.equal(await evaluate('document.querySelector("#arc-utility-motion-qa [data-qa-path]").dataset.qaPath'),'/');
      }
    }
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    const folder=mkdtempSync('/tmp/arc-utility-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('window.__arcUtilityQA.render("auth")');
        if(frame===12)await evaluate('window.__arcUtilityQA.render("info")');
        if(frame===24)await evaluate('window.__arcUtilityQA.render("404")');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===32)writeFileSync('/tmp/arc-utility-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-utility-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual utility screens over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual utility screens passed: 412/1280 geometry, loops/reduced motion, current mode copy, password reveal/mode switching and 404 navigation. No auth submission.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcUtilityQA?.dispose();true');ws.close();}
