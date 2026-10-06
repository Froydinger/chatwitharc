import { ordinaryChatIntake } from '../supabase/functions/_shared/ordinaryChatIntake.ts';
const jobs=new Map<string,any>(),cancelled=new Set<string>();let executions=0,invalidationFailures=0;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
const userFrom=(token:string)=>{try{return JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).sub;}catch{return '10000000-0000-4000-8000-000000000001';}};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const db={auth:{getUser:async(token:string)=>({data:{user:{id:userFrom(token),is_anonymous:false}},error:null})},
 rpc:async(name:string,p:any)=>{
  if(name==='renew_ordinary_chat_lease')return {data:jobs.get(p.p_submission)?.status==='running',error:null};
  let job=jobs.get(p.p_submission),created=false;
  if(!job){created=true;job={submission_id:p.p_submission,user_id:p.p_user,session_id:p.p_session,user_message:p.p_message,status:cancelled.has(`${p.p_user}:${p.p_submission}`)?'cancelled':'running',created_at:new Date().toISOString()};jobs.set(p.p_submission,job);}
  return {data:{enabled:true,created,status:job.status,response:job.response},error:null};
 },
 from:(table:string)=>{
  let patch:any,filters:Record<string,string>={};
  const execute=async()=>{
   if(table==='profiles'){await new Promise(r=>setTimeout(r,40));return {data:{display_name:'Fixture',context_info:''},error:null};}
   if(table==='chat_sessions')return {data:null,error:null};
   const matches=[...jobs.values()].filter(j=>Object.entries(filters).every(([k,v])=>j[k]===v));
   if(patch){for(const j of matches)Object.assign(j,patch);return {data:matches.map(j=>({submission_id:j.submission_id})),error:null};}
   return {data:matches[0]||null,error:null};
  };
  const q:any={select:()=>q,update:(p:any)=>{patch=p;return q;},eq:(k:string,v:string)=>{filters[k]=v;return q;},maybeSingle:execute,then:(yes:any,no:any)=>execute().then(yes,no)};return q;
 }
};
Deno.serve({hostname:'127.0.0.1',port:5440},async req=>{
 const url=new URL(req.url),owner=userFrom((req.headers.get('Authorization')||'').replace(/^Bearer /,''));
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(url.pathname==='/fixture-reset'){jobs.clear();cancelled.clear();executions=0;invalidationFailures=0;return json(true);}
 if(url.pathname==='/fixture-fail-invalidation'){invalidationFailures=1;return json(true);}
 if(url.pathname==='/fixture-metrics')return json({executions,jobs:[...jobs.values()]});
 if(url.pathname==='/auth/v1/user')return json({id:owner,email:'fixture@example.test',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{}});
 if(url.pathname==='/rest/v1/rpc/get_ordinary_chat_access')return json(!owner.startsWith('70000000'));
 if(url.pathname==='/rest/v1/rpc/expire_ordinary_chat_turns')return json(null);
 if(url.pathname==='/rest/v1/rpc/invalidate_ordinary_chat_turns'){
  if(invalidationFailures-->0)return json({message:'Fixture transient failure',code:'fixture'},503);
  const b=await req.json();if(b.p_owner!==owner)return json({message:'Owner mismatch'},403);for(const id of b.p_submissions){
   cancelled.add(`${owner}:${id}`);const j=jobs.get(id);
   if(j?.user_id===owner && j.session_id===b.p_session)Object.assign(j,{status:'cancelled',invalidated_at:new Date().toISOString(),assistant_message:null,response:null});
  }return json(null);
 }
 if(url.pathname==='/rest/v1/rpc/cancel_ordinary_chat_turn'){
  const b=await req.json();cancelled.add(`${owner}:${b.p_submission}`);const j=jobs.get(b.p_submission);if(j?.user_id===owner && j.status==='running')j.status='cancelled';return json(null);
 }
 if(url.pathname==='/rest/v1/ordinary_chat_turns'){
  const rows=[...jobs.values()].filter(j=>j.user_id===owner && [...url.searchParams].every(([k,v])=>['select','order'].includes(k)||!v.startsWith('eq.')||j[k]===v.slice(3)));
  if(req.method==='DELETE'){for(const j of rows)jobs.delete(j.submission_id);return json(null);}
  return json(rows.map(({response,...safe})=>safe));
 }
 if(url.pathname==='/functions/v1/chat')return ordinaryChatIntake({req,db,headers:cors,waitUntil:task=>{void task;},handle:async internal=>{
  executions++;const body=await internal.json();const encoder=new TextEncoder();
  return new Response(new ReadableStream({start(c){
   c.enqueue(encoder.encode('data: {"type":"status","activity":"thinking"}\n\n'));
   setTimeout(()=>c.enqueue(encoder.encode('data: {"type":"answer","text":"Ordinary reply"}\n\n')),20);
   setTimeout(()=>{c.enqueue(encoder.encode(`data: ${JSON.stringify({type:'done',result:{choices:[{message:{content:'Ordinary reply'}}],model_used:body.model,tool_calls_used:[]}})}\n\n`));c.close();},900);
  }}),{headers:{...cors,'Content-Type':'text/event-stream'}});
 }});
 return json(null);
});
