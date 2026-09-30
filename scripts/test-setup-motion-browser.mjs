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
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/SetupMotionQA.tsx").then(m=>{window.__arcSetupQA=m.installSetupMotionQA();return true})');await wait(500);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-setup-motion-qa .arc-auth-logo')).animationName"),reduced?'none':'arc-auth-logo-rotate');
    assert.equal(await evaluate("[...document.querySelectorAll('#arc-setup-motion-qa button')].find(b=>b.textContent.includes('Get Started')).disabled"),true);
    await evaluate("(()=>{const n=document.querySelector('#arc-setup-motion-qa #displayName');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'Fixture');n.dispatchEvent(new Event('input',{bubbles:true}));return true})()");await wait(50);
    assert.equal(await evaluate("[...document.querySelectorAll('#arc-setup-motion-qa button')].find(b=>b.textContent.includes('Get Started')).disabled"),false);
    assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa').scrollWidth>innerWidth"),false);
    await evaluate("window.__arcSetupQA.render('mac');true");await wait(450);
    await evaluate("document.querySelector('#arc-setup-motion-qa button[aria-label=\"Not now\"]').click()");await wait(20);
    if(!reduced)assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa .arc-transition-panel').hasAttribute('inert')"),true);
    await wait(450);assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa .arc-transition-panel')"),null);
    await evaluate("document.querySelector('#arc-setup-motion-qa [data-qa-reopen]').click()");await wait(450);
    await evaluate("[...document.querySelectorAll('#arc-setup-motion-qa button')].find(b=>b.textContent.includes('Download for Mac')).click()");await wait(450);
    assert.deepEqual(await evaluate('window.__arcSetupQA.calls'),['dismiss','download']);
    await evaluate('window.__arcSetupQA.dispose();true');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
  await evaluate("window.__arcMacDecision=localStorage.getItem('arcai-mac-install-decision-at');localStorage.removeItem('arcai-mac-install-decision-at');true");
  await evaluate('import("/src/dev/SetupMotionQA.tsx").then(m=>{window.__arcSetupQA=m.installSetupMotionQA();window.__arcSetupQA.render("mac-policy","/downloads");return true})');await wait(2800);
  assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa .arc-transition-panel')"),null);
  assert.ok(await evaluate('import("/src/utils/platform.ts").then(m=>m.isMacDesktopBrowser())'),'Policy test requires the isolated Mac Chrome browser');
  await evaluate('window.__arcSetupQA.render("mac-policy","/");true');await wait(1000);
  assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa .arc-transition-panel')"),null);
  await wait(2000);assert.ok(await evaluate("!!document.querySelector('#arc-setup-motion-qa .arc-transition-panel')"));
  await evaluate("document.querySelector('#arc-setup-motion-qa button[aria-label=\"Not now\"]').click()");await wait(450);
  assert.ok(await evaluate("Number(localStorage.getItem('arcai-mac-install-decision-at'))>0"));
  await evaluate('window.__arcSetupQA.render("mac-policy","/elsewhere");true');await wait(2800);
  assert.equal(await evaluate("document.querySelector('#arc-setup-motion-qa .arc-transition-panel')"),null);
  await evaluate('window.__arcSetupQA.dispose();true');
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
    const folder=mkdtempSync('/tmp/arc-setup-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('import("/src/dev/SetupMotionQA.tsx").then(m=>{window.__arcSetupQA=m.installSetupMotionQA();return true})');
        if(frame===12)await evaluate("window.__arcSetupQA.render('mac');true");
        if(frame===24)await evaluate("document.querySelector('#arc-setup-motion-qa button[aria-label=\"Not now\"]').click()");
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===18)writeFileSync('/tmp/arc-setup-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-setup-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual setup views over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual setup views passed: onboarding required-name state, logo/reduced motion, 412/1280 geometry, Mac prompt callbacks, retained inert exit and reopen. No profile writes or downloads.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate("window.__arcSetupQA?.dispose();if(window.__arcMacDecision===null)localStorage.removeItem('arcai-mac-install-decision-at');else if(window.__arcMacDecision!==undefined)localStorage.setItem('arcai-mac-install-decision-at',window.__arcMacDecision);true");ws.close();}
