import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const cwd = process.cwd();
const outDir = path.resolve(process.argv[2] || '/tmp/arc-workspace-create-qa');
if (outDir === cwd || outDir === path.join(cwd,'dist') || outDir.startsWith(path.join(cwd,'src'))) throw new Error('QA output must be separate from production build/source.');
const mocks = path.join(cwd,'scripts/fixtures/workspace-create-modes/mocks.tsx');
const mocked = ['hooks/useSubscription','hooks/useAuth','hooks/use-toast','hooks/useImageQuota','store/useGitStore','store/useModelStore','integrations/supabase/client','hooks/usePromptPreload','services/enhancePrompt'];
await build({
  configFile:false, root:path.join(cwd,'scripts/fixtures/workspace-create-modes'), base:'./', publicDir:false,
  plugins:[react()],
  resolve:{alias:[...mocked.map(name=>({find:`@/${name}`,replacement:mocks})),{find:'@',replacement:path.join(cwd,'src')}]},
  css:{postcss:path.join(cwd,'postcss.config.js')},
  build:{outDir,emptyOutDir:true,target:'safari16',chunkSizeWarningLimit:900},
});
const assets=await readdir(path.join(outDir,'assets'));
for(const file of assets.filter(name=>name.endsWith('.js'))) {
  const content=await readFile(path.join(outDir,'assets',file),'utf8');
  if (/supabase\.co|\/functions\/v1\/|api\.openai\.com|VITE_SUPABASE/.test(content)) throw new Error(`Live-service marker in isolated QA bundle: ${file}`);
}
console.log(`Isolated Safari-compatible fixture written to ${outDir}. Serve it over localhost. No browser has been launched or visually validated.`);
