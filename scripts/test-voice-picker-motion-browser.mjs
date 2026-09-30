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
const button = name => `document.querySelector('#arc-voice-picker-qa button[title="${name}"]')`;
const point = async (name,dx=0,dy=0)=>evaluate(`(()=>{const b=${button(name)}.getBoundingClientRect();return {x:b.x+b.width/2+${dx},y:b.y+b.height/2+${dy}}})()`);
try{
  await call('Page.reload');await wait(1000);
  for(const width of [412,1280])for(const reduced of [false,true])for(const compact of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:width===412});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await evaluate(`import("/src/dev/VoicePickerMotionQA.tsx").then(m=>{window.__arcVoicePickerQA=m.installVoicePickerMotionQA(${compact});return true})`);
    assert.equal(await evaluate('document.querySelectorAll("#arc-voice-picker-qa button").length'),4);
    const names=await evaluate('[...document.querySelectorAll("#arc-voice-picker-qa button")].map(n=>n.title)');
    const second=names[1];await evaluate(`window.__arcVoiceNode=${button(second)};true`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...(await point(second,15,10))});await wait(250);
    const pull=await evaluate(`getComputedStyle(${button(second)}).translate`);if(reduced)assert.ok(pull==='0px'||pull==='0px 0px');else assert.ok(pull!=='0px'&&pull!=='0px 0px');
    await click(button(second));await wait(400);
    assert.deepEqual(await evaluate('window.__arcVoicePickerQA.calls'),['cedar']);
    assert.equal(await evaluate(`${button(second)}.getAttribute('aria-pressed')`),'true');
    assert.ok(await evaluate(`window.__arcVoiceNode===${button(second)}`));
    assert.equal(await evaluate(`Math.round(parseFloat(getComputedStyle(${button(second)}).width))`),compact?82:104);
    assert.equal(await evaluate('document.querySelectorAll("#arc-voice-picker-qa [aria-pressed=true]").length'),1);
    if(reduced)assert.equal(await evaluate('getComputedStyle(document.querySelector("#arc-voice-picker-qa .arc-voice-pulse[data-selected=true]")).animationName'),'none');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:500});await wait(250);
    assert.ok(await evaluate(`parseFloat(${button(second)}.style.getPropertyValue('--voice-x')||'0')===0`));
    assert.equal(await evaluate('document.querySelector("#arc-voice-picker-qa").scrollWidth>innerWidth'),false);
    await evaluate('window.__arcVoicePickerQA.dispose();true');
  }
  await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('import("/src/dev/VoicePickerMotionQA.tsx").then(m=>{window.__arcVoicePickerQA=m.installVoicePickerMotionQA(true);return true})');
  await evaluate(`${button('Cedric')}.focus();true`);await wait(250);
  assert.ok(await evaluate(`parseFloat(${button('Cedric')}.style.getPropertyValue('--voice-x'))>0`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(50);
  assert.equal(await evaluate(`parseFloat(${button('Cedric')}.style.getPropertyValue('--voice-x'))`),0);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(100);
  assert.deepEqual(await evaluate('window.__arcVoicePickerQA.calls'),['cedar']);await evaluate('window.__arcVoicePickerQA.dispose();true');
  if(process.env.ARC_RECORD_MOTION==='1') {
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:915,deviceScaleFactor:1,mobile:false});await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('import("/src/dev/VoicePickerMotionQA.tsx").then(m=>{window.__arcVoicePickerQA=m.installVoicePickerMotionQA();return true})');
    const folder=mkdtempSync('/tmp/arc-voice-picker-native-frames-');const start=performance.now();
    try {
      for(let frame=0;frame<36;frame++) {
        if(frame===0)await call('Input.dispatchMouseEvent',{type:'mouseMoved',...(await point('Cedric',15,10))});
        if(frame===10)await click(button('Cedric'));
        if(frame===20)await click(button('Riley'));
        if(frame===28)await click(button('Qira'));
        const capture=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(capture.data,'base64');writeFileSync(`${folder}/${String(frame).padStart(4,'0')}.png`,bytes);if(frame===24)writeFileSync('/tmp/arc-voice-picker-native-frame.png',bytes);await wait(60);
      }
      const duration=(performance.now()-start)/1000;
      execFileSync('ffmpeg',['-y','-framerate',String(36/duration),'-i',`${folder}/%04d.png`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','/tmp/arc-voice-picker-native-motion.mp4'],{stdio:'ignore'});console.log(`Recorded actual voice picker over ${duration.toFixed(2)}s`);
    }finally{rmSync(folder,{recursive:true,force:true});}
  }
  console.log('Actual voice picker passed: four choices, stable keyed selection/recentering, callback voice ID, selected size, magnetic pointer/release, reduced pulse and 412/1280 compact/full geometry. No voice session or audio call.');
}finally{await call('Emulation.setEmulatedMedia',{features:[]});await evaluate('window.__arcVoicePickerQA?.dispose();true');ws.close();}
