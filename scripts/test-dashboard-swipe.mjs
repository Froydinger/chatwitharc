import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const listeners = new Map();
class Element { constructor(blocked=false, overflow='visible') { this.blocked=blocked; this.overflow=overflow; this.scrollWidth=100; this.clientWidth=50; } closest() { return this.blocked; } }
let modal=false;
const context={exports:{}, Element, document:{querySelector:()=>modal,body:{},documentElement:{}},window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type)=>listeners.delete(type),getSelection:()=>'',getComputedStyle:(e)=>({overflowX:e.overflow})}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/dashboardSwipeNavigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const tabs=['overview','chats','apps','memory'];
let actions=[];
function event(type,x,y,target=new Element(),count=1) { const touch={clientX:x,clientY:y}; listeners.get(type)?.({target,touches:Array(count).fill(touch),changedTouches:[touch],cancelable:true,preventDefault(){}}); }
function swipe(dx,dy=0,target=new Element()) {event('touchstart',200,100,target);event('touchmove',200+dx,100+dy,target); assert.equal(actions.length,0,'navigation waits for touch end');event('touchend',200+dx,100+dy,target);}
function setup(activeTab) {actions=[];return context.exports.installDashboardSwipeNavigation({tabs,activeTab,onTab:t=>actions.push(t),onExit:()=>actions.push('exit')});}
for(let i=0;i<tabs.length;i++){let cleanup=setup(tabs[i]);swipe(-100);assert.deepEqual(actions,i<tabs.length-1?[tabs[i+1]]:[]);cleanup();cleanup=setup(tabs[i]);swipe(100);assert.deepEqual(actions,i===0?['exit']:[tabs[i-1]]);cleanup();}
for(const [dx,dy,target] of [[25,0,new Element()],[50,130,new Element()],[100,70,new Element()],[100,0,new Element(true)],[100,0,new Element(false,'auto')]]) {const cleanup=setup('chats');swipe(dx,dy,target);assert.deepEqual(actions,[]);cleanup();}
let cleanup=setup('chats');modal=true;swipe(100);assert.deepEqual(actions,[]);modal=false;event('touchstart',200,100,new Element(),2);event('touchend',300,100);assert.deepEqual(actions,[]);event('touchstart',200,100);event('touchcancel',200,100);event('touchend',300,100);assert.deepEqual(actions,[]);cleanup();assert.equal(listeners.size,0);
// Execute the legacy effect itself: embedded libraries must register no global swipe listener.
const page=fs.readFileSync(new URL('../src/pages/DashboardPage.tsx',import.meta.url),'utf8');
const start=page.indexOf('    if (!isMobile || embedded) return;');const effectStart=page.lastIndexOf('useEffect(() => {',start);const effectEnd=page.indexOf('\n  },',start);
const body=page.slice(effectStart+'useEffect(() => {'.length,effectEnd);
vm.runInNewContext(ts.transpileModule(`(() => {${body}\n})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{isMobile:true,embedded:true,window:{addEventListener(){throw new Error('Embedded library hijacked swipe');}}});
console.log('PASS: canonical dashboard tabs, exit, scroll/input/modal guards, cancellation, cleanup and embedded legacy ownership');
