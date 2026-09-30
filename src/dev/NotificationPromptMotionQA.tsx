import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { NotificationPromptView } from '@/components/NotificationPromptView';

export function installNotificationPromptMotionQA(){
  if(!import.meta.env.DEV)throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-notification-prompt-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))'});
  document.body.append(host);const root=createRoot(host);const calls:string[]=[];
  function Fixture(){
    const [show,setShow]=useState(false),[loading,setLoading]=useState(false);
    return <><button data-qa-open onClick={()=>setShow(true)}>Open notification prompt</button><button data-qa-loading onClick={()=>setLoading(v=>!v)}>Toggle loading</button>
      <NotificationPromptView show={show} loading={loading} handleEnable={()=>calls.push('enable')} handleDismiss={()=>{calls.push('dismiss');setShow(false);}} handleHideForever={()=>{calls.push('forever');setShow(false);}} />
    </>;
  }
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
