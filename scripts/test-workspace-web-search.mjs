// Real React + Radix, offline data. No browser launch, auth or provider calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.QA_JSDOM_PATH || '/tmp/arc-create-modes-test-deps/node_modules/jsdom/lib/api.js');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'https://fixture.invalid/',pretendToBeVisual:true });
for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','Node','NodeFilter','Element','Event','MouseEvent','KeyboardEvent','MutationObserver','CustomEvent','getComputedStyle','localStorage']) Object.defineProperty(globalThis,name,{configurable:true,value:name==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.fetch=async()=>{throw new Error('Network must never be used by result-modal tests');};
const React=require('react');const {act}=React;const {createRoot}=require('react-dom/client');
const aliases=new Map(),cache=new Map();
let failAnswer=false;
const read=file=>readFileSync(file,'utf8');
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const compiled=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};cache.set(file,exports);
  new Function('exports','require',compiled)(exports,name=>{
    if(name.endsWith('.css'))return {};
    if(aliases.has(name))return aliases.get(name);
    if(name==='./WorkspaceSearchAnswer')return new Promise(resolve=>setTimeout(()=>resolve(load('src/workspace/WorkspaceSearchAnswer.tsx')),80));
    if(name.startsWith('@/')||name.startsWith('.')){const stem=name.startsWith('@/')?`src/${name.slice(2)}`:path.resolve(path.dirname(file),name);for(const suffix of ['.ts','.tsx']){try{return load(stem+suffix);}catch(error){if(error.code!=='ENOENT')throw error;}}}
    return require(name);
  });return exports;
}
aliases.set('@/components/ui/liquid-metal-overlay',{LiquidMetalOverlay:()=>null});
aliases.set('@/components/richMarkdown',{richMarkdownComponents:{p:({node,...props})=>{if(failAnswer)throw new Error('Inert render failure');return React.createElement('p',props);}}});
aliases.set('@/components/MediaEmbed',{MediaEmbeds:()=>null,getMediaType:()=> 'none',getYouTubeVideoId:()=>null});
aliases.set('@/components/transitions/Transition',{Transition:({children})=>children});
aliases.set('@/components/ImageModal',{ImageModal:()=>null});
aliases.set('@/components/ui/smooth-image',{SmoothImage:()=>null});
aliases.set('@/hooks/useReducedMotionPreference',{useReducedMotionPreference:()=>true});
const {WorkspaceUIContext}=load('src/workspace/WorkspaceContext.ts');
const {WorkspaceWebSearchDialog}=load('src/workspace/WorkspaceWebSearchDialog.tsx');
const {SearchResultsCard}=load('src/components/SearchResultsCard.tsx');
const {SourcesAccordion}=load('src/components/SourcesAccordion.tsx');
const {shouldShowSearchCard}=load('src/lib/chatPresentation.ts');
const root=createRoot(document.getElementById('root'));
const sources=[{title:'First source',url:'https://www.example.com/first',content:'Tavily content excerpt'},...Array.from({length:7},(_,i)=>({title:`Source ${i+2}`,url:`https://source${i+2}.example/article`,snippet:`Work snippet ${i+2}`})),{title:'Unavailable URL',url:'javascript:alert(1)',content:'Source content remains readable'}];
const content='## Verified result\n\nA **formatted** answer.\n\n| Item | Value |\n| --- | --- |\n| Sources | Nine |';
const settle=async(ms=0)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const render=async(element,workspace=true)=>{await act(async()=>root.render(React.createElement(WorkspaceUIContext.Provider,{value:workspace},React.createElement('div',{className:workspace?'workspace-ui':''},element))));await settle();};
const click=async element=>{assert.ok(element,'click target exists');await act(async()=>{element.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}));element.click();});await settle();};
const byText=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
const close=async()=>{await click(document.querySelector('[aria-label="Close web search"]'));await settle(20);assert.equal(document.querySelector('[role="dialog"]'),null);};
const input=async(value)=>{const el=document.querySelector('input[type=search]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});await settle();};
let copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copies.push(text)}});
try {
  await render(React.createElement(SearchResultsCard,{content,sources,query:'Latest source-backed answer'}));
  const trigger=document.querySelector('[aria-label="Open web search answer and sources"]');assert.ok(trigger);assert.ok(document.querySelector('.wsw-inline-card'));trigger.focus();await click(trigger);
  assert.equal(document.querySelector('[role="dialog"] h2').textContent,'Latest source-backed answer');
  assert.equal(document.activeElement.tagName,'H2','open focuses title, avoids summoning mobile keyboard');
  assert.ok(document.querySelector('[role="dialog"]').classList.contains('workspace-ui'),'portaled content retains theme');
  assert.match(document.querySelector('.wsw-empty').textContent,/Loading answer/,'lazy answer loading is announced');await settle(120);assert.ok(document.querySelector('.wsw-answer table'),'real markdown preserves tables');
  await click(document.querySelector('[aria-label="Copy answer"]'));assert.deepEqual(copies,[content]);assert.match(document.querySelector('[role=status]').textContent,/copied/);
  await click(document.querySelector('[role=tab][data-state=inactive]'));assert.equal(document.querySelectorAll('.wsw-source-list li').length,9,'all sources available, including beyond first six');
  assert.match(document.querySelector('.wsw-source-list').textContent,/Tavily content excerpt/);assert.match(document.querySelector('.wsw-source-list').textContent,/Work snippet 2/);
  assert.equal(document.querySelectorAll('.wsw-source-list a').length,8,'unsafe URL is never actionable');assert.equal(document.querySelector('a[href^="javascript:"]'),null);
  assert.equal(document.querySelector('.wsw-source-list a').rel,'noopener noreferrer');
  await input('SOURCE8');assert.equal(document.querySelectorAll('.wsw-source-list li').length,1);assert.match(document.querySelector('.wsw-source-list').textContent,/Source 8/);
  await input('no match');assert.match(document.querySelector('.wsw-sources-panel').textContent,/No sources match/);await click(byText('Clear filter'));assert.equal(document.querySelectorAll('.wsw-source-list li').length,9);
  const back=[...document.querySelectorAll('[role=dialog] button')].find(el=>el.textContent==='Back to chat');back.focus();await act(async()=>back.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,document.querySelector('[aria-label="Close web search"]'),'focus is trapped at the last control');
  await close();assert.equal(document.activeElement,trigger,'close restores exact result trigger');
  await click(trigger);await settle(30);assert.equal(document.querySelector('[role=tab][data-state=active]').textContent,'Answer','reopen resets panel');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('permission denied');}}});await click(document.querySelector('[aria-label="Copy answer"]'));assert.match(document.querySelector('[role=status]').textContent,/Copy didn’t work/);
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await settle(20);assert.equal(document.querySelector('[role=dialog]'),null,'Escape dismisses');assert.equal(document.activeElement,trigger);
  failAnswer=true;const originalConsoleError=console.error;console.error=()=>{};await click(trigger);await settle(30);console.error=originalConsoleError;assert.match(document.querySelector('[role=alert]').textContent,/couldn’t be displayed/,'render error retains source access');await close();failAnswer=false;
  await render(React.createElement(SourcesAccordion,{sources,messageContent:content,showMediaEmbeds:false}));
  const badge=document.querySelector('.wsw-open-sources');await click(badge);assert.match(document.querySelector('[role=tab][data-state=active]').textContent,/Sources/,'automatic/metadata source badge opens source view');await close();assert.equal(document.activeElement,badge);
  const primitives=load('src/components/ui/dialog.tsx');await render(React.createElement(primitives.Dialog,{defaultOpen:true},React.createElement(primitives.DialogContent,{'aria-describedby':undefined},React.createElement(primitives.DialogTitle,null,'Reply details'),React.createElement(SourcesAccordion,{sources,messageContent:content,showMediaEmbeds:false}))));const nestedBadge=document.querySelector('.wsw-open-sources');await click(nestedBadge);assert.equal(document.querySelectorAll('[role=dialog]').length,2,'source viewer nests inside reply metadata');await click(document.querySelector('[aria-label="Close web search"]'));await settle(20);assert.equal(document.querySelectorAll('[role=dialog]').length,1);assert.equal(document.activeElement,nestedBadge,'nested dismissal restores source badge');await render(null);
  await render(React.createElement(WorkspaceWebSearchDialog,{sources:[],content:''}));await click(document.querySelector('.wsw-open-sources'));assert.match(document.querySelector('.wsw-empty').textContent,/No source links/);assert.equal(document.querySelector('[role=tab][value=answer]')?.disabled ?? document.querySelector('[role=tab]').disabled,true);await close();
  await render(React.createElement(SearchResultsCard,{content,sources,query:'Legacy'}),false);assert.equal(document.querySelector('.wsw-inline-card'),null);assert.equal(document.querySelector('.wsw-open-sources'),null,'legacy card unchanged');
  await render(React.createElement(SourcesAccordion,{sources,showMediaEmbeds:false}),false);assert.equal(document.querySelector('.wsw-open-sources'),null);assert.ok(document.querySelector('[aria-expanded=false]'),'legacy accordion unchanged');
  for(const message of [{webSources:sources},{memoryAction:{type:'web_searched',sources}},{voiceSearchResult:true}])assert.equal(shouldShowSearchCard({role:'assistant',type:'text',...message}),true,'existing auto/explicit/voice result path preserved');
  assert.equal(shouldShowSearchCard({role:'user',type:'text',webSources:sources}),false);
  const code=read('src/workspace/WorkspaceWebSearchDialog.tsx');assert.doesNotMatch(code,/supabase|AIService|perplexity-search|functions\.invoke/,'result viewer never creates another search');
  assert.match(read('src/workspace/WorkspaceSearchAnswer.tsx'),/components=\{richMarkdownComponents\}/,'shared rich renderer');
  const css=postcss.parse(read('src/workspace/workspace-web-search.css'));assert.match(css.toString(),/font-size:16px!important/);for(const edge of ['top','bottom','left','right'])assert.ok(css.toString().includes(`env(safe-area-inset-${edge})`));assert.ok(css.toString().includes('@container wsw-dialog (max-height:480px)'), 'short visual viewport compacts heading while keyboard is open');assert.ok(css.toString().includes('@container wsw-dialog (max-height:320px)'), 'very short landscape viewport makes content intrinsic and dialog scrollable');assert.match(css.toString(),/overflow-x:hidden; overflow-y:auto/);assert.match(css.toString(),/\.wsw-tabs \{ flex:none; min-height:auto; \}/);assert.match(css.toString(),/var\(--ws-viewport-height,100dvh\)/);
  // Evaluate actual Noir/source styles in both orderings, not just a string match.
  const specificity=s=>{const score=nodes=>nodes.reduce((n,x)=>n+(x.type==='id'?10000:x.type==='class'||x.type==='attribute'?100:x.type==='tag'?1:x.type==='pseudo'?(x.value===':where'?0:[':is',':not',':has'].includes(x.value)?Math.max(0,...x.nodes.map(y=>score(y.nodes))):100):0),0);return score(selectorParser().astSync(s).first.nodes);};
  const global=postcss.parse(read('src/index.css'));
  const winner=(el,prop,sheets)=>{let best;let order=0;for(const sheet of sheets)sheet.walkRules(rule=>{order++;for(const selector of rule.selectors){if(/:hover|:focus|::/.test(selector))continue;try{if(!el.matches(selector))continue;}catch{continue;}for(const d of rule.nodes){if(d.prop!==prop)continue;const rank=[d.important?1:0,specificity(selector),order];if(!best||rank[0]>best.rank[0]||rank[0]===best.rank[0]&&(rank[1]>best.rank[1]||rank[1]===best.rank[1]&&rank[2]>=best.rank[2]))best={rank,value:d.value};}}});return best?.value;};
  await render(React.createElement(WorkspaceWebSearchDialog,{content,sources,initialTab:'sources'}));await click(document.querySelector('.wsw-open-sources'));
  for(const theme of ['dark','light']){document.documentElement.className=theme;document.documentElement.dataset.accent='noir';document.documentElement.dataset.workspaceTheme=theme;for(const order of [[global,css],[css,global]]){assert.equal(winner(document.querySelector('.wsw-filter input'),'font-size',order),'16px');assert.equal(winner(document.querySelector('.wsw-filter input'),'background',order),'transparent');assert.equal(winner(document.querySelector('.wsw-filter input'),'color',order),'var(--ws-text)');}}
  await close();
  console.log('PASS: actual result card + automatic/metadata source badges; full source list/content/snippet; real Radix title focus, Escape, restore and reopen; markdown tables; copy success/failure; source filter/empty/invalid URLs; legacy isolation; dark/light Noir cascade; mobile viewport/font/safe-area contracts. No browser or live search used.');
} finally {await act(async()=>root.unmount());dom.window.close();}
