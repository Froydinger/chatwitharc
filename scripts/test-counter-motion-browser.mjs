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
    await evaluate('import("/src/dev/CounterMotionQA.tsx").then(m=>{window.__arcCounterQA=m.installCounterMotionQA();return true})');
    await wait(100);
    const positions=await evaluate(`(async()=>{window.__arcCounterQA.update(98);const values=[];const start=performance.now();do{await new Promise(requestAnimationFrame);values.push(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#arc-counter-qa .arc-counter-strip')).transform).m42);}while(performance.now()-start<120);return values;})()`);
    if(reduced)assert.ok(positions.every(y=>y===-288));else assert.ok(positions.some(y=>y< -32 && y> -288),`Intermediate samples=${positions}`);
    await evaluate('window.__arcCounterQA.update(105);true');await wait(500);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#arc-counter-qa .arc-counter-strip")].map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).m42)'),[-32,0,-160]);
    for(const value of [-1,Infinity,NaN]) {
      await evaluate(`window.__arcCounterQA.update(${String(value)});true`);await wait(500);
      assert.equal(await evaluate('new DOMMatrixReadOnly(getComputedStyle(document.querySelector("#arc-counter-qa .arc-counter-strip")).transform).m42'),0);
    }
    assert.equal(await evaluate('document.querySelector("#arc-counter-qa").scrollWidth>innerWidth'),false);
    await evaluate('window.__arcCounterQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/CounterMotionQA.tsx").then(m=>{window.__arcCounterQA=m.installCounterMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-counter-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===5)await evaluate('window.__arcCounterQA.update(98);true');
        if(frame===8)await evaluate('window.__arcCounterQA.update(105);true');
        if(frame===20)await evaluate('window.__arcCounterQA.update(42);true');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===25)writeFileSync('/tmp/arc-counter-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-counter-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded counter over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Native counter passed: intermediate roll, interrupted update, added digit, invalid value normalization, reduced motion and mobile/desktop geometry.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcCounterQA?.dispose();true');ws.close();}
