// Execute the built actual-component fixture in a DOM emulator. This is an
// offline runtime smoke test, not Safari layout or authenticated app QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
const {JSDOM}=await import(process.env.ARC_JSDOM_MODULE||'jsdom');
const directory=resolve(process.argv[2]||'/tmp/arc-workspace-release-qa');
const html=readFileSync(join(directory,'index.html'),'utf8');
const stamp=JSON.parse(readFileSync(join(directory,'candidate.json'),'utf8'));
const productionCss=readFileSync(join(directory,'production.css'),'utf8');
const coarseCss=readFileSync(join(directory,'production-coarse.css'),'utf8');
assert.equal(createHash('sha256').update(productionCss).digest('hex'),stamp.productionCssSha256);
assert.equal(createHash('sha256').update(coarseCss).digest('hex'),stamp.coarseCssSha256);
assert(html.includes('id="qa-production-css"')&&html.includes('./fixture-only.css'));
assert(!/<link\b[^>]*href="\.\/assets\/[^\"]+\.css"/.test(html),'fixture import-order stylesheet is not loaded');
const rules=value=>{const items=[];postcss.parse(value).walkRules(rule=>items.push([rule.selector,rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value,!!node.important])]));return items;};
assert.deepEqual(rules(coarseCss),rules(productionCss),'coarse simulation preserves every production selector/declaration and its order');
assert(stamp.coarseMediaOverrides>0);
for(const selector of ['.workspace-dashboard-page','.workspace-settings-page','.workspace-organizer-page','.ws-create-mode','.ws-model-menu']) assert(productionCss.includes(selector),'actual lazy production CSS includes '+selector);
assert(stamp.productionCssAssets.length>1,'lazy stylesheets are included alongside the entry stylesheet');
const asset=html.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1];
const dom=new JSDOM('<!doctype html><html data-workspace-theme="dark"><head><link id="qa-production-css" rel="stylesheet" href="./production.css"></head><body><div id="root"></div></body></html>',{url:'https://offline.invalid/',pretendToBeVisual:true});
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
  for(const account of ['free','boost','admin']){
    await choose('Fixture account',account);
    document.querySelector('[aria-label^="Arc Matrix model:"]').click();await wait();
    const menu=document.querySelector('[data-testid="chat-model-menu"]');assert(menu,'actual model picker is mounted');
    const rows=[...menu.querySelectorAll('button')];
    const luna=rows.find(row=>row.textContent.includes('GPT 6 Luna'));
    const sol=rows.find(row=>row.textContent.includes('GPT 6.1 Sol'));
    const astra=rows.find(row=>row.textContent.includes('GPT 6 Astra'));
    assert(luna.textContent.includes('Unlimited'));
    assert(!sol.textContent.includes('Allowance'));
    assert(astra.textContent.includes('Boost'));
    assert.equal(!!astra.querySelector('[aria-label="Get Boost"]'),account==='free');
    document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
  }
  await choose('Fixture pointer','coarse');assert(document.getElementById('qa-production-css').href.endsWith('/production-coarse.css'));
  await choose('Fixture pointer','native');assert(document.getElementById('qa-production-css').href.endsWith('/production.css'));
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
  document.querySelector('.ws-sidebar [aria-label="Dock sidebar"]').click();await wait();
  const search=document.querySelector('.ws-sidebar [aria-label="Search workspace"]');
  document.querySelector('[aria-label="More workspace options"]').focus();
  search.click();await wait();
  assert.equal(document.activeElement.getAttribute('aria-label'),'Fixture search','real autofocus child takes focus');
  document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));await wait();
  document.querySelector('[aria-label="Close dialog"]').click();await wait();
  assert.ok(document.activeElement===search,'Safari-style pointer Search returns to its explicit docked invoker after a repeated shortcut');

  for(const page of ['overview','chats','apps','images','canvases','memory','reminders','shared','settings','modes','chat']){
    await choose('Fixture page',page);
    assert.equal(document.querySelector('.ws-header').querySelectorAll('h1,h2,h3,.ws-title').length,0,page+' header');
    assert(document.querySelector('.ws-main').textContent.trim().length>0,page+' real content');
    if(page==='overview'){
      const bell=document.querySelector('.ws-header [aria-label="Recent push notifications"]');assert(bell,'actual notification control is in the Workspace header');
      assert.equal(document.querySelectorAll('[aria-label="Recent push notifications"]').length,1);
      bell.click();await wait();
      const tray=document.querySelector('.ws-dashboard-notification-popover');assert(tray?.classList.contains('workspace-ui'));
      assert(!document.querySelector('.ws-frame').contains(tray),'actual notification portal escapes transformed frame');
      assert(tray.textContent.includes('Saved result'));
      [...tray.querySelectorAll('button')].find(button=>button.textContent.includes('Clear notifications')).click();await wait();
      assert(tray.textContent.includes('You’re all caught up.'));
      document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
      assert(!document.querySelector('.ws-dashboard-notification-popover'));
    }
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
