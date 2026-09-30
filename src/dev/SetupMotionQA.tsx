import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { OnboardingScreen } from '@/components/OnboardingScreen';
import { MemoryRouter } from 'react-router-dom';
import { MacInstallPrompt, MacInstallPromptView } from '@/components/MacInstallPrompt';

export function installSetupMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-setup-motion-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'100',overflow:'auto',background:'hsl(var(--background))'});document.body.append(host);const root=createRoot(host);
  const calls: string[]=[];
  function MacFixture() {const [show,setShow]=useState(true);return <><button data-qa-reopen onClick={()=>setShow(true)}>Show Mac prompt</button><MacInstallPromptView show={show} onDownload={()=>{calls.push('download');setShow(false);}} onDismiss={()=>{calls.push('dismiss');setShow(false);}} /></>;}
  const render=(mode:'onboarding'|'mac'|'mac-policy',path='/')=>flushSync(()=>root.render(mode==='mac-policy'?<MemoryRouter key={path} initialEntries={[path]}><MacInstallPrompt /></MemoryRouter>:mode==='mac'?<MacFixture />:<OnboardingScreen onComplete={()=>calls.push('profile-complete')}/>));
  render('onboarding');return {render,calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
