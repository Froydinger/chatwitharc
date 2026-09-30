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
    await evaluate('import("/src/dev/AppLoadersMotionQA.tsx").then(m=>{window.__arcLoadersQA=m.installAppLoadersMotionQA();return true})');await wait(150);
    assert.equal(await evaluate("document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader').dataset.stage"),'spin');
    const animation=await evaluate("getComputedStyle(document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader-logo')).animationName");assert.ok(reduced?animation==='none':animation.includes('arc-loader-spin'));
    const rect=await evaluate("(()=>{const r=document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader-logo').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");assert.ok(Math.abs(rect.x-width/2)<1&&Math.abs(rect.y-915/2)<1);
    await wait(1600);
    assert.equal(await evaluate("document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader').dataset.stage"),'bloop');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader')).opacity"),'0');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-app-loaders-qa .arc-fullscreen-loader-logo')).scale"),'0');
    await evaluate("window.__arcLoadersQA.render('fast');true");await wait(100);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-app-loaders-qa .arc-fast-loader-logo')).animationName"),reduced?'none':'arc-loader-turn');
    if(reduced)assert.equal(await evaluate("getComputedStyle(document.querySelector('#arc-app-loaders-qa .arc-loader-halo')).animationName"),'none');
    await evaluate("(()=>{window.__arcLoaderTimeout=window.setTimeout;window.__arcLoaderClear=window.clearTimeout;window.__arcLoaderScheduled=[];window.__arcLoaderCleared=[];window.setTimeout=(handler,delay,...args)=>{const id=window.__arcLoaderTimeout(handler,delay,...args);if(delay===1000)window.__arcLoaderScheduled.push(id);return id;};window.clearTimeout=id=>{window.__arcLoaderCleared.push(id);window.__arcLoaderClear(id);};return true})()");
    await evaluate("window.__arcLoadersQA.render('full');true");await wait(50);
    assert.equal(await evaluate('window.__arcLoaderScheduled.length'),1);
    await evaluate('window.__arcLoadersQA.dispose();true');
    assert.ok(await evaluate('window.__arcLoaderCleared.includes(window.__arcLoaderScheduled[0])'));
    await evaluate('window.setTimeout=window.__arcLoaderTimeout;window.clearTimeout=window.__arcLoaderClear;delete window.__arcLoaderTimeout;delete window.__arcLoaderClear;true');await wait(1100);
    assert.equal(await evaluate("document.querySelector('#arc-app-loaders-qa')"),null);
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    const folder=mkdtempSync('/tmp/arc-loaders-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await evaluate('import("/src/dev/AppLoadersMotionQA.tsx").then(m=>{window.__arcLoadersQA=m.installAppLoadersMotionQA();return true})');
        if(frame===18)await evaluate("window.__arcLoadersQA.render('fast');true");
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===5)writeFileSync('/tmp/arc-loaders-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-loaders-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual app loaders over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual app loaders passed: centered 412/1280 geometry, one-second phase/final fade, fast rotation, reduced motion and timer teardown. No auth/routing operations.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcLoadersQA?.dispose();if(window.__arcLoaderTimeout)window.setTimeout=window.__arcLoaderTimeout;if(window.__arcLoaderClear)window.clearTimeout=window.__arcLoaderClear;true');ws.close();}
