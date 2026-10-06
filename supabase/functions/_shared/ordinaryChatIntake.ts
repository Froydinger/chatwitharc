import { persistentChatStream } from './persistentChatStream.ts';
import { consumeOrdinaryChat, ordinaryChatMessage } from './ordinaryChatResponse.ts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function ordinaryChatIntake(options: {
 req: Request; db: any; headers: Record<string,string>;
 handle: (req: Request, user?: any) => Promise<Response>;
 waitUntil?: (task: Promise<void>) => void;
}): Promise<Response> {
 const { req,db,handle,headers } = options;
 if (req.method !== 'POST' || !options.waitUntil) return handle(req);
 const body = await req.clone().json().catch(() => null);
 if (!body?.persistentChat || body.streamEvents !== true || body.guest_mode || body.collabChat
   || body.arcMode === 'work' || body.forceGit || body.forceCanvas || body.forceCode) return handle(req);
 if (!uuid.test(body.sessionId) || !uuid.test(body.submissionId)) return new Response(JSON.stringify({error:'Invalid chat submission.'}),{status:400,headers});
 const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if (!token) return new Response(JSON.stringify({error:'Sign in to save chat.'}),{status:401,headers});
 const {data:auth,error:authError} = await db.auth.getUser(token);
 const user = auth?.user;
 if (authError || !user || user.is_anonymous) return new Response(JSON.stringify({error:'Sign in to save chat.'}),{status:401,headers});
 const input = body.userMessage;
 if (!input || !uuid.test(input.id) || input.id === body.submissionId || typeof input.content !== 'string'
   || input.content.length > 400_000 || !Array.isArray(body.messages) || body.messages.length > 500) {
   return new Response(JSON.stringify({error:'Invalid chat input.'}),{status:400,headers});
 }
 const userMessage = {id:input.id,role:'user',type:'text',content:input.content,timestamp:new Date().toISOString()};
 const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({
  messages:body.messages,model:body.model,reasoningEffort:body.reasoningEffort,reasoningSelection:body.reasoningSelection,
  forceWebSearch:!!body.forceWebSearch,userMessageId:input.id,userContent:input.content,
 })));
 const hash = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const {data:accepted,error} = await db.rpc('accept_ordinary_chat_turn',{
  p_user:user.id,p_session:body.sessionId,p_submission:body.submissionId,p_hash:hash,p_message:userMessage,
 });
 // An older backend/schema remains compatible before this staged migration.
 if (error?.code === '42883' || error?.code === 'PGRST202' || accepted?.enabled === false) return handle(req,user);
 if (error || !accepted?.enabled) return new Response(JSON.stringify({error:'Chat acceptance failed. Please retry.'}),{status:error?.code==='23505'?409:503,headers});
 const execution = new AbortController();
 const getTurn = async () => {
  const {data,error} = await db.from('ordinary_chat_turns').select('status,response,error').eq('submission_id',body.submissionId).eq('user_id',user.id).maybeSingle();
  if(error) throw new Error('Could not verify chat status.');
  return data;
 };
 const stream = persistentChatStream({
  accepted:{submissionId:body.submissionId,sessionId:body.sessionId},requestSignal:req.signal,signal:execution.signal,
  waitUntil:options.waitUntil,
  run:async (emit,signal) => {
   if(accepted.status==='cancelled' || accepted.status==='failed') throw new Error(accepted.status==='failed' ? 'Chat interrupted. No automatic retry was performed.' : 'Chat stopped.');
   if (!accepted.created) {
    for(let i=0;i<180;i++) {
     const turn=await getTurn();
     if(turn?.status==='completed') return turn.response;
     if(!turn || turn.status==='failed' || turn.status==='cancelled') throw new Error(turn?.error || 'Chat stopped.');
     await new Promise(r=>setTimeout(r,500));
    }
    throw new Error('Chat is still running. Reopen the conversation shortly.');
   }
   let checking=false,checks=0;
   const timer=setInterval(async()=>{
    if(checking) return;checking=true;
    try {
     const turn=await getTurn();if(!turn || turn.status==='cancelled' || turn.status==='failed') execution.abort();
     if(++checks%10===0 && !execution.signal.aborted) {
      const renewal=await db.rpc('renew_ordinary_chat_lease',{p_user:user.id,p_submission:body.submissionId});
      if(renewal.error || renewal.data!==true) execution.abort();
     }
    }
    catch { /* A transient read failure must not restart or duplicate the pipeline. */ }
    finally { checking=false; }
   },1000);
   try {
    const {data:profile}=await db.from('profiles').select('display_name,context_info,memory_info,preferred_model').eq('user_id',user.id).maybeSingle();
    const freshProfile={...body.profile,...profile};
    if(typeof body.locationContextPrompt==='string' && body.locationContextPrompt.length<=800) {
     if(body.locationIsUnavailable && body.currentLocationRequested) {freshProfile.context_info='';freshProfile.memory_info='';}
     freshProfile.context_info=[freshProfile.context_info,body.locationContextPrompt].filter(Boolean).join('\n\n');
    }
    const executionBody={...body,persistentChat:false,profile:freshProfile};
    const internal=new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(executionBody),signal});
    const result=await consumeOrdinaryChat(await handle(internal,user),emit);
    return {...result,persistent_message_id:body.submissionId,persistent_timestamp:new Date().toISOString(),cloud_persisted:true,reasoning_effort_used:body.reasoningEffort};
   } finally {clearInterval(timer);}
  },
  save:async result => {
   // Replayed complete submissions are immutable and already saved.
   if(!accepted.created) return;
   const assistant=ordinaryChatMessage(result,body.submissionId,String(result.persistent_timestamp));
   const {data,error}=await db.from('ordinary_chat_turns').update({status:'completed',assistant_message:assistant,response:result,finished_at:new Date().toISOString()})
     .eq('submission_id',body.submissionId).eq('user_id',user.id).eq('status','running').select('submission_id');
   if(error) throw new Error('Reply could not be saved.');
   if(!data?.length) throw new Error('Chat stopped.');
   // Metadata only; transcript writes remain in the existing session path.
   await db.from('chat_sessions').update({updated_at:new Date().toISOString()}).eq('id',body.sessionId).eq('user_id',user.id);
  },
  fail:async failure => {
   if(!accepted.created) return;
   await db.from('ordinary_chat_turns').update({status:'failed',error:(failure instanceof Error?failure.message:'Chat failed.').slice(0,250),finished_at:new Date().toISOString()})
    .eq('submission_id',body.submissionId).eq('user_id',user.id).eq('status','running');
  },
 });
 return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}});
}
