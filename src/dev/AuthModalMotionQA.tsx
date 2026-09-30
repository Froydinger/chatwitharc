import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AuthModal } from '@/components/AuthModal';

export function installAuthModalMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-auth-modal-qa';document.body.append(host);
  const root=createRoot(host);
  function Fixture() {
    const [open,setOpen]=useState(true);
    return <><button data-qa-auth-open onClick={()=>setOpen(true)}>Open sign in</button><AuthModal isOpen={open} onClose={()=>setOpen(false)} gatedFeature="research" /></>;
  }
  flushSync(()=>root.render(<Fixture />));
  return {dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
