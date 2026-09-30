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
  await evaluate('import("/src/dev/PromptLibraryMotionQA.tsx").then(m=>{window.__arcPromptQA=m.installPromptLibraryMotionQA();return true})');
  for(const width of [412,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    for(const reduced of [false,true]) {
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
      await evaluate('window.__arcPromptQA.render(true)');await wait(450);
      const tab=label=>evaluate(`(()=>{const el=[...document.querySelectorAll('[data-testid="arc-prompt-library"] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Missing tab');el.click()})()`);
      await tab('Reflect');await tab('Create');await wait(350);
      assert.equal(await evaluate('document.querySelector(".arc-prompt-card").textContent.trim()'),'create fixture');
      const geometry=await evaluate('(()=>{const n=document.querySelector("[data-testid=arc-prompt-library] .arc-transition-part").getBoundingClientRect();return {left:n.left,right:n.right,width:innerWidth}})()');
      assert.ok(geometry.left>=0&&geometry.right<=geometry.width,'Modal remains inside viewport');
      const before=await evaluate('Number(document.querySelector("#arc-prompt-library-qa").dataset.selected||0)');
      await evaluate('document.querySelector(".arc-prompt-card").click()');
      assert.equal(await evaluate('Number(document.querySelector("#arc-prompt-library-qa").dataset.selected)'),before+1);
      assert.equal(await evaluate('document.querySelector("#arc-prompt-library-qa").dataset.prompt'),'create captured prompt');
      if(!reduced)assert.equal(await evaluate('document.querySelector("[data-testid=arc-prompt-library]").hasAttribute("inert")'),true);
      await wait(200);assert.equal(await evaluate('document.querySelector("[data-testid=arc-prompt-library]")'),null,'Close removes modal');
      await evaluate('window.__arcPromptQA.render(true)');await wait(350);
      await evaluate(`document.querySelector('button[aria-label="Close prompt library"]').click()`);await wait(200);
      assert.equal(await evaluate('document.querySelector("[data-testid=arc-prompt-library]")'),null);
    }
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    const folder=mkdtempSync('/tmp/arc-prompt-library-frames-');const start=performance.now();
    try {
      await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
      await call('Emulation.setEmulatedMedia',{features:[]});
      for(let frame=0;frame<36;frame++) {
        if(frame===1)await evaluate('window.__arcPromptQA.render(true)');
        if(frame===12)await evaluate(`(()=>{[...document.querySelectorAll('[data-testid="arc-prompt-library"] button')].find(b=>b.textContent.trim()==='Reflect').click()})()`);
        if(frame===26)await evaluate('window.__arcPromptQA.render(false)');
        const capture=await call('Page.captureScreenshot',{format:'png'});
        const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);
        if(frame===20)writeFileSync('/tmp/arc-prompt-library-native-frame.png',bytes);
        await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-prompt-library-native-motion.mp4'],{stdio:'ignore'});
      console.log(`Recorded actual prompt library over ${duration.toFixed(2)}s`);
    } finally {rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual prompt-library browser checks passed: cached provider-free prompts, category coalescing, one selection/correct payload, inert exit, close, 412/1280 geometry and reduced motion.');
} finally {
  await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcPromptQA?.dispose();true');ws.close();
}
