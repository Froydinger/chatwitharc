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
const button = label => evaluate(`[...document.querySelectorAll('#arc-admin-support-qa button')].find(n=>n.textContent.trim()===${JSON.stringify(label)}).click();true`);
const input = (selector,value) => evaluate(`(()=>{const n=document.querySelector('#arc-admin-support-qa '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(n.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const pointerClick = async expression => {
  const point=await evaluate(`(()=>{const n=${expression};n.scrollIntoView({block:'center'});const b=n.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
};
const select = async (number,text)=>{await pointerClick(`document.querySelectorAll('#arc-admin-support-qa [role=combobox]')[${number}]`);await wait(80);await pointerClick(`[...document.querySelectorAll('[role=option]')].find(n=>n.textContent.includes(${JSON.stringify(text)}))`);};
try {
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate('import("/src/dev/AdminSupportMotionQA.tsx").then(m=>{window.__arcAdminSupportQA=m.installAdminSupportMotionQA();return true})');
    assert.equal(await evaluate('document.querySelectorAll("#arc-admin-support-qa [data-layout-row]").length'),1);
    await pointerClick('[...document.querySelectorAll("#arc-admin-support-qa [role=tab]")].find(n=>n.textContent==="All")');await wait(300);
    assert.equal(await evaluate('document.querySelectorAll("#arc-admin-support-qa [data-layout-row]").length'),2);
    await input('input[placeholder="Search tickets or users..."]','qa@example.com');await wait(100);
    assert.equal(await evaluate('document.querySelectorAll("#arc-admin-support-qa [data-layout-row]").length'),1);
    await evaluate('document.querySelector("#arc-admin-support-qa [data-layout-row] .cursor-pointer").click();true');assert.deepEqual(await evaluate('window.__arcAdminSupportQA.calls'),['ticket:resolved']);
    await input('input[placeholder="Search tickets or users..."]','nothing-matches');await wait(50);assert.ok(await evaluate('document.querySelector("#arc-admin-support-qa").textContent.includes("No tickets found")'));
    await input('input[placeholder="Search tickets or users..."]','');
    await button('New Ticket');await wait(350);await input('input[placeholder="Subject"]','Subject QA');await input('textarea','Body QA');
    assert.equal(await evaluate('[...document.querySelectorAll("#arc-admin-support-qa button")].find(n=>n.textContent.trim()==="Create & Assign").disabled'),true);
    await select(0,'Synthetic Person');await select(1,'High');await button('Create & Assign');assert.deepEqual(await evaluate('window.__arcAdminSupportQA.calls'),['ticket:resolved','create:person:high:Subject QA:Body QA']);
    await button('Cancel');await wait(20);if(!reduced)assert.ok(await evaluate('document.querySelector("#arc-admin-support-qa textarea").closest("[inert]")!==null'));
    await button('New Ticket');await wait(350);assert.equal(await evaluate('document.querySelector("#arc-admin-support-qa input[placeholder=Subject]").value'),'Subject QA');
    await button('Cancel');await wait(400);assert.equal(await evaluate('document.querySelector("#arc-admin-support-qa textarea")'),null);
    assert.equal(await evaluate('document.querySelector("#arc-admin-support-qa").scrollWidth>innerWidth'),false);await evaluate('window.__arcAdminSupportQA.dispose();true');
  }
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/AdminSupportMotionQA.tsx").then(m=>{window.__arcAdminSupportQA=m.installAdminSupportMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-admin-support-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await button('New Ticket');
        if(frame===10){await input('input[placeholder=Subject]','Subject QA');await input('textarea','Body QA');await select(0,'Synthetic Person');await select(1,'High');}
        if(frame===20)await button('Cancel');
        if(frame===28)await button('New Ticket');
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-admin-support-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-admin-support-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual admin support view over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual admin support view and filter passed: status tabs, email search, empty results, selection, required assignment, priority/subject/body payload, inert cancellation/reopen/draft retention, removal, reduced motion and 412/1280 geometry. No backend writes.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcAdminSupportQA?.dispose();true');ws.close();}
