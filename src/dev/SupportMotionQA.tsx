import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SupportTicketView } from '@/components/support/SupportTicketView';

export function installSupportMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-support-motion-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',overflow:'auto',background:'hsl(var(--background))'});
  document.body.append(host);const root=createRoot(host);const calls:string[]=[];
  function Fixture(){
    const [open,setOpen]=useState(false),[subject,setSubject]=useState(''),[message,setMessage]=useState('');
    return <SupportTicketView tickets={[{id:'one',subject:'Synthetic ticket',status:'open',priority:'medium',created_at:'2026-09-01',updated_at:'2026-09-01',user_id:'synthetic'}]}
      loading={false} showNewTicket={open} newSubject={subject} newMessage={message} creating={false}
      navigate={delta=>calls.push(`navigate:${delta}`)} setShowNewTicket={setOpen} setNewSubject={setSubject} setNewMessage={setMessage}
      setSelectedTicketId={id=>calls.push(`ticket:${id}`)} createTicket={()=>calls.push(`create:${subject}:${message}`)} />;
  }
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
