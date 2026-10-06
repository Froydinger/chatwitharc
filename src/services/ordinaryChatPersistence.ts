import { OrdinaryChatInvalidations } from '@/lib/ordinaryChatInvalidations';
import { mergeOrdinaryChatMessages, type OrdinaryChatTurn } from '@/lib/ordinaryChatMessages';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
const db = supabase as unknown as SupabaseClient;
const access = new Map<string,boolean>();
let currentOwner:string|null=null;
const storage=(()=>{try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}})();
const outbox=new OrdinaryChatInvalidations(storage);
const retryTimers=new Map<string,ReturnType<typeof setTimeout>>();
async function flushInvalidations(owner:string) {
 const success=await outbox.flush(owner,async item=>{
  const {error}=await db.rpc('invalidate_ordinary_chat_turns',{p_session:item.session,p_submissions:item.submissions,p_owner:owner});return !error;
 });
 if(success){const timer=retryTimers.get(owner);if(timer)clearTimeout(timer);retryTimers.delete(owner);}
 else if(!retryTimers.has(owner))retryTimers.set(owner,setTimeout(()=>{retryTimers.delete(owner);if(currentOwner===owner)void flushInvalidations(owner);},5000));
 return success;
}
export const ordinaryChatEnabled = (owner: string | null) => owner ? access.get(owner) === true : false;
export async function refreshOrdinaryChatAccess(owner:string) {
 currentOwner=owner;
 void flushInvalidations(owner);
 const {data,error}=await db.rpc('get_ordinary_chat_access');access.set(owner,!error && data===true);
}
const active = new Map<string,string>();
let foreground: string | null = null;
const known = new Map<string, Set<string>>();
const discarded = outbox.ignored();
function remember(session:string,message:string,submission:string) {
 const key=`${session}:${message}`, ids=known.get(key) || new Set<string>();ids.add(submission);known.set(key,ids);
}
export const registerOrdinaryChat = (session: string, submission: string, message: string) => { active.set(session,submission);foreground=session;remember(session,message,submission); };
export const unregisterOrdinaryChat = (session: string, submission: string, message: string) => { if(active.get(session)===submission) active.delete(session); };
export async function cancelOrdinaryChat(session: string | null) {
 session = foreground ?? session;
 if(!session) return;
 const submission=active.get(session);
 if(!submission) return;
 await db.rpc('cancel_ordinary_chat_turn',{p_submission:submission});
}
export type { OrdinaryChatTurn } from '@/lib/ordinaryChatMessages';
export function mergeOrdinaryChatTurns<T extends {id:string}>(messages:readonly T[],turns:readonly OrdinaryChatTurn[]) {
 return mergeOrdinaryChatMessages(messages,turns,discarded);
}
export async function loadOrdinaryChatTurns(session: string, owner: string): Promise<OrdinaryChatTurn[]> {
 if(!await flushInvalidations(owner))return [];
 await db.rpc('expire_ordinary_chat_turns',{p_session:session});
 const {data,error}=await db.from('ordinary_chat_turns')
  .select('submission_id,user_message,assistant_message,status,error,invalidated_at').eq('session_id',session).eq('user_id',owner).order('created_at',{ascending:true});
 // Older deployments and the staged rollout retain the established chat path.
 if(error) return [];
 const turns = (data || []) as OrdinaryChatTurn[];
 for(const turn of turns) remember(session,turn.user_message.id,turn.submission_id);
 return turns.filter(t=>t.invalidated_at || !discarded.has(t.submission_id));
}
export async function discardOrdinaryChatTurns(session: string, messageIds: string[], owner: string | null) {
 if(!messageIds.length) return;
 // Session ID and RLS scope this to the signed-in owner. Removing the accepted
 // user turn also stops an unfinished pipeline via its cancellation observer.
 const ids = [...new Set(messageIds.flatMap(id=>[...(known.get(`${session}:${id}`) || [])]))];
 for(const id of ids) discarded.add(id);
 if(ids.length && owner) {
  outbox.enqueue({owner,session,submissions:ids});
  await flushInvalidations(owner);
 }
}

if(typeof window!=='undefined') {
 const retry=()=>{if(currentOwner)void flushInvalidations(currentOwner);};
 window.addEventListener('online',retry);window.addEventListener('focus',retry);
}
