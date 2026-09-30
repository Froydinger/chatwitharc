import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthPage } from '@/components/AuthPage';
import { InfoPanel } from '@/components/InfoPanel';
import NotFound from '@/pages/NotFound';

function LocationProbe() { return <span hidden data-qa-path={useLocation().pathname} />; }
export function installUtilityMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host = document.createElement('div');
  host.id = 'arc-utility-motion-qa';
  Object.assign(host.style, {position:'fixed',inset:'0',zIndex:'10000',overflow:'auto',background:'hsl(var(--background))'});
  document.body.append(host);
  const root = createRoot(host);
  const render = (page: 'auth' | 'info' | '404') => flushSync(() => root.render(
    <MemoryRouter key={page} initialEntries={['/first', '/unknown-fixture']} initialIndex={1}>
      <LocationProbe />{page === 'auth' ? <AuthPage /> : page === 'info' ? <InfoPanel /> : <NotFound />}
    </MemoryRouter>
  ));
  render('auth');
  return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
