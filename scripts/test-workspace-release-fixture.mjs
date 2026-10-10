// Execute the built actual-component fixture in a DOM emulator. This is an
// offline runtime smoke test, not Safari layout or authenticated app QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const {JSDOM}=await import(process.env.ARC_JSDOM_MODULE||'jsdom');
const directory=resolve(process.argv[2]||'/tmp/arc-workspace-release-qa');
const html=readFileSync(join(directory,'index.html'),'utf8');
const asset=html.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1];
const dom=new JSDOM('<!doctype html><html data-workspace-theme="dark"><body><div id="root"></div></body></html>',{url:'https://offline.invalid/',pretendToBeVisual:true});
const win=dom.window;
for(const name of ['window','document','navigator','location','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLCanvasElement','Element','Node','NodeFilter','DocumentFragment','MutationObserver','Event','KeyboardEvent','MouseEvent','CustomEvent','getComputedStyle','localStorage','sessionStorage','File','Image'])Object.defineProperty(globalThis,name,{value:win[name],configurable:true});
globalThis.requestAnimationFrame=win.requestAnimationFrame.bind(win);globalThis.cancelAnimationFrame=win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
win.HTMLElement.prototype.scrollIntoView=function(){};
let width=1440;
const media=[];
win.matchMedia=query=>{const callbacks=new Set();const value={get matches(){return query.includes('prefers-color-scheme')?true:query.includes('min-width')?width>=1024:false;},addEventListener:(_,fn)=>callbacks.add(fn),removeEventListener:(_,fn)=>callbacks.delete(fn),addListener(){},removeListener(){}};media.push({callbacks,value});return value;};
globalThis.matchMedia=win.matchMedia;
let network=0;
globalThis.fetch=async()=>{network++;throw new Error('Network prohibited');};
const errors=[];win.addEventListener('error',event=>errors.push(event.message));
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
const choose=async(label,value)=>{const select=document.querySelector(`select[aria-label="${label}"]`);assert(select,label);select.value=value;select.dispatchEvent(new win.Event('change',{bubbles:true}));await wait();};
try{
  await import(pathToFileURL(join(directory,asset)).href);await wait();
  assert(document.querySelector('.ws-chat-welcome'));
  assert(document.querySelector('[aria-label="Chat or Work"]'));
  const draft=document.querySelector('[data-arc-composer]');
  assert(draft);
  for(let i=0;i<20&&!document.querySelector('.ws-sidebar [aria-label="Hide sidebar"]');i++)await wait();
  const hide=document.querySelector('.ws-sidebar [aria-label="Hide sidebar"]');
  assert(hide,`Desktop fixture ready: sidebar=${document.querySelector('.ws-frame')?.dataset.sidebarInteractive}; media=${media.length}; errors=${JSON.stringify(errors)}`);
  hide.click();await wait();
  assert.equal(document.querySelector('.ws-frame').dataset.sidebarState,'hidden');
  document.querySelector('.ws-desktop-sidebar-trigger').click();await wait();
  assert.equal(document.querySelector('.ws-frame').dataset.sidebarState,'peek');
  assert.ok(document.querySelector('[data-arc-composer]')===draft);
  for(const page of ['overview','chats','apps','images','canvases','memory','reminders','shared','settings','modes','chat']){
    await choose('Fixture page',page);
    assert.equal(document.querySelector('.ws-header').querySelectorAll('h1,h2,h3,.ws-title').length,0,page+' header');
    assert(document.querySelector('.ws-main').textContent.trim().length>0,page+' real content');
    if(page==='settings'){
      const settings=document.querySelector('[aria-label="Settings fixture"]');
      for(const section of ['account','appearance','ai','connectors','privacy','plan']){
        const option=[...settings.options].find(value=>value.textContent.startsWith(section+':'));
        assert(option,section+' source-generated fixture');await choose('Settings fixture',option.value);
        assert(document.querySelector('.workspace-settings-page'));
      }
    }
  }
  for(const state of ['empty','loading','error','populated']){
    await choose('Fixture state',state);
    for(const page of ['overview','chats','apps','images','canvases','memory','reminders','shared'])await choose('Fixture page',page);
  }
  await choose('Fixture page','modes');
  await choose('Fixture theme','light');
  assert.equal(document.documentElement.dataset.workspaceTheme,'light');
  await choose('Fixture page','chat');
  assert.equal(document.documentElement.dataset.workspaceTheme,'light','nested modes unmount must not restore a stale theme');
  for(const theme of ['light','dark','system']){await choose('Fixture theme',theme);assert(['light','dark'].includes(document.documentElement.dataset.workspaceTheme));}
  width=390;media.forEach(({callbacks,value})=>callbacks.forEach(fn=>fn(value)));await wait();
  assert.equal(document.querySelector('.ws-frame').dataset.sidebarInteractive,'false');
  document.querySelector('[aria-label="Open navigation"]').click();await wait();assert(document.querySelector('.ws-mobile-sidebar'));
  assert.deepEqual(errors,[]);
  assert.equal(network,0);
  console.log('PASS built release fixture: actual chat/welcome/composer/pill, no-remount sidebar, every dashboard page/state, all six real-rendered Settings sections, Reminders/Shared/modes, theme switches and mobile drawer. No provider I/O.');
}finally{win.dispatchEvent(new win.Event('pagehide'));await wait();dom.window.close();}
