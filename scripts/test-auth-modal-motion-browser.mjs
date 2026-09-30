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
const click = label => evaluate(`(()=>{const b=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click();return true})()`);
const type = (selector,value) => evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const originalTheme = await evaluate('document.documentElement.className');
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true])for(const theme of ['light','dark']) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate(`document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(${JSON.stringify(theme)});true`);
    await evaluate('import("/src/dev/AuthModalMotionQA.tsx").then(m=>{window.__arcAuthModalQA=m.installAuthModalMotionQA();return true})');await wait(500);
    assert.ok(await evaluate("document.querySelector('[role=\"dialog\"]').textContent.includes('Sign in for research')"));
    const state=await evaluate(`(()=>{const dialog=document.querySelector('[role="dialog"]'),r=dialog.getBoundingClientRect();return {left:r.left,right:r.right,animation:getComputedStyle(dialog.querySelector('.arc-auth-modal-logo')).animationName,blobs:[...dialog.querySelectorAll('.arc-auth-modal-blob')].map(n=>getComputedStyle(n).animationName)}})()`);
    assert.ok(state.left>=-1&&state.right<=width+1);assert.equal(state.animation,reduced?'none':'arc-auth-modal-logo');assert.ok(state.blobs.every(n=>n===(reduced?'none':'arc-auth-modal-blob')));
    const closeRect=await evaluate("(()=>{const r=document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:closeRect.x,y:closeRect.y});await wait(200);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]')).scale"),reduced?'1':'1.1');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
    await type('[role="dialog"] #email','fixture@example.invalid');await wait(50);
    await evaluate("document.querySelector('[role=\"dialog\"] .arc-auth-modal-icon:not([aria-label=\"Close\"])').click()");
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"] #password').type"),'text');
    await click('Hide email form');await wait(30);
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"] .t-acc-panel-inner').hasAttribute('inert')"),true);
    await wait(400);assert.equal(await evaluate("document.querySelector('[role=\"dialog\"] #email')"),null);
    await click('Use email instead');await wait(400);
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"] #email').value"),'fixture@example.invalid');
    await evaluate("[...document.querySelectorAll('[role=\"dialog\"] button')].find(b=>b.textContent.trim()==='Sign Up'&&b.type!=='submit').click()");await wait(50);
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"] #password').autocomplete"),'new-password');
    await evaluate("document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]').click()");await wait(400);
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"]')"),null);
    await evaluate("document.querySelector('[data-qa-auth-open]').click()");await wait(400);
    assert.ok(await evaluate("!!document.querySelector('[role=\"dialog\"]')"));
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(400);
    assert.equal(await evaluate("document.querySelector('[role=\"dialog\"]')"),null);
    await evaluate('window.__arcAuthModalQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate("document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');true");
    const folder=mkdtempSync('/tmp/arc-auth-modal-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('import("/src/dev/AuthModalMotionQA.tsx").then(m=>{window.__arcAuthModalQA=m.installAuthModalMotionQA();return true})');
        if(frame===12)await click('Hide email form');
        if(frame===24)await click('Use email instead');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===32)writeFileSync('/tmp/arc-auth-modal-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-auth-modal-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual auth modal over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual auth modal passed: light/dark at 412/1280, loops/reduced motion, email collapse/inert/restore, password reveal, sign-up switching, close/reopen and Escape. No auth submission.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate(`window.__arcAuthModalQA?.dispose();document.documentElement.className=${JSON.stringify(originalTheme)};true`);ws.close();}
