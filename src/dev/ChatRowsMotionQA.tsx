import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRows } from '@/components/ChatMessageRows';

export function installChatRowsMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-chat-rows-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))',padding:'24px'});
  document.body.append(host);const root=createRoot(host);
  const render=(ids:string[],loading=false)=>flushSync(()=>root.render(<ChatMessageRows>{ids.map(id=>
    <div key={id} data-qa-row={id} data-row-reveal={!loading&&!id.startsWith('assistant')} className="rounded-xl border p-4 mb-4">{id}</div>
  )}</ChatMessageRows>));
  render(['history']);return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
