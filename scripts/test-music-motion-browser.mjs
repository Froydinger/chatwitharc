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
const click = expression=>evaluate(`${expression}.click();true`);
const control = label => click(`[...document.querySelectorAll('#arc-music-motion-qa button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)})`);
const height = ()=>evaluate('parseFloat(document.querySelector("#arc-music-motion-qa .snd-box").style.height)');
try{
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/MusicMotionQA.tsx").then(m=>{window.__arcMusicQA=m.installMusicMotionQA();return true})');await wait(150);
    assert.equal(await height(),189);
    await control('Play');await wait(350);assert.equal(await evaluate('document.querySelector("#arc-music-motion-qa [aria-label=Pause]").getAttribute("aria-pressed")'),'true');
    await control('Previous track');await control('Next track');await control('Add to liked songs');
    await evaluate('(()=>{const n=document.querySelector("#arc-music-motion-qa input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,"60");n.dispatchEvent(new Event("input",{bubbles:true}));return true})()');await wait(50);
    assert.deepEqual(await evaluate('window.__arcMusicQA.calls'),['play','previous','next','like','seek:60']);
    await control('Collapse the player');await wait(50);const middle=await height();if(reduced)assert.equal(middle,78);else assert.ok(middle>78&&middle<189);
    await wait(550);assert.equal(await height(),78);assert.equal(await evaluate('document.querySelector("#arc-music-motion-qa .snd-like").tabIndex'),-1);
    await control('Open the player');await wait(550);assert.equal(await height(),189);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:24,y:500});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:24,y:500});await wait(550);assert.equal(await height(),78);
    assert.equal(await evaluate('document.querySelector("#arc-music-motion-qa").scrollWidth>innerWidth'),false);
    await evaluate('window.__arcMusicQA.dispose();true');
  }
  await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('import("/src/dev/MusicMotionQA.tsx").then(m=>{window.__arcMusicQA=m.installMusicMotionQA();return true})');
  await control('Collapse the player');await wait(40);await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(50);assert.equal(await height(),78);
  await evaluate('window.__arcMusicQA.dispose();true');
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/MusicMotionQA.tsx").then(m=>{window.__arcMusicQA=m.installMusicMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-music-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await control('Collapse the player');
        if(frame===10)await control('Open the player');
        if(frame===20)await control('Play');
        if(frame===28)await control('Add to liked songs');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-music-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-music-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual music panel over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual music panel passed: play/previous/next/like/seek callback ports, collapse tween and final geometry, keyboard availability, reopen/outside click, dynamic reduced-motion interruption and 412/1280. Audio actions replaced by local doubles; no audible playback.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcMusicQA?.dispose();true');ws.close();}
