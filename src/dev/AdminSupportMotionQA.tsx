import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AdminSupportTicketView } from '@/components/support/AdminSupportTicketView';
import { filterAdminSupportTickets, type AdminSupportTicket } from '@/components/support/adminTicketFilter';

export function installAdminSupportMotionQA(){
  if(!import.meta.env.DEV)throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-admin-support-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',overflow:'auto',background:'hsl(var(--background))'});
  document.body.append(host);const root=createRoot(host);const calls:string[]=[];
  const profiles={person:{user_id:'person',display_name:'Synthetic Person',avatar_url:null}};
  const base={created_at:'2026-09-01',updated_at:'2026-09-01',priority:'medium',user_id:'person'};
  const tickets:AdminSupportTicket[]=[{...base,id:'open',subject:'Open issue',status:'open'},{...base,id:'resolved',subject:'Resolved issue',status:'resolved',sender_email:'qa@example.com',sender_name:'Synthetic Guest'}];
  function Fixture(){
    const [open,setOpen]=useState(false),[subject,setSubject]=useState(''),[message,setMessage]=useState(''),[assign,setAssign]=useState(''),[priority,setPriority]=useState('medium'),[filter,setFilter]=useState('open'),[search,setSearch]=useState('');
    return <AdminSupportTicketView tickets={tickets} filteredTickets={filterAdminSupportTickets(tickets,filter,search,profiles)} userProfiles={profiles} allUsers={Object.values(profiles)} userPlans={{person:'Pro'}}
      loading={false} showNewTicket={open} newSubject={subject} newMessage={message} assignUserId={assign} newPriority={priority} creating={false} filter={filter} search={search}
      navigate={v=>calls.push(`navigate:${v}`)} setShowNewTicket={setOpen} setNewSubject={setSubject} setNewMessage={setMessage} setAssignUserId={setAssign} setNewPriority={setPriority} setSearch={setSearch} setFilter={setFilter}
      setSelectedTicketId={id=>calls.push(`ticket:${id}`)} createTicket={()=>calls.push(`create:${assign}:${priority}:${subject}:${message}`)} />;
  }
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
