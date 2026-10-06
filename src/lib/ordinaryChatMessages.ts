export type OrdinaryChatTurn = {
 submission_id: string;
 user_message: {id:string;content:string;timestamp:string;role:string};
 assistant_message: {id:string;content:string;timestamp:string;role:string} | null;
 status: string;
 error?:string|null;
 invalidated_at?:string|null;
};
/** Recover the same stable reply, preserving connected-client copies and edits. */
export function mergeOrdinaryChatMessages<T extends {id:string}>(messages:readonly T[],turns:readonly OrdinaryChatTurn[],ignored:ReadonlySet<string>=new Set()):T[] {
 const invalidated=new Set(turns.filter(t=>t.invalidated_at).map(t=>t.submission_id));
 const merged=messages.filter(x=>!invalidated.has(x.id) && !ignored.has(x.id)).map(x=>({...x}));
 for(const turn of turns) {
  if(ignored.has(turn.submission_id) || turn.invalidated_at)continue;
  let index=merged.findIndex(x=>x.id===turn.user_message.id);
  if(index<0){merged.push({...turn.user_message} as unknown as T);index=merged.length-1;}
  const reply=turn.assistant_message;
  if(turn.status==='completed' && reply && !merged.some(x=>x.id===reply.id))merged.splice(index+1,0,{...reply} as unknown as T);
 }
 return merged;
}
