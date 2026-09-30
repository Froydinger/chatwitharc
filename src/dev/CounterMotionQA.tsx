import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AnimatedCounter } from '@/components/ui/rare-ui/animated-counter';
export function installCounterMotionQA(){
  if(!import.meta.env.DEV)throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-counter-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))',padding:'32px'});
  document.body.append(host);const root=createRoot(host);
  const update=(value:number)=>flushSync(()=>root.render(<AnimatedCounter value={value} height={32} prefix="Messages " suffix=" sent"/>));
  update(12);return {update,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
