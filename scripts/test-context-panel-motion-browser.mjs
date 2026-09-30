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
const click = label => evaluate(`(()=>{const b=[...document.querySelectorAll('#arc-context-panel-qa button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click();return true})()`);
const type = value => evaluate(`(()=>{const t=document.querySelector('#arc-context-panel-qa textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/ContextPanelMotionQA.tsx").then(m=>{window.__arcContextQA=m.installContextPanelMotionQA();return true})');await wait(400);
    await click('Tell Arc');await wait(400);
    assert.equal(await evaluate("[...document.querySelectorAll('#arc-context-panel-qa button')].find(b=>b.textContent.trim()==='Save summary').disabled"),true);
    await type('  Fixture summary  ');await wait(50);await click('Save summary');await wait(400);
    assert.deepEqual(await evaluate('window.__arcContextQA.calls'),[{kind:'add',content:'Fixture summary'}]);
    await click('Edit summary');await wait(400);
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa textarea').value"),'Fixture summary');
    await type('Updated fixture');await wait(50);await click('Save summary');await wait(400);
    assert.deepEqual(await evaluate('window.__arcContextQA.calls[1]'),{kind:'edit',id:'fixture-memory',content:'Updated fixture'});
    await click('Edit summary');await wait(400);await click('Cancel');await wait(30);
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa .t-acc-panel-inner').hasAttribute('inert')"),true);
    await wait(400);assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa textarea')"),null);
    await click('Edit summary');await wait(400);await click('Cancel');await wait(20);await click('Edit summary');await wait(400);
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa textarea').value"),'Updated fixture');
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa .t-acc-panel-inner').hasAttribute('inert')"),false);
    await click('Cancel');await wait(400);
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa').scrollWidth>innerWidth"),false);
    await evaluate("document.querySelector('#arc-context-panel-qa button[title=\"Clear living memory\"]').click()");await wait(100);
    assert.equal(await evaluate('window.__arcContextQA.calls[2].kind'),'clear');
    assert.ok(await evaluate("document.querySelector('#arc-context-panel-qa').textContent.includes('Your living memory is empty')"));
    await evaluate('document.body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));true');await wait(400);
    assert.equal(await evaluate("document.querySelector('#arc-context-panel-qa .arc-transition-modal')"),null);
    await evaluate("document.querySelector('#arc-context-panel-qa [data-qa-open]').click()");await wait(400);
    assert.ok(await evaluate("!!document.querySelector('#arc-context-panel-qa .arc-transition-modal[data-motion-state=\"open\"]')"));
    await evaluate('window.__arcContextQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/ContextPanelMotionQA.tsx").then(m=>{window.__arcContextQA=m.installContextPanelMotionQA();return true})');await wait(400);
    const folder=mkdtempSync('/tmp/arc-context-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await click('Tell Arc');
        if(frame===10)await type('A synthetic memory summary');
        if(frame===18)await click('Cancel');
        if(frame===25)await click('Tell Arc');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===32)writeFileSync('/tmp/arc-context-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-context-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual context panel over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual context panel passed: add/edit/cancel/clear callbacks, trimmed payloads, reopen during exit, inert close, 412/1280 geometry and reduced motion. Synthetic memory only.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcContextQA?.dispose();true');ws.close();}
