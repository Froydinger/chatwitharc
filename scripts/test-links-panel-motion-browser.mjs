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
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);
const type = (selector,value) => evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const menu = async () => {
  const point=await evaluate("(()=>{const r=document.querySelector('#arc-links-panel-qa .lucide-ellipsis').closest('button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await wait(150);
};
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/LinksPanelMotionQA.tsx").then(m=>{window.__arcLinksQA=m.installLinksPanelMotionQA();return true})');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-links-panel-qa [data-layout-row]').length"),2);
    const first=await evaluate("document.querySelector('#arc-links-panel-qa [data-layout-row=\"link-2\"]').dataset.layoutRow");assert.equal(first,'link-2');
    await click('#arc-links-panel-qa [data-layout-row="link-1"] button:last-child');await wait(30);
    assert.deepEqual(await evaluate('window.__arcLinksQA.calls[0]'),{kind:'remove',id:'default',linkId:'link-1'});
    assert.equal(await evaluate("document.querySelector('#arc-links-panel-qa [data-layout-row=\"link-2\"]').getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).length"),reduced?0:1);
    await wait(300);
    await click('#arc-links-panel-qa [aria-expanded="true"]');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-links-panel-qa [data-layout-row]').length"),0);
    await click('#arc-links-panel-qa [aria-expanded="false"]');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-links-panel-qa [data-layout-row]').length"),1);
    await click('#arc-links-panel-qa button:has(.lucide-folder-plus)');await wait(300);
    await type('[role="dialog"] input','  Fixture list  ');await wait(50);
    await evaluate("[...document.querySelectorAll('[role=\"dialog\"] button')].find(b=>b.textContent.trim()==='Create').click()");await wait(400);
    assert.equal(await evaluate('window.__arcLinksQA.calls[1].name'),'Fixture list');
    await menu();await evaluate("[...document.querySelectorAll('[role=\"menuitem\"]')].find(n=>n.textContent.includes('Rename')).click()");await wait(100);
    await type('#arc-links-panel-qa input','  Updated reading  ');await wait(50);
    await evaluate("document.querySelector('#arc-links-panel-qa input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true");await wait(150);
    assert.equal(await evaluate('window.__arcLinksQA.calls[2].name'),'Updated reading');
    await menu();await evaluate("[...document.querySelectorAll('[role=\"menuitem\"]')].find(n=>n.textContent.includes('Delete')).click()");await wait(150);
    assert.equal(await evaluate('window.__arcLinksQA.calls.at(-1).kind'),'delete');
    assert.equal(await evaluate("document.querySelector('#arc-links-panel-qa').scrollWidth>innerWidth"),false);
    await evaluate('window.__arcLinksQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/LinksPanelMotionQA.tsx").then(m=>{window.__arcLinksQA=m.installLinksPanelMotionQA();return true})');await wait(400);
    const folder=mkdtempSync('/tmp/arc-links-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await click('#arc-links-panel-qa [data-layout-row="link-1"] button:last-child');
        if(frame===12)await click('#arc-links-panel-qa [aria-expanded="true"]');
        if(frame===24)await click('#arc-links-panel-qa [aria-expanded="false"]');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===32)writeFileSync('/tmp/arc-links-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-links-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual Links panel over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual Links panel passed: row removal/movement, collapse/reopen, create/rename/delete callbacks, trim handling, 412/1280 geometry and reduced motion. Isolated synthetic links only.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcLinksQA?.dispose();true');ws.close();}
