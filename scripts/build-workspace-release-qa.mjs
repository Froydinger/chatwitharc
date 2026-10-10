import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import postcss from 'postcss';
const cwd=process.cwd();
const out=path.resolve(process.argv[2]||'/tmp/arc-workspace-release-qa');
if(out===cwd||out===path.join(cwd,'dist')||out.startsWith(path.join(cwd,'src')))throw new Error('QA output must be outside production output/source.');
// The fixture's import graph can otherwise emit a different CSS order from the
// shipped app. Build the actual production graph and use its stylesheet bytes.
const productionOut=out+'-production-css.local';
execFileSync(process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'build','--manifest','--outDir',productionOut],{cwd,env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'offline-build-placeholder'},stdio:'inherit'});
const productionHtml=await readFile(path.join(productionOut,'index.html'),'utf8');
const productionCssPaths=[...productionHtml.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match=>match[1]);
if(!productionCssPaths.length)throw new Error('Production build has no stylesheet.');
// Follow the same emitted chunk graph as the live route loader. Entry CSS comes
// first; static dependencies precede each explicitly mounted lazy page.
const productionManifest=JSON.parse(await readFile(path.join(productionOut,'.vite/manifest.json'),'utf8'));
const fixtureProductionRoots=['src/pages/Index.tsx','src/pages/DashboardPage.tsx','src/pages/DashboardSettingsPage.tsx','src/pages/TasksPage.tsx','src/pages/SharedChatsPage.tsx'];
const visited=new Set(['index.html']);
const collectCss=key=>{
  if(visited.has(key))return;visited.add(key);
  const chunk=productionManifest[key];if(!chunk)throw new Error('Missing production fixture root/dependency: '+key);
  for(const dependency of chunk.imports||[])collectCss(dependency);
  for(const file of chunk.css||[]){const href='/'+file;if(!productionCssPaths.includes(href))productionCssPaths.push(href);}
};
for(const key of fixtureProductionRoots)collectCss(key);
const productionCssAssets=await Promise.all(productionCssPaths.map(async file=>{const content=await readFile(path.join(productionOut,file.replace(/^\//,'')),'utf8');return {file,content,sha256:createHash('sha256').update(content).digest('hex')};}));
const productionCss=productionCssAssets.map(asset=>asset.content).join('\n');
const coarseCss=postcss.parse(productionCss);
let coarseMediaOverrides=0;
coarseCss.walkAtRules('media',rule=>{
  const before=rule.params;
  rule.params=rule.params.replace(/\(\s*pointer\s*:\s*coarse\s*\)/g,'(min-width:0px)').replace(/\(\s*pointer\s*:\s*fine\s*\)/g,'(min-width:1000000px)').replace(/\(\s*hover\s*:\s*none\s*\)/g,'(min-width:0px)').replace(/\(\s*hover\s*:\s*hover\s*\)/g,'(min-width:1000000px)');
  if(rule.params!==before)coarseMediaOverrides++;
});
if(!coarseMediaOverrides)throw new Error('Production touch media rules were not found.');
const settingsDir=process.env.WORKSPACE_SETTINGS_FIXTURE_INPUT||path.join(out,'settings-source.local');
if(!process.env.WORKSPACE_SETTINGS_FIXTURE_INPUT){
  await mkdir(settingsDir,{recursive:true});
  execFileSync('node',['scripts/test-workspace-settings-sections-ssr.mjs'],{cwd,env:{...process.env,WORKSPACE_SETTINGS_SSR_OUTPUT:settingsDir},stdio:'inherit'});
}
const manifest=JSON.parse(await readFile(path.join(settingsDir,'manifest.json'),'utf8'));
const mismatches=[];
for(const [file,sha] of Object.entries(manifest.sourceHashes)){
  const actual=createHash('sha256').update(await readFile(path.join(cwd,file))).digest('hex');
  if(actual!==sha)mismatches.push(file);
}
if(mismatches.length)throw new Error('Settings fixture is not from this candidate: '+mismatches.join(', '));
const settings=await Promise.all(manifest.sections.filter(item=>item.presentation==='workspace').map(async item=>({...item,html:await readFile(path.join(settingsDir,item.filename),'utf8')})));
const createEntry=path.join(cwd,'scripts/fixtures/workspace-create-modes/entry.tsx');
const createSource=(await readFile(createEntry,'utf8')).replace(/createRoot\(document\.getElementById\('root'\)!\)\.render\(<CreateModesFixture \/>\);\s*$/,'');
if(createSource.includes("createRoot(document.getElementById('root')!"))throw new Error('Creation fixture auto-mount was not removed.');
const createMocks=path.join(cwd,'scripts/fixtures/workspace-create-modes/mocks.tsx');
const mocked=['hooks/useSubscription','hooks/useAuth','hooks/use-toast','hooks/useImageQuota','store/useGitStore','store/useModelStore','integrations/supabase/client','hooks/usePromptPreload','services/enhancePrompt'];
const virtualId=createEntry+'?release-component';
await build({configFile:false,root:path.join(cwd,'scripts/fixtures/workspace-release'),base:'./',publicDir:false,
  plugins:[{name:'actual-release-fixture-components',enforce:'pre',resolveId(id){if(id==='virtual:release-create-fixture')return virtualId;if(id==='virtual:release-settings')return '\0release-settings';},load(id){if(id===virtualId)return createSource;if(id==='\0release-settings')return 'export default '+JSON.stringify(settings)+';';}},react()],
  resolve:{alias:[{find:'@/hooks/useChatPins',replacement:path.join(cwd,'scripts/fixtures/workspace-release/mocks.ts')},...mocked.map(name=>({find:'@/'+name,replacement:createMocks})),{find:'@',replacement:path.join(cwd,'src')}]},
  css:{postcss:path.join(cwd,'postcss.config.js')},build:{outDir:out,emptyOutDir:true,target:'safari16',chunkSizeWarningLimit:1800}});
const assets=await readdir(path.join(out,'assets'));
for(const file of assets.filter(name=>name.endsWith('.js'))){const content=await readFile(path.join(out,'assets',file),'utf8');if(/supabase\.co|\/functions\/v1\/|api\.openai\.com|VITE_SUPABASE/.test(content))throw new Error('Live-service marker in QA bundle: '+file);}
await writeFile(path.join(out,'production.css'),productionCss);
await writeFile(path.join(out,'production-coarse.css'),coarseCss.toString());
const fixtureCss=(await readFile(path.join(cwd,'scripts/fixtures/workspace-create-modes/fixture.css'),'utf8'))+'\n'+(await readFile(path.join(cwd,'scripts/fixtures/workspace-release/fixture.css'),'utf8'));
await writeFile(path.join(out,'fixture-only.css'),fixtureCss);
// Remove only the fixture graph's stylesheet. Production order stays exact;
// the following stylesheet contains QA-only container/control selectors.
const fixtureHtml=(await readFile(path.join(out,'index.html'),'utf8')).replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'').replace('</head>','<link id="qa-production-css" rel="stylesheet" href="./production.css"><link rel="stylesheet" href="./fixture-only.css"></head>');
await writeFile(path.join(out,'index.html'),fixtureHtml);
for(const match of productionCss.matchAll(/url\(["']?(\/assets\/[^)"']+)["']?\)/g))await copyFile(path.join(productionOut,match[1].replace(/^\//,'')),path.join(out,match[1].replace(/^\//,'')));
await copyFile(path.join(cwd,'public/arc-logo-ui.png'),path.join(out,'arc-logo-ui.png'));
await writeFile(path.join(out,'viewport.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safari viewport fixture</title><style>body{margin:0;background:#444;color:white;font:14px system-ui}header{padding:8px;display:flex;gap:12px}select{font:inherit}iframe{display:block;border:0;margin:auto;background:black}</style></head><body><header><label>Width <select id="width"><option>390</option><option>375</option><option>768</option><option>1024</option><option selected>1440</option></select></label><label>Height <select id="height"><option>450</option><option>600</option><option>844</option><option selected>960</option></select></label><span>Actual iframe viewport; resize affects production media queries.</span></header><iframe title="Integrated Arc Workspace fixture" src="./index.html" id="fixture"></iframe><script src="./viewport.js"></script></body></html>');
await writeFile(path.join(out,'viewport.js'),"const width=document.querySelector('#width'),height=document.querySelector('#height'),frame=document.querySelector('#fixture');function resize(){frame.style.width=width.value+'px';frame.style.height=height.value+'px';}width.addEventListener('change',resize);height.addEventListener('change',resize);resize();");
await writeFile(path.join(out,'candidate.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim(),tree:execFileSync('git',['write-tree'],{cwd,encoding:'utf8'}).trim(),settingsSourceHashes:manifest.sourceHashes,productionCssAssets:productionCssAssets.map(({file,sha256})=>({file,sha256})),productionCssSha256:createHash('sha256').update(productionCss).digest('hex'),coarseCssSha256:createHash('sha256').update(coarseCss.toString()).digest('hex'),coarseMediaOverrides,fixtureProductionRoots,notes:['Production WorkspaceChrome, sidebar, dialogs, dashboard views, composer/welcome/toggle and model picker presentations, Reminders, Shared and creation controls are mounted directly.','Native pointer uses exact production-built entry and mounted-route lazy CSS, in dependency order. Coarse simulation changes only pointer/hover media conditions in place, preserving rule order; it does not simulate physical touch events.','Settings bodies are actual source-rendered inert HTML; their mutations are not exercised.','No account, provider, checkout, publication or external links are available.','This fixture is outside production entry points and does not prove authenticated end-to-end behavior.']},null,2)+'\n');
console.log('Isolated integrated Safari fixture: '+out+'/viewport.html');
