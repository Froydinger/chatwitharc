// Isolated cloud Chromium component QA. Auth, subscription, billing and voice are
// fixtures; no production accounts, requests, or provider traffic are permitted.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'esbuild-wasm';
const root = process.cwd(), output = '/tmp/arc-gpt-lineup-browser';
mkdirSync(output, { recursive: true });
const mocks = {
  '@/hooks/useAuth': `export function useAuth(){return {user:{id:'fixture'},loading:false};}`,
  '@/hooks/useSubscription': `import {useSyncExternalStore} from 'react';let state={hasBoost:false,hasVerifiedBoost:false,isAdmin:false,isVerifiedModelAdmin:false,loading:false};const listeners=new Set();window.__qaCheckout=[];window.__qaSetAccount=value=>{state={hasBoost:false,hasVerifiedBoost:false,isAdmin:false,isVerifiedModelAdmin:false,loading:false,...value};for(const fn of listeners)fn();};export function useSubscription(){const account=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>state);return {...account,openCheckout:(...args)=>window.__qaCheckout.push(args),openCustomerPortal:()=>{throw Error('No billing in QA')}};}`,
  '@/components/VoiceMagneticPicker': `export function VoiceMagneticPicker(){return null;}`,
  '@/components/FreeUsageButton': `export function FreeUsageButton(){return null;}`,
};
await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{ChatModelPicker}from'./src/components/ChatModelPicker';import{ArcControlPicker}from'./src/components/ArcControlPicker';import{PricingPage}from'./src/pages/PricingPage';import{useModelStore}from'./src/store/useModelStore';window.__qaModels=useModelStore;createRoot(document.getElementById('root')).render(<BrowserRouter><div style={{padding:24,display:'flex',gap:24}}><ChatModelPicker/><ArcControlPicker name="Arc" selectedVoice="alloy" onSelectVoice={()=>{}}/></div><PricingPage/></BrowserRouter>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, format: 'iife', outfile: `${output}/app.js`, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'local-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));
  } }], logLevel: 'silent' });
execFileSync(`${root}/node_modules/.bin/tailwindcss`, ['-i', 'src/index.css', '-o', `${output}/style.css`], { cwd: root, stdio: 'pipe' });
writeFileSync(`${output}/index.html`, `<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:;script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'none';font-src 'self' data:"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script></body></html>`);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://fixture').pathname;
  const file = pathname === '/app.js' ? 'app.js' : pathname === '/style.css' ? 'style.css' : 'index.html';
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(readFileSync(`${output}/${file}`));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = spawn('/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9338', `--user-data-dir=${output}/profile`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let tabs;
  for (let n=0;n<60;n++) { try { tabs = await (await fetch('http://127.0.0.1:9338/json/list')).json(); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  assert.ok(tabs?.length, 'Cloud Chromium started');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise(resolve => ws.addEventListener('open', resolve, { once:true }));
  let id=0; const pending=new Map(); const errors=[];
  ws.addEventListener('message', ({data})=>{const event=JSON.parse(data);if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.text);const wait=pending.get(event.id);if(wait){pending.delete(event.id);event.error?wait.reject(Error(event.error.message)):wait.resolve(event.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});ws.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value;};
  const wait=()=>new Promise(resolve=>setTimeout(resolve,180));
  await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  for(let n=0;n<60;n++){if(await evaluate('!!window.__qaModels'))break;await wait();}
  for(const width of [1280,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    await evaluate(`window.__qaSetAccount({});window.__qaModels.getState().setIsAdmin(false);window.__qaModels.getState().setIsBoost(false);window.__qaModels.getState().setModelSelection('auto');window.scrollTo(0,0);`);await wait();
    await evaluate(`document.querySelector('button[aria-label^="Arc Matrix model"]').click()`);await wait();
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-testid="chat-model-menu"] button')].map(b=>b.querySelector('.font-semibold')?.textContent).filter(Boolean)`),['Auto','GPT 6 Luna','GPT 6.1 Sol','GPT 6 Astra']);
    const before=await evaluate('window.__qaCheckout.length');
    await evaluate(`[...document.querySelectorAll('[data-testid="chat-model-menu"] button')].find(b=>b.textContent.includes('GPT 6 Astra')).click()`);await wait();
    assert.equal(await evaluate('window.__qaCheckout.length'),before+1);assert.equal(await evaluate('window.__qaModels.getState().modelSelection'),'auto');
    await evaluate(`document.querySelector('button[aria-label^="Arc Matrix model"]').click()`);await wait();
    await evaluate(`[...document.querySelectorAll('[data-testid="chat-model-menu"] button')].find(b=>b.textContent.includes('GPT 6.1 Sol')).click()`);await wait();
    assert.equal(await evaluate('window.__qaModels.getState().modelSelection'),'gpt-6.1-sol');
    await evaluate(`window.__qaSetAccount({hasBoost:true,hasVerifiedBoost:true});window.__qaModels.getState().setIsBoost(true);`);await wait();
    await evaluate(`document.querySelector('button[aria-label^="Arc Matrix model"]').click()`);await wait();
    await evaluate(`[...document.querySelectorAll('[data-testid="chat-model-menu"] button')].find(b=>b.textContent.includes('GPT 6 Astra')).click()`);await wait();
    assert.equal(await evaluate('window.__qaModels.getState().modelSelection'),'gpt-6-astra');
    await evaluate(`window.__qaSetAccount({hasBoost:true,hasVerifiedBoost:false});window.__qaModels.getState().setIsBoost(false);`);await wait();
    assert.equal(await evaluate('window.__qaModels.getState().modelSelection'),'auto','Unverified/cached Boost cannot retain Astra');
    await evaluate(`document.querySelector('button[aria-label^="Arc Matrix model"]').click()`);await wait();
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait();
    assert.equal(await evaluate(`document.querySelector('button[aria-label^="Arc Matrix model"]').getAttribute('aria-expanded')`),'false');
    await evaluate(`document.querySelector('button[aria-label^="Choose model or voice"]').click()`);await wait();
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Coming soon')`),false);
    await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.includes('GPT 6.1 Sol')).click()`);await wait();
    assert.equal(await evaluate('window.__qaModels.getState().modelSelection'),'gpt-6.1-sol');
    await evaluate(`document.querySelector('button[aria-label="Close model and voice picker"]').click()`);await wait();
    assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`),false);
    const tile=await evaluate(`(()=>{const el=document.querySelector('[data-testid="boost-pro-preview"]');const rect=el.getBoundingClientRect();return {text:el.textContent.trim().replace(/\\s+/g,' '),buttons:el.querySelectorAll('button,a').length,width:rect.width,height:rect.height};})()`);
    assert.equal(tile.text,'Boost ProComing soon');assert.equal(tile.buttons,0);assert.ok(Math.abs(tile.width/tile.height-2)<0.03);
    await evaluate(`document.querySelector('[data-testid="boost-pro-preview"]').scrollIntoView({block:'center'});`);await wait();
    const screenshot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`${output}/pricing-${width}.png`,Buffer.from(screenshot.data,'base64'));
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS isolated cloud Chromium at 1280px/390px: both pickers, Free upsell, Sol access, verified Boost Astra, cached-tier denial, Escape/Close, model persistence and diagonal name-only Boost Pro tile. Screenshots: ${output}/pricing-{1280,390}.png`);
} finally { ws?.close(); browser.kill('SIGTERM'); await new Promise(resolve=>server.close(resolve)); }
