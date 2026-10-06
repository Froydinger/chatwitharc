export type ChatInvalidation = {owner:string;session:string;submissions:string[]};
type Storage = Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;
const prefix='arc-chat-invalidation-v1:';
/** One durable key per edit: different tabs cannot overwrite each other's queue. */
export class OrdinaryChatInvalidations {
 private pending=new Map<string,ChatInvalidation>();
 private flushing=new Map<string,Promise<boolean>>();
 private storage?:Storage;
 constructor(storage?:Storage) {this.storage=storage;this.read();}
 private read(){
  try {if(!this.storage)return;
   for(let i=0;i<this.storage.length;i++){
    const key=this.storage.key(i);if(!key?.startsWith(prefix))continue;
    const x=JSON.parse(this.storage.getItem(key)||'null');
    if(x && typeof x.owner==='string' && typeof x.session==='string' && Array.isArray(x.submissions) && x.submissions.every((id:unknown)=>typeof id==='string'))this.pending.set(key,x);
   }
  }catch { /* Storage access does not change the authenticated server owner. */ }
 }
 ignored(){this.read();return new Set([...this.pending.values()].flatMap(x=>x.submissions));}
 enqueue(item:ChatInvalidation){
  const key=prefix+crypto.randomUUID(),value={...item,submissions:[...item.submissions]};this.pending.set(key,value);
  try{this.storage?.setItem(key,JSON.stringify(value));}catch{console.warn('Chat edit retry storage is unavailable. Pending edits remain in memory.');}
 }
 flush(owner:string,send:(item:ChatInvalidation)=>Promise<boolean>):Promise<boolean> {
  const existing=this.flushing.get(owner);if(existing)return existing;
  const run=(async()=>{
   this.read();
   for(;;){
    const entry=[...this.pending].find(([,x])=>x.owner===owner);if(!entry)return true;
    const [key,item]=entry;
    try {if(!await send(item))return false;}catch{return false;}
    this.pending.delete(key);
    try{this.storage?.removeItem(key);}catch{ /* Re-delivery is idempotent if storage removal fails. */ }
   }
  })();
  this.flushing.set(owner,run);
  void run.finally(()=>this.flushing.delete(owner)).catch(()=>{});
  return run;
 }
}
