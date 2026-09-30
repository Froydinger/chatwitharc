import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FullscreenLoader,FastLoader } from '@/components/AppLoaders';

export function installAppLoadersMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-app-loaders-qa';document.body.append(host);const root=createRoot(host);
  let version=0;
  const render=(mode:'full'|'fast')=>flushSync(()=>root.render(mode==='full'?<FullscreenLoader key={++version}/>:<FastLoader />));
  render('full');return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
