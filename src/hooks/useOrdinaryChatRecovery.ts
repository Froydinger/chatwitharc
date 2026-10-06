import { toast } from 'sonner';
import { useEffect } from 'react';
import { useArcStore, type Message } from '@/store/useArcStore';
import { loadOrdinaryChatTurns, mergeOrdinaryChatTurns, refreshOrdinaryChatAccess } from '@/services/ordinaryChatPersistence';
const reportedFailures=new Set<string>();
export function useOrdinaryChatRecovery(owner: string | null, sessionId: string | null) {
 useEffect(()=>{
  if(!owner || !sessionId) return;
  void refreshOrdinaryChatAccess(owner);
  let pollUntil=performance.now()+180_000;
  let alive=true,busy=false,rerun=false,timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=async()=>{
   if(!alive || document.visibilityState==='hidden') return;
   if(busy){rerun=true;return;}busy=true;
   try {
    const turns=await loadOrdinaryChatTurns(sessionId,owner);
    if(!alive) return;
    for(const turn of turns)if(turn.status==='failed' && !reportedFailures.has(turn.submission_id)){
     reportedFailures.add(turn.submission_id);toast.error("Chat was interrupted. It wasn’t retried automatically.");
    }
    useArcStore.setState(state=>{
     if(state.syncedUserId!==owner) return state;
     const session=state.chatSessions.find(s=>s.id===sessionId);
     if(!session || session.isLocalOnly) return state;
     const current=state.currentSessionId===sessionId?state.messages:session.messages;
     const messages=mergeOrdinaryChatTurns(current,turns).map(m=>({...m,timestamp:new Date(m.timestamp)})) as unknown as Message[];
     if(messages.length===current.length && messages.every((m,i)=>m.id===current[i].id)) return state;
     return {chatSessions:state.chatSessions.map(s=>s.id===sessionId?{...s,messages,messageCount:messages.length}:s),
      ...(state.currentSessionId===sessionId?{messages}:{})};
    });
    if(performance.now()<pollUntil && turns.some(t=>t.status==='running')) timer=setTimeout(refresh,1500);
   } finally {busy=false;if(alive && rerun){rerun=false;if(timer)clearTimeout(timer);timer=setTimeout(refresh,0);}}
  };
  const wake=()=>{pollUntil=performance.now()+180_000;if(timer)clearTimeout(timer);void refresh();};
  void refresh();window.addEventListener('focus',wake);window.addEventListener('ordinary-chat-accepted',wake);document.addEventListener('visibilitychange',wake);
  return()=>{alive=false;if(timer)clearTimeout(timer);window.removeEventListener('focus',wake);window.removeEventListener('ordinary-chat-accepted',wake);document.removeEventListener('visibilitychange',wake);};
 },[owner,sessionId]);
}
