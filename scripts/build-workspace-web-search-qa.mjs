import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { readFile, readdir, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const cwd = process.cwd();
const outDir = path.resolve(process.argv[2] || '/tmp/arc-workspace-web-search-qa');
if (outDir === cwd || outDir === path.join(cwd,'dist') || outDir.startsWith(path.join(cwd,'src'))) throw new Error('Keep QA output separate from production files.');
// Use the shipped route's emitted CSS order, never the smaller fixture graph's.
const productionOut = outDir + '-production-css.local';
execFileSync(process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'build','--manifest','--outDir',productionOut],{cwd,env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'offline-build-placeholder'},stdio:'inherit'});
const productionHtml = await readFile(path.join(productionOut,'index.html'),'utf8');
const productionCssPaths = [...productionHtml.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match=>match[1]);
if(!productionCssPaths.length) throw new Error('Production build has no stylesheet.');
const productionManifest = JSON.parse(await readFile(path.join(productionOut,'.vite/manifest.json'),'utf8'));
const fixtureProductionRoots = ['src/pages/Index.tsx'];
const visited = new Set(['index.html']);
const collectCss = key => {
  if(visited.has(key)) return; visited.add(key);
  const chunk = productionManifest[key]; if(!chunk) throw new Error('Missing production route/dependency: '+key);
  for(const dependency of chunk.imports || []) collectCss(dependency);
  for(const file of chunk.css || []) { const href='/'+file; if(!productionCssPaths.includes(href)) productionCssPaths.push(href); }
};
for(const key of fixtureProductionRoots) collectCss(key);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const productionCssAssets = await Promise.all(productionCssPaths.map(async file => { const content=await readFile(path.join(productionOut,file.replace(/^\//,'')),'utf8'); return {file,content,sha256:sha256(content)}; }));
const productionCss = productionCssAssets.map(asset=>asset.content).join('\n');
if(!productionCss.includes('.wsw-dialog')) throw new Error('Production Index route CSS is missing the search modal.');
const mocks = path.join(cwd,'scripts/fixtures/workspace-web-search/mocks.tsx');
const mocked = ['ui/liquid-metal-overlay','ImageModal','ui/smooth-image','FileAttachment','MediaEmbed','CodeBlock','SvgArtifact','MermaidDiagram','InlineDataVisual'];
await build({ configFile:false, root:path.join(cwd,'scripts/fixtures/workspace-web-search'), base:'./', publicDir:false, plugins:[react()], resolve:{alias:[...mocked.map(name=>({find:`@/components/${name}`,replacement:mocks})),{find:'@',replacement:path.join(cwd,'src')}]}, css:{postcss:path.join(cwd,'postcss.config.js')}, build:{outDir,emptyOutDir:true,target:'safari16',chunkSizeWarningLimit:900} });
for(const file of (await readdir(path.join(outDir,'assets'))).filter(name=>name.endsWith('.js'))) { const content=await readFile(path.join(outDir,'assets',file),'utf8'); if(/supabase\.co|\/functions\/v1\/|api\.openai\.com|api\.tavily\.com|VITE_SUPABASE/.test(content))throw new Error(`Unexpected live-service marker: ${file}`); }
await writeFile(path.join(outDir,'production.css'),productionCss);
const fixtureCss = await readFile(path.join(cwd,'scripts/fixtures/workspace-web-search/fixture.css'),'utf8');
await writeFile(path.join(outDir,'fixture-only.css'),fixtureCss);
const fixtureHtml = (await readFile(path.join(outDir,'index.html'),'utf8')).replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'').replace('</head>','<link rel="stylesheet" href="./production.css"><link rel="stylesheet" href="./fixture-only.css"></head>');
await writeFile(path.join(outDir,'index.html'),fixtureHtml);
const referencedAssets = [...new Set([...productionCss.matchAll(/url\(["']?(\/[^)"']+)["']?\)/g)].map(match=>match[1]))];
const copiedAssets = [];
for(const file of referencedAssets) {
  const relative = file.replace(/^\//,'').split(/[?#]/)[0];
  const destination = path.join(outDir,relative);
  await mkdir(path.dirname(destination),{recursive:true});
  await copyFile(path.join(productionOut,relative),destination);
  copiedAssets.push({file,sha256:sha256(await readFile(destination))});
}
const git = args => execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const sourceCommit = git(['log','-1','--format=%H','--','src']);
await writeFile(path.join(outDir,'candidate.json'),JSON.stringify({commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),sourceCommit,sourceTree:git(['rev-parse',sourceCommit+'^{tree}']),srcTree:git(['rev-parse','HEAD:src']),fixtureProductionRoots,productionCssAssets:productionCssAssets.map(({file,sha256})=>({file,sha256})),productionCssSha256:sha256(productionCss),fixtureCssSha256:sha256(fixtureCss),copiedAssets,notes:['Exact production entry and Index static-dependency CSS bytes, in emitted dependency order.','Only fixture-only.css adds QA container/control styles. No production source changes.','Actual production presentation with inert data/artifact leaves. No browser or provider calls.']},null,2)+'\n');
if(sha256(await readFile(path.join(outDir,'production.css')))!==sha256(productionCss)) throw new Error('Production stylesheet hash verification failed.');
console.log(`Offline Safari-compatible fixture: ${outDir}. Actual production presentation, inert data/artifact leaves. No browser launched or visual QA claimed.`);
