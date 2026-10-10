import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
import postcss from 'postcss';
const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const jsdomPath = process.env.QA_JSDOM_PATH || 'jsdom';
let JSDOM;
try { ({ JSDOM } = await import(jsdomPath)); }
catch { throw new Error('JSDOM is required for offline component QA. Install jsdom separately and set QA_JSDOM_PATH to its lib/api.js. No browser or live service is used.'); }
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'https://fixture.invalid/' });
for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','Element','Event','MouseEvent','KeyboardEvent','MutationObserver','CustomEvent','getComputedStyle','localStorage','sessionStorage']) {
  Object.defineProperty(globalThis, name, { configurable:true, value: name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = clearTimeout;
window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const aliases = new Map();
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(read(path), { compilerOptions: { target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; cache.set(path,exports);
  new Function('exports','require',compiled)(exports,name => {
    if (name.endsWith('.css')) return {};
    if (aliases.has(name)) return aliases.get(name);
    if (name.startsWith('@/')) {
      for (const suffix of ['.ts','.tsx']) { try { return load(`src/${name.slice(2)}${suffix}`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    }
    return require(name);
  });
  return exports;
}
const calls = {status:0,repos:0,connect:0,disconnect:0,select:[],checkout:[],toast:[],enhance:[]};
let tier = {hasBoost:true,isAdmin:false,loading:false,openCheckout:(...args)=>calls.checkout.push(args)};
let account = {user:{id:'fixture-owner'}};
let repoResponse = [];
let repoError = false;
const repository = {full_name:'owner/repository',default_branch:'trunk'};
const selectedStatus = {enabled:true,connected:true,providerLogin:'owner',selectedRepo:null,selectedBranch:null,repoAccessMode:'all',allowedRepos:[]};
aliases.set('@/hooks/useSubscription',{useSubscription:()=>tier});
aliases.set('@/hooks/useAuth',{useAuth:()=>account});
const toast = value => calls.toast.push(value);
aliases.set('@/hooks/use-toast',{useToast:()=>({toast})});
aliases.set('@/components/ImageCreditSummary',{ImageCreditSummary:()=>React.createElement('p',null,'Fixture allowance')});
aliases.set('@/services/git',{gitApi:{
  status:async()=>{calls.status++;return {...selectedStatus};},
  repositories:async()=>{calls.repos++;if(repoError) throw new Error('Fixture repository error');return {repositories:repoResponse};},
  start:async()=>{calls.connect++;return {...selectedStatus};},
  selectRepository:async(repo,branch)=>{calls.select.push([repo,branch]);return {...selectedStatus,selectedRepo:repo,selectedBranch:branch};},
  disconnect:async()=>{calls.disconnect++;},
}});
let improve = async text => `Improved: ${text}`;
aliases.set('@/services/enhancePrompt',{enhancePrompt:async(text,kind)=>{calls.enhance.push([text,kind]);return improve(text);}});
// The plain Workspace branch still imports the legacy wrapper. A local plain
// Radix wrapper avoids importing the unrelated decorative WebGL effect in QA.
const Radix = require('@radix-ui/react-popover');
aliases.set('@/components/ui/popover',{Popover:Radix.Root,PopoverTrigger:Radix.Trigger,PopoverContent:Radix.Content});
const { useGitStore } = load('src/store/useGitStore.ts');
aliases.set('@/store/useGitStore',{useGitStore});
const { useExecutionModelStore } = load('src/store/useExecutionModelStore.ts');
aliases.set('@/store/useExecutionModelStore',{useExecutionModelStore});
const image = load('src/store/useImageGenStore.ts');
aliases.set('@/store/useImageGenStore',image);
const { GitModeDock } = load('src/components/GitModeDock.tsx');
const { ImageOptionsContent } = load('src/components/ImageOptionsDock.tsx');
const { AttachmentTray } = load('src/components/chat-input/AttachmentTray.tsx');
const { WorkspaceCreateDock } = load('src/components/chat-input/WorkspaceCreateDock.tsx');
const { workspaceCreateDockStyle } = load('src/workspace/createDockLayout.ts');
const { PromptEnhancer } = load('src/components/PromptEnhancer.tsx');
const root = createRoot(document.getElementById('root'));
const settle = async (ms=0) => act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const render = async element => { await act(async()=>{root.render(element);}); await settle(); };
const click = async element => { assert.ok(element,'click target exists'); await act(async()=>element.click()); await settle(); };
const byText = text => [...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
const select = async (element,value) => { assert.ok(element);await act(async()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});await settle(); };

try {
  // Actual React, actual production Git store, mocked API. An empty result must
  // settle after one store-owned load, not spin until a repository appears.
  await render(React.createElement(GitModeDock,{workspaceUI:true}));
  assert.equal(calls.status,1);assert.equal(calls.repos,1);
  await settle(30);assert.equal(calls.repos,1,'empty repository response does not loop');
  assert.match(document.body.textContent,/No allowed repos/);
  await click(document.querySelector('[aria-label="Refresh repositories"]'));
  assert.equal(calls.repos,2,'explicit retry makes exactly one request');
  repoError=true;
  await click(document.querySelector('[aria-label="Refresh repositories"]'));
  assert.equal(calls.repos,3);assert.equal(calls.toast.at(-1).description,'Fixture repository error');
  await settle(30);assert.equal(calls.repos,3,'failed repository response does not auto-retry');
  assert.equal(useGitStore.getState().loading,false);
  repoError=false;repoResponse=[repository,{full_name:'other/private',default_branch:'main'}];
  await act(async()=>useGitStore.setState({repoAccessMode:'selected',allowedRepos:[repository.full_name]}));
  await click(document.querySelector('[aria-label="Refresh repositories"]'));
  const repoPicker=document.querySelector('[aria-label="GitHub repository"]');
  assert.deepEqual([...repoPicker.options].map(o=>o.value),['',repository.full_name,'__manage_settings__']);
  await select(repoPicker,repository.full_name);
  assert.deepEqual(calls.select.at(-1),[repository.full_name,'trunk']);
  assert.match(document.body.textContent,/trunk/);
  await click(byText('Pro'));assert.equal(useExecutionModelStore.getState().gitModelMode,'pro');
  tier={...tier,hasBoost:false};await render(React.createElement(GitModeDock,{workspaceUI:true}));
  assert.equal(useExecutionModelStore.getState().gitModelMode,'normal');
  assert.equal(document.querySelector('[aria-label="Git Pro mode requires Boost"]').disabled,true);
  await click(document.querySelector('[aria-label="Disconnect GitHub"]'));assert.equal(calls.disconnect,1);
  await click(byText('Connect GitHub'));assert.equal(calls.connect,1);

  // Production image preference store; tier gate and generation/edit aspect
  // remain independent. This only changes local settings, never generates.
  image.useImageGenStore.setState({imageMode:'low',aspectRatio:'3:2',editAspectRatio:'source',count:1});
  await render(React.createElement(ImageOptionsContent,{workspaceUI:true,showUsage:false}));
  assert.equal(document.querySelector('[aria-label="Image size"]').value,'3:2');
  assert.deepEqual([...document.querySelectorAll('[aria-label="Image mode"] button')].map(b=>b.textContent),image.IMAGE_MODEL_OPTIONS.map(x=>x.label));
  await click(byText('GPT 2.5 Sunburst'));assert.equal(calls.checkout.length,1);assert.equal(image.useImageGenStore.getState().imageMode,'low');
  tier={...tier,hasBoost:true};await render(React.createElement(ImageOptionsContent,{workspaceUI:true,showUsage:false}));
  await click(byText('GPT 2.5 Sunburst'));assert.equal(image.useImageGenStore.getState().imageMode,'pro');
  await select(document.querySelector('[aria-label="Image size"]'),'16:9');
  await select(document.querySelector('[aria-label="Image count"]'),'3');
  assert.equal(image.useImageGenStore.getState().aspectRatio,'16:9');assert.equal(image.useImageGenStore.getState().count,3);
  await render(React.createElement(ImageOptionsContent,{workspaceUI:true,showUsage:false,editMode:true}));
  assert.equal(document.querySelector('[aria-label="Image size"]').value,'source');
  await select(document.querySelector('[aria-label="Image size"]'),'2:3');
  assert.equal(image.useImageGenStore.getState().editAspectRatio,'2:3');assert.equal(image.useImageGenStore.getState().aspectRatio,'16:9');
  await render(React.createElement(ImageOptionsContent,{showUsage:false}));
  assert.equal(document.querySelector('.ws-image-options-content'),null,'legacy remains opt-in');
  assert.equal(document.querySelector('[aria-label="Image size"]'),null,'legacy picker remains button-based');

  let removes=[],clears=0;
  const files=[new dom.window.File(['content'],'first.txt'),new dom.window.File(['x'],'second.txt')];
  await render(React.createElement(AttachmentTray,{kind:'documents',files,onRemove:i=>removes.push(i),onClear:()=>clears++,workspaceUI:true}));
  await click(document.querySelector('[aria-label="Remove second.txt"]'));assert.deepEqual(removes,[1]);
  await click(byText('Clear'));assert.equal(clears,1);
  await render(React.createElement(AttachmentTray,{kind:'images',files,previewUrls:['data:image/png;base64,AA==','data:image/png;base64,BB=='],onRemove:i=>removes.push(i),onClear:()=>clears++,workspaceUI:true}));
  assert.deepEqual([...document.querySelectorAll('img')].map(i=>i.alt),['first.txt','second.txt']);
  await click(document.querySelector('[aria-label="Remove first.txt"]'));assert.deepEqual(removes,[1,0]);
  await click(document.querySelector('[aria-label="Clear selected images"]'));assert.equal(clears,2);

  let accepted=[];
  await render(React.createElement(PromptEnhancer,{text:'test image',kind:'image',workspaceUI:true,onAccept:text=>accepted.push(text)}));
  await click(document.querySelector('[aria-label="Enhance prompt"]'));
  assert.equal(calls.enhance.length,1);assert.deepEqual(calls.enhance.at(-1),['test image','image']);
  await click(byText('Dismiss'));assert.equal(accepted.length,0);
  await click(document.querySelector('[aria-label="Enhance prompt"]'));
  await click(byText('Use this'));assert.deepEqual(accepted,['Improved: test image']);
  improve=async()=>{throw new Error('Fixture enhancement error');};
  await click(document.querySelector('[aria-label="Enhance prompt"]'));
  assert.equal(calls.toast.at(-1).description,'Fixture enhancement error');
  assert.equal(document.querySelector('[aria-label="Enhance prompt"]').disabled,false);

  assert.deepEqual(workspaceCreateDockStyle({left:20,width:350,top:610},844,0),{left:'20px',width:'350px',bottom:'244px',maxHeight:'min(60dvh, 590px)'});
  assert.equal(workspaceCreateDockStyle({left:12,width:296,top:190},620,40).maxHeight,'min(60dvh, 130px)');
  await render(React.createElement(WorkspaceCreateDock,{portalRoot:document.body,anchor:{left:20,width:350,top:610}},React.createElement('div',null,'First options'),React.createElement('div',null,'Second options')));
  const stack=document.querySelector('[aria-label="Creation options"]');
  assert.equal(stack.children.length,2);assert.equal(stack.style.width,'350px');
  assert.equal(stack.parentElement,document.body,'stack portal escapes composer transforms');

  // Guard the production controllers and nine actions against layout regressions.
  const current=read('src/components/ChatInput.tsx');
  const baseline=execFileSync('git',['show','251d889af61653983b82688fc1c310a0b2d62ebf:src/components/ChatInput.tsx'],{encoding:'utf8'});
  const declarations=source=>{const ast=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const values=new Map();const visit=node=>{if(ts.isVariableDeclaration(node) || (ts.isFunctionDeclaration(node) && node.name))values.set(node.name.getText(ast),node.getText(ast));ts.forEachChild(node,visit);};visit(ast);return values;};
  const old=declarations(baseline),now=declarations(current);
  for(const name of ['{ handleSend, foregroundSubmissionRef }','handleFileSelect','handlePaste','handleKeyPress','removeImage','removeDocument','clearSelected','createActions']) {assert.ok(old.has(name),`${name} baseline exists`);assert.equal(now.get(name),old.get(name),`${name} unchanged`);}
  for(const file of ['src/store/useImageGenStore.ts','src/store/useGitStore.ts','src/store/useExecutionModelStore.ts','src/services/git.ts'])assert.equal(read(file),execFileSync('git',['show',`251d889af61653983b82688fc1c310a0b2d62ebf:${file}`],{encoding:'utf8'}),`${file} contract unchanged`);
  const createCss=postcss.parse(read('src/workspace/workspace-create-modes.css'));
  // The application's Noir selectors have specificity (0,4,1), or (0,5,1)
  // on hover, and use !important. These scoped rules have >= five/six class
  // or attribute selectors respectively, and preserve the reference fill.
  for(const selector of [
    '.workspace-ui.ws-git-mode-dock .ws-git-model-controls .ws-git-model-option[aria-pressed=true]',
    '.workspace-ui.ws-image-options-content .ws-image-models .ws-image-model-option[aria-pressed=true]',
    '.workspace-ui.ws-prompt-enhancer-preview .ws-primary-button.ws-primary-button.ws-primary-button',
  ]) {
    for(const state of ['',':hover']) {
      let matched;createCss.walkRules(rule=>{if(rule.selectors.includes(selector+state))matched=rule;});assert.ok(matched,`Noir-safe selector: ${selector}${state}`);
      for(const [prop,value] of [['background','var(--ws-text)'],['color','var(--ws-bg)'],['border-color','var(--ws-text)']]) {
        assert.ok(matched.nodes.some(node=>node.prop===prop && node.value===value && node.important));
      }
    }
  }
  console.log('PASS: actual React offline mode controls, Git empty/error/retry request counts, repository filtering/default branch, execution tier gates, image preferences/tier gates, attachments, enhancer cancel/accept/retry, measured stack, unchanged composer/store/service contracts. Safari layout remains unrun.');
} finally { await act(async()=>root.unmount()); dom.window.close(); }
