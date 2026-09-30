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
const key = value => evaluate(`(()=>{document.querySelector('[aria-roledescription="carousel"]').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true}));return true})()`);
const active = () => evaluate(`Number([...document.querySelectorAll('#arc-search-carousel-qa button[aria-label^="Open search image"]')].find(b=>b.tabIndex===0).getAttribute('aria-label').match(/image (\\d+)/)[1])`);
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/SearchCarouselMotionQA.tsx").then(m=>{window.__arcSearchQA=m.installSearchCarouselMotionQA();return true})');await wait(500);
    assert.equal(await active(),1);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.arc-search-image-float')).animationName"),reduced?'none':'arc-search-image-float');
    assert.equal(await evaluate("document.querySelector('#arc-search-carousel-qa').scrollWidth>innerWidth"),false);
    assert.ok(await evaluate("!!document.querySelector('#arc-search-carousel-qa table')"));
    await key('ArrowRight');await wait(500);assert.equal(await active(),2);
    await key('End');await wait(500);assert.equal(await active(),4);
    await key('ArrowRight');await wait(500);assert.equal(await active(),1);
    await key('ArrowLeft');await wait(500);assert.equal(await active(),4);
    await key('Home');await wait(500);assert.equal(await active(),1);
    await evaluate("document.querySelector('button[aria-label=\"Show search result image 3\"]').click()");await wait(500);assert.equal(await active(),3);
    const rect=await evaluate("(()=>{const r=document.querySelector('[aria-roledescription=\"carousel\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100}})()");
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
    for(let step=1;step<=5;step++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x-step*25,y:rect.y,buttons:1});await wait(25);}
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x-125,y:rect.y,button:'left',clickCount:1});await wait(500);
    assert.equal(await evaluate("document.querySelector('[data-held]').dataset.held"),'false');assert.notEqual(await active(),3);
    assert.equal(await evaluate("document.querySelector('img[alt=\"Search result\"]')"),null,'Dragging must not open an image');
    await key('Home');await wait(500);
    await evaluate("[...document.querySelectorAll('#arc-search-carousel-qa button[aria-label^=\"Open search image\"]')].find(b=>b.tabIndex===0).click()");await wait(400);
    assert.ok(await evaluate("!!document.querySelector('img[alt=\"Search result\"]')"),'Intentional click opens full image');
    await evaluate("document.querySelector('img[alt=\"Search result\"]').closest('.arc-transition-fade').querySelector('button .lucide-x').closest('button').click()");await wait(400);
    // Cancel old interpolation when the result's image set changes.
    await key('ArrowRight');await wait(50);await evaluate('window.__arcSearchQA.render(2)');await wait(500);assert.equal(await active(),1);
    await key('ArrowRight');await wait(50);await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(100);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.arc-search-image-float')).animationName"),'none');
    await call('Emulation.setEmulatedMedia',{features:[]});await wait(50);
    await key('Home');await wait(500);
    await evaluate("document.querySelector('[aria-roledescription=\"carousel\"]').style.transitionDuration='0s'");
    await key('ArrowRight');await wait(50);assert.equal(await active(),2,'Zero-duration preference settles immediately');
    await evaluate('window.__arcSearchQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/SearchCarouselMotionQA.tsx").then(m=>{window.__arcSearchQA=m.installSearchCarouselMotionQA();return true})');await wait(500);
    const folder=mkdtempSync('/tmp/arc-search-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await key('ArrowRight');
        if(frame===12)await key('End');
        if(frame===24)await key('Home');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===32)writeFileSync('/tmp/arc-search-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-search-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual search carousel over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual search carousel passed: 412/1280 geometry, shared markdown, keyboard wrap/Home/End, dots, native drag/click suppression, image modal, interrupted result replacement and dynamic reduced motion. Local synthetic images only.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcSearchQA?.dispose();true');ws.close();}
