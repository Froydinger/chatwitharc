import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path) {
  const js = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={}; new Function('exports','require',js)(exports,require);return exports;
}
const {createVoiceConversationPersistence}=load('src/lib/voiceConversationPersistence.ts');
const {setActiveVoiceConversation,isActiveVoiceConversation,clearActiveVoiceConversation}=load('src/lib/voiceConversationOwnership.ts');
let current, account='owner', turns=[], writes=[], patches=[], release;
let blocker=Promise.resolve();const messages=new Map([['chat-a',[]],['chat-b',[]],['chat-new',[]]]);
const create=(sessionId,callId)=>createVoiceConversationPersistence({sessionId,callId,
  canWrite:()=>account==='owner'&&messages.has(sessionId),isCurrent:()=>current?.sessionId===sessionId&&current?.callId===callId,
  getMessages:()=>messages.get(sessionId),readTurns:()=>turns,attachImageToLastAssistantTurn(){},
  append:async(message,options)=>{await blocker;assert.equal(account,'owner');writes.push({message,sessionId:options.sessionId});const list=messages.get(options.sessionId);if(!list.some(x=>x.id===message.id)){const before=list.findIndex(x=>x.id===options.beforeMessageId);if(before<0)list.push(message);else list.splice(before,0,message);}return message.id},
  patch:async(sessionId,id,message,persist)=>{patches.push({sessionId,id,message,persist});const list=messages.get(sessionId);const index=list.findIndex(x=>x.id===id);if(index>=0)list[index]={...list[index],...message}}});
const turn=(text,id,role='user')=>({role,transcript:text,timestamp:new Date(1),...(id?{liveCaptionId:id}:{})});
const first=create('chat-a','first');current={sessionId:'chat-a',callId:'first'};turns=[turn('hello','one'),turn('answer','two','assistant')];
await Promise.all([first.saveTurns(),first.saveTurns(),first.saveTurns(true)]);
assert.equal(writes.length,2);assert.equal(first.savedTurnCount,2);assert.equal(writes[1].message.modelUsed,'gpt-live-1');
// A queued save retains the old call snapshot while another chat/call becomes current.
blocker=new Promise(resolve=>release=resolve);turns=[...turns,turn('late transcript')];const final=first.saveTurns(true);
current={sessionId:'chat-b',callId:'second'};turns=[turn('other call')];const second=create('chat-b','second');
release();await final;await second.saveTurns();
assert.equal(writes[2].sessionId,'chat-a');assert.equal(writes[2].message.content,'late transcript');assert.equal(writes[2].message.id,'voice-first-0');
assert.equal(writes[3].sessionId,'chat-b');assert.equal(writes[3].message.content,'other call');
// Pagehide/repeated-final cannot duplicate or read the new call's turns.
await first.saveTurns(true);assert.equal(writes.length,4);
await first.addMessage({content:'image placeholder',role:'assistant',type:'image-generating',id:'image-one'});
await first.replaceMessage('image-one',{content:'finished image',role:'assistant',type:'image',imageUrl:'private-image://owner/image'});
assert.equal(patches[0].sessionId,'chat-a');assert.equal(patches[0].persist,true);assert.equal(first.getMessages()[0].content,'hello');
// Late snapshots queued before a restart remain bound to their original call.
turns=[...turns,turn('second final','three','assistant')];const secondFinal=second.saveTurns(true);
const third=create('chat-new','third');current={sessionId:'chat-new',callId:'third'};turns=[turn('new voice')];
await secondFinal;await third.saveTurns();assert.equal(writes.at(-2).sessionId,'chat-b');assert.equal(writes.at(-1).sessionId,'chat-new');
// A late user insertion before an already-saved assistant must neither vanish nor duplicate.
turns=[turn('assistant before late user','late-assistant','assistant')];await third.saveTurns();
turns=[turn('late user','late-user'),...turns];await third.saveTurns();
const savedNew=messages.get('chat-new');assert(savedNew.findIndex(x=>x.id==='voice-caption-late-user')<savedNew.findIndex(x=>x.id==='voice-caption-late-assistant'));
const beforeImage=writes.length;turns=[turns[0],{...turns[1],imageUrl:'private-image://owner/final'}];await third.saveTurns(true);assert.equal(writes.length,beforeImage);assert.equal(messages.get('chat-new').find(x=>x.id==='voice-caption-late-assistant').imageUrl,'private-image://owner/final');
// The voice store retains only the most recent 120 turns. New turns keep saving beyond it.
turns=[];for(let i=0;i<145;i++){turns=[...turns,turn(`long call ${i}`,`long-${i}`,i%2?'assistant':'user')].slice(-120);await third.saveTurns()}
assert.equal(messages.get('chat-new').filter(x=>x.id.startsWith('voice-caption-long-')).length,145);
// No-caption legacy turns retain identity across insertion, trim and image object replacement.
turns=[turn('same words',null,'assistant')];await third.saveTurns();const fallback=messages.get('chat-new').at(-1).id;
turns=[{...turns[0],imageUrl:'private-image://owner/fallback'}];await third.saveTurns();assert.equal(messages.get('chat-new').at(-1).id,fallback);assert.equal(messages.get('chat-new').at(-1).imageUrl,'private-image://owner/fallback');
account='other-account';turns=[...turns,turn('must not save')];const before=writes.length;
await assert.rejects(third.saveTurns(true),/owner/);await assert.rejects(async()=>third.replaceMessage('x',{role:'assistant',type:'text',content:'blocked'}),/owner/);assert.equal(writes.length,before);
account='owner';messages.delete('chat-new');await assert.rejects(third.saveTurns(),/owner/);
setActiveVoiceConversation({ownerId:'owner',sessionId:'chat-a'});assert(isActiveVoiceConversation('chat-a'));assert(!isActiveVoiceConversation('chat-b'));
clearActiveVoiceConversation('chat-b');assert(isActiveVoiceConversation('chat-a'));clearActiveVoiceConversation('chat-a');assert(!isActiveVoiceConversation('chat-a'));
const controller=readFileSync(new URL('../src/components/VoiceModeController.tsx',import.meta.url),'utf8');
assert(controller.includes('conversation?.sessionId ?? useArcStore.getState().currentSessionId'));
assert(controller.includes('conversation?.getMessages() ?? useArcStore.getState().messages'));
assert(controller.includes('!conversation.isCurrent() || useVoiceModeStore.getState().isActive'));
assert(controller.includes('if (conversation) return conversation.saveTurns(final)'));
console.log('PASS Workspace voice ownership: chat/new-chat switching, stable caption IDs, queued/pagehide dedupe, late final snapshots, restarted call separation, image patches, owner/deleted-session rejection. No network or devices.');
