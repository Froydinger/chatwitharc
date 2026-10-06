import { ordinaryChatIntake } from './ordinaryChatIntake.ts';
import { consumeOrdinaryChat } from './ordinaryChatResponse.ts';
const user='10000000-0000-4000-8000-000000000001',session='20000000-0000-4000-8000-000000000002',submission='30000000-0000-4000-8000-000000000003';
function assert(value: unknown, message: string): asserts value {if(!value)throw new Error(message);}
function deferred<T>() {let resolve!:(x:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
const body={persistentChat:true,streamEvents:true,sessionId:session,submissionId:submission,model:'gemini-3.8-flash',reasoningEffort:'low',arcMode:'chat',messages:[{role:'user',content:'Hi'}],userMessage:{id:'40000000-0000-4000-8000-000000000004',content:'Hi'}};
const request=(override={})=>new Request('https://fixture.test/chat',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({...body,...override})});
function fixture(options:{enabled?:boolean;created?:boolean;anonymous?:boolean}={}) {
 const turn:any={status:'running',response:null,error:null};let writes=0;let claimed=false;let task!:Promise<void>;
 const profile=deferred<any>();
 const db={auth:{getUser:async()=>({data:{user:{id:user,is_anonymous:!!options.anonymous}},error:null})},
  rpc:async()=>{const created=options.created!==undefined?options.created:!claimed;claimed=true;return {data:{enabled:options.enabled!==false,created,status:turn.status,response:turn.response},error:null};},
  from:(table:string)=>{
   let patch:any,expected:string|undefined;
   const execute=async()=>{
    if(table==='profiles')return {data:await profile.promise,error:null};
    if(patch && table==='ordinary_chat_turns'){
     if(expected && turn.status!==expected)return {data:[],error:null};
     Object.assign(turn,patch);writes++;return {data:[{submission_id:submission}],error:null};
    }
    return {data:table==='ordinary_chat_turns'?turn:null,error:null};
   };
   const query:any={select:()=>query,update:(value:any)=>{patch=value;return query;},eq:(key:string,value:string)=>{if(key==='status')expected=value;return query;},maybeSingle:execute,then:(yes:any,no:any)=>execute().then(yes,no)};return query;
  },
 };
 return {db,turn,profile,waitUntil:(p:Promise<void>)=>{task=p;},done:()=>task,writes:()=>writes};
}
Deno.test('acceptance precedes profile/provider; closing the connection preserves the exact ordinary Flash reply',async()=>{
 const f=fixture();let calls=0;const finished=deferred<Response>();let executionSignal!:AbortSignal;
 const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async req=>{calls++;executionSignal=req.signal;return finished.promise;}});
 const reader=response.body!.getReader();const first=new TextDecoder().decode((await reader.read()).value);
 assert(first.includes('accepted'),'accept before profile/provider');assert(calls===0,'no pre-accept generation');
 await reader.cancel();f.profile.resolve({display_name:'Fresh'});await Promise.resolve();await Promise.resolve();
 finished.resolve(Response.json({choices:[{message:{content:'Same chat answer'}}],model_used:'gemini-3.8-flash',tool_calls_used:['get_weather']}));
 await f.done();assert(!executionSignal.aborted,'disconnect is not Stop');assert(Number(calls)===1,'one ordinary handler call');
 assert(f.turn.status==='completed' && f.writes()===1,'saved once');
 assert(f.turn.assistant_message.modelUsed==='gemini-3.8-flash','Flash remains Flash');assert(f.turn.assistant_message.toolsUsed[0]==='get_weather','metadata retained');
 assert(f.turn.assistant_message.id===submission,'stable cross-browser reply ID');
});
Deno.test('completed retries replay without profile queries, generation or another save',async()=>{
 const f=fixture({created:false});f.turn.status='completed';f.turn.response={choices:[{message:{content:'Original'}}]};let runs=0;
 const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{runs++;return Response.json({});}});
 const text=await response.text();await f.done();assert(text.includes('Original'),'same saved result');assert(runs===0 && f.writes()===0,'no replay side effects');
});
Deno.test('staged/Work requests retain the existing handler and no background work',async()=>{
 for(const override of [{},{arcMode:'work'},{forceGit:true},{forceCode:true}]) {
 const f=fixture({enabled:false});let calls=0;const response=await ordinaryChatIntake({req:request(override),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{calls++;return Response.json({legacy:true});}});
 assert((await response.json()).legacy && calls===1,'existing handler unchanged');assert(!f.done(),'no detached task when disabled');
 }
});
Deno.test('anonymous users cannot start persistent chat',async()=>{
 const f=fixture({anonymous:true});let calls=0;const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{calls++;return Response.json({});}});
 assert(response.status===401 && calls===0,'anonymous rejected');
});
Deno.test('cancelled/deleted turn cannot be completed or resurrected',async()=>{
 const f=fixture();f.profile.resolve({});let executions=0;
 const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{executions++;f.turn.status='cancelled';return Response.json({choices:[{message:{content:'late'}}]});}});
 const text=await response.text();await f.done();assert(text.includes('Chat stopped.'),'stop reported');assert(f.turn.status==='cancelled' && !f.turn.assistant_message,'no late completion');assert(executions===1,'no replacement execution');
});
Deno.test('SSE parser preserves chunked unicode and discards no ordinary events',async()=>{
 const source='data: {"type":"answer","text":"Hi 🪄"}\n\ndata: {"type":"done","result":{"choices":[{"message":{"content":"Hi 🪄"}}]}}\n\n';
 const bytes=new TextEncoder().encode(source),events:any[]=[];
 const response=new Response(new ReadableStream({start(c){for(const x of bytes)c.enqueue(new Uint8Array([x]));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 const result=await consumeOrdinaryChat(response,e=>events.push(e));assert(events[0].text==='Hi 🪄' && result.choices[0].message.content==='Hi 🪄','chunk-safe unchanged stream');
});
Deno.test('acceptance does not wait for slow profile work; no Work startup before first answer',async()=>{
 const f=fixture();let runs=0;
 const start=performance.now();
 const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{runs++;return new Response('data: {"type":"answer","text":"Fast"}\n\ndata: {"type":"done","result":{"choices":[{"message":{"content":"Fast"}}]}}\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 const reader=response.body!.getReader();const accepted=new TextDecoder().decode((await reader.read()).value);
 const elapsed=performance.now()-start;
 assert(accepted.includes('accepted') && runs===0,'ack while profile is unresolved');
 await new Promise(r=>setTimeout(r,50));assert(runs===0,'no pre-accept provider wait or Work run');
 f.profile.resolve({});
 const answer=new TextDecoder().decode((await reader.read()).value);
 assert(answer.includes('Fast'),'forward first ordinary answer directly');
 await f.done();await reader.cancel();
 console.log(`fixture acceptance ${elapsed.toFixed(2)}ms; profile delay excluded (not production latency)`);
});

Deno.test('concurrent reconnects observe one existing execution and one saved reply',async()=>{
 const f=fixture();let executions=0;
 const handle=async()=>{executions++;return Response.json({choices:[{message:{content:'Only once'}}]});};
 const tasks:Promise<void>[]=[];const waitUntil=(p:Promise<void>)=>tasks.push(p);
 const first=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil,handle});
 const reconnected=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil,handle});
 f.profile.resolve({});
 const results=await Promise.all([first.text(),reconnected.text(),...tasks]);
 assert(results[0].includes('Only once') && results[1].includes('Only once'),'both subscribers get same durable reply');
 assert(executions===1 && f.writes()===1,'no duplicate provider/tools/save');
});
Deno.test('crashed or expired submissions never restart provider or tools on retry',async()=>{
 const f=fixture({created:false});f.turn.status='failed';f.turn.error='Chat interrupted. No automatic retry was performed.';let executions=0;
 const response=await ordinaryChatIntake({req:request(),db:f.db,headers:{},waitUntil:f.waitUntil,handle:async()=>{executions++;return Response.json({});}});
 assert((await response.text()).includes('No automatic retry'),'interruption is explicit');await f.done();
 assert(executions===0 && f.writes()===0,'failed ID never reacquires side effects');
});
