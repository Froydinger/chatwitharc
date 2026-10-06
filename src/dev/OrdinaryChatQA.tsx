import { useLiveAnswerStore } from '@/store/useLiveAnswerStore';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AIService } from '@/services/ai';
import { useArcStore } from '@/store/useArcStore';
import { useOrdinaryChatRecovery } from '@/hooks/useOrdinaryChatRecovery';
import { cancelOrdinaryChat } from '@/services/ordinaryChatPersistence';
import '../index.css';
const owner=new URLSearchParams(location.search).get('owner') || '10000000-0000-4000-8000-000000000001';
const timingWindow=window as Window & {fixtureSendStarted?:number;fixtureFirstTokenAt?:number};
useLiveAnswerStore.subscribe(s=>{if(s.answer?.content && timingWindow.fixtureFirstTokenAt===undefined)timingWindow.fixtureFirstTokenAt=performance.now();});
const session='20000000-0000-4000-8000-000000000002';
useArcStore.setState({syncedUserId:owner,currentSessionId:session,messages:[],chatSessions:[{id:session,title:'Fixture',createdAt:new Date(),lastMessageAt:new Date(),messages:[],isHydrated:true,messageCount:0}]});
function Fixture() {
 useOrdinaryChatRecovery(owner,session);
 const messages=useArcStore(s=>s.messages);const [status,setStatus]=useState('Idle');
 async function send() {
  timingWindow.fixtureSendStarted=performance.now();timingWindow.fixtureFirstTokenAt=undefined;
  setStatus('Sending');
  await useArcStore.getState().addMessage({role:'user',type:'text',content:'Say hello'},{deferCloudPersistence:true});
  try {
   const service=new AIService('auto');
   const result=await service.sendMessage([{role:'user',content:'Say hello'}],{},undefined,session,false,false,false,false,false,undefined,()=>setStatus('Streaming'));
   await useArcStore.getState().addMessage({id:result.persistentMessageId,role:'assistant',type:'text',content:result.content,modelUsed:result.modelUsed},{deferCloudPersistence:result.cloudPersisted});
   setStatus('Complete');
  }catch(e){setStatus(e instanceof Error?e.message:'Failed');}
 }
 return <main className="p-8 text-foreground bg-background min-h-screen"><h1>Ordinary chat persistence fixture</h1><button onClick={()=>void send()}>Send</button><button onClick={()=>void cancelOrdinaryChat(session)}>Stop</button><button onClick={()=>{const m=useArcStore.getState().messages.filter(m=>m.role==='user').at(-1);if(m)useArcStore.getState().editMessage(m.id,'Edited input');}}>Edit last input</button><p>{status}</p><ul aria-label="Conversation">{messages.map(m=><li key={m.id} data-role={m.role} data-id={m.id}>{m.content}</li>)}</ul></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
