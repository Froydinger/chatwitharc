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
const type = (selector,value) => evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const click = text => evaluate(`(()=>{const button=[...document.querySelectorAll('#arc-public-pages-qa button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Button missing');button.click();return true})()`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/PublicPagesMotionQA.tsx").then(m=>{window.__arcPublicQA=m.installPublicPagesMotionQA();return true})');await wait(500);
    const count=await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length");assert.ok(count>5);
    await evaluate("window.__arcBlogNodes=new Map([...document.querySelectorAll('#arc-public-pages-qa [data-layout-row]')].map(n=>[n.dataset.layoutRow,n]));[...document.querySelectorAll('#arc-public-pages-qa button')].find(n=>n.textContent.includes('Canvas & Code')).click();true");await wait(25);
    const filtered=await evaluate("(()=>{const nodes=[...document.querySelectorAll('#arc-public-pages-qa [data-layout-row]')];return {count:nodes.length,same:nodes.every(n=>window.__arcBlogNodes.get(n.dataset.layoutRow)===n),moving:nodes.some(n=>n.getAnimations().some(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)))}})()");
    assert.ok(filtered.count>0&&filtered.count<count);assert.equal(filtered.same,true);assert.equal(filtered.moving,!reduced);
    await wait(400);await click('Reset Filters');await wait(400);
    await type('#arc-public-pages-qa input[placeholder^="Search guides"]','zzzz-no-guide-fixture');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length"),0);
    assert.ok(await evaluate("document.querySelector('#arc-public-pages-qa').textContent.includes('No guides found')"));
    await click('Reset Filters');await wait(400);assert.equal(await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length"),count);
    const href=await evaluate("document.querySelector('#arc-public-pages-qa [data-layout-row] a').getAttribute('href')");
    await evaluate("document.querySelector('#arc-public-pages-qa [data-layout-row] a').click()");await wait(100);
    assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa [data-qa-page-path]').dataset.qaPagePath"),href);
    assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa').scrollWidth>innerWidth"),false);
    await evaluate("window.__arcPublicQA.render('docs');true");await wait(500);
    const docsCount=await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length");assert.ok(docsCount>5);
    await evaluate("document.querySelector('#arc-public-pages-qa [aria-expanded=\"false\"]').click()");await wait(450);
    assert.ok(await evaluate("!!document.querySelector('#arc-public-pages-qa [aria-expanded=\"true\"]')"));
    await evaluate("document.querySelector('#arc-public-pages-qa [aria-expanded=\"true\"]').click()");await wait(450);
    assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa [aria-expanded=\"true\"]')"),null);
    await click('AI Models');await wait(400);
    const modelDocs=await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length");assert.ok(modelDocs>0&&modelDocs<docsCount);
    await click('All Topics');await wait(400);
    await type('#arc-public-pages-qa input[placeholder^="Search documentation"]','zzzz-no-doc-fixture');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length"),0);
    assert.ok(await evaluate("document.querySelector('#arc-public-pages-qa').textContent.includes('No documentation found')"));
    await type('#arc-public-pages-qa input[placeholder^="Search documentation"]','');await wait(400);
    assert.equal(await evaluate("document.querySelectorAll('#arc-public-pages-qa [data-layout-row]').length"),docsCount);
    assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa').scrollWidth>innerWidth"),false);
    await evaluate("window.__arcPublicQA.render('downloads');true");await wait(500);
    await evaluate("[...document.querySelectorAll('#arc-public-pages-qa button')].find(n=>n.textContent.includes('macOS')).click()");await wait(20);
    if(!reduced)assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa [data-motion-state=\"closed\"]').hasAttribute('inert')"),true);
    await wait(500);
    assert.ok(await evaluate("document.querySelector('#arc-public-pages-qa').textContent.includes('Version fixture')"));
    const buttons=await evaluate("[...document.querySelectorAll('#arc-public-pages-qa button')].map(n=>n.textContent.trim())");
    const back=buttons.find(n=>/back|platform/i.test(n)&&!n.includes('Download'));assert.ok(back);await click(back);await wait(500);
    assert.ok(await evaluate("document.querySelector('#arc-public-pages-qa').textContent.includes('Choose your platform')"));
    assert.equal(await evaluate("document.querySelector('#arc-public-pages-qa').scrollWidth>innerWidth"),false);
    await evaluate('window.__arcPublicQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/PublicPagesMotionQA.tsx").then(m=>{window.__arcPublicQA=m.installPublicPagesMotionQA();return true})');await wait(400);
    await evaluate("document.querySelector('#arc-public-pages-qa [data-layout-row]').scrollIntoView({block:'start'});true");
    const folder=mkdtempSync('/tmp/arc-public-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<48;frame++) {
        if(frame===0)await evaluate("[...document.querySelectorAll('#arc-public-pages-qa button')].find(n=>n.textContent.includes('Canvas & Code')).click();true");
        if(frame===14){await evaluate("window.__arcPublicQA.render('docs');true");await wait(100);await evaluate("document.querySelector('#arc-public-pages-qa [aria-expanded=\"false\"]').click();true");}
        if(frame===28){await evaluate("window.__arcPublicQA.render('downloads');true");await wait(100);await evaluate("[...document.querySelectorAll('#arc-public-pages-qa button')].find(n=>n.textContent.includes('macOS')).click();true");}
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===23)writeFileSync('/tmp/arc-public-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(48/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-public-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual public pages over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual public pages passed: blog search/reset/article navigation, docs search/accordion, download platform/back transitions and inert exit, 412/1280 geometry and reduced motion. No downloads or account writes.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcPublicQA?.dispose();true');ws.close();}
