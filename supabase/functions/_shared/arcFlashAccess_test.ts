import { equal, deepStrictEqual, rejects } from 'node:assert/strict';
import { reserveArcFlashSubmission, shouldAutoUseFlash } from './arcFlashAccess.ts';
const id='00000000-0000-4000-8000-000000000001';
Deno.test('Flash admission reserves a submitted user identity and fails closed on lookup, auth, key and payload errors', async()=>{
 let calls=0;
 const db={rpc:(name:string,args:Record<string,unknown>)=>{calls++;equal(name,'reserve_arc_flash_message');deepStrictEqual(args,{target_user_id:'member',submission_id:id});return Promise.resolve({data:{allowed:true,unlimited:false},error:null});}};
 deepStrictEqual(await reserveArcFlashSubmission(db,{id:'member'},'fixture-key',id),{allowed:true,unlimited:false});
 await rejects(reserveArcFlashSubmission(db,null,'fixture-key',id),/Sign in/);
 await rejects(reserveArcFlashSubmission(db,{id:'member',is_anonymous:true},'fixture-key',id),/Sign in/);
 await rejects(reserveArcFlashSubmission(db,{id:'member'},undefined,id),/unavailable/);
 await rejects(reserveArcFlashSubmission(db,{id:'member'},'fixture-key','bad'),/identity/);
 equal(calls,1);
 for(const data of [null,{allowed:'true'},{}]) await rejects(reserveArcFlashSubmission({rpc:()=>Promise.resolve({data,error:null})},{id:'member'},'fixture-key',id),/could not be checked/);
 await rejects(reserveArcFlashSubmission({rpc:()=>Promise.resolve({data:{allowed:true,replayed:true},error:null})},{id:'member'},'fixture-key',id),/already submitted/);
 deepStrictEqual(await reserveArcFlashSubmission({rpc:()=>Promise.resolve({data:{allowed:false,unlimited:false},error:null})},{id:'member'},'fixture-key',id),{allowed:false,unlimited:false});
});
Deno.test('Auto Flash uses only simple submitted greetings and preserves tool, artifact, explicit selection and Work paths',()=>{
 const base={selection:'auto',lastUserText:'hey',stream:false,work:false,toolOrArtifact:false};
 equal(shouldAutoUseFlash(base),true);
 for(const lastUserText of ['build an app','search for weather','hello and delete my files','explain quantum mechanics',{},null]) equal(shouldAutoUseFlash({...base,lastUserText}),false);
 for(const extra of [{selection:'medium'},{stream:true},{work:true},{toolOrArtifact:true}]) equal(shouldAutoUseFlash({...base,...extra}),false);
});
