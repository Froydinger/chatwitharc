import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter,useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { BlogIndexPage } from '@/pages/BlogIndexPage';
import { DocsPage } from '@/pages/DocsPage';
import { DownloadPageView } from '@/pages/DownloadPage';

function LocationProbe(){return <span hidden data-qa-page-path={useLocation().pathname}/>;}
export function installPublicPagesMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-public-pages-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',overflow:'auto',background:'hsl(var(--background))'});document.body.append(host);const root=createRoot(host);
  const platform={version:'fixture',url:'#fixture',filename:'fixture'};
  const render=(page:'blog'|'docs'|'downloads')=>{host.scrollTop=0;flushSync(()=>root.render(<HelmetProvider><MemoryRouter key={page} initialEntries={['/fixture']}><LocationProbe/>{page==='blog'?<BlogIndexPage/>:page==='docs'?<DocsPage/>:<DownloadPageView info={{mac:platform,windows:platform,loading:false,...platform}}/>}</MemoryRouter></HelmetProvider>));};
  render('blog');return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
