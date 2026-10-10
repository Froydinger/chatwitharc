import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/store/useArcStore.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('store.ts', source, ts.ScriptTarget.Latest, true);
function extract(name) {
  let node;
  function visit(n) {
    if (ts.isPropertyAssignment(n) && n.name.getText(ast) === name) node = n.initializer;
    ts.forEachChild(n, visit);
  }
  visit(ast); assert.ok(node, name);
  return ts.transpileModule(`return (${node.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const code = extract('addMessage');
const first = { id: 'chat-a', title: 'A', messages: [{ id: 'a-user', content: 'first chat', role: 'user' }], createdAt: new Date(), personaId: 'persona-a' };
const second = { id: 'chat-b', title: 'B', messages: [{ id: 'b-user', content: 'second chat', role: 'user' }], createdAt: new Date() };
let state = { currentSessionId: 'chat-b', messages: second.messages, chatSessions: [first, second] };
const saves = [];
const append = new Function('set', 'get', 'cloudSessionOperationsEnabled', code)(
  updater => { state = { ...state, ...updater(state) }; },
  () => ({ saveChatToSupabase: async session => saves.push(session) }), true,
);
await append({ content: 'completed response for A', role: 'assistant', type: 'text' }, { sessionId: 'chat-a' });
assert.equal(state.currentSessionId, 'chat-b');
assert.deepEqual(state.messages, second.messages);
assert.equal(state.chatSessions[0].messages.length, 2);
assert.equal(state.chatSessions[0].messages[1].personaId, 'persona-a');
assert.equal(state.chatSessions[1].messages.length, 1);
assert.equal(saves[0].id, 'chat-a');
await append({ content: 'active chat response', role: 'assistant' });
assert.equal(state.messages.length, 2, 'Existing callers still append to active chat');
assert.equal(saves[1].id, 'chat-b');
await append({ content: 'durable owned turn', role: 'user' }, { sessionId: 'chat-a', deferCloudPersistence: true });
assert.equal(saves.length, 2, 'Durable handoff still defers independent persistence');
assert.equal(state.chatSessions[0].messages.length, 3);
await append({ content: 'deleted chat response', role: 'assistant' }, { sessionId: 'missing' });
assert.equal(state.chatSessions.length, 2, 'A deleted chat is never recreated by late completion');
assert.equal(saves.length, 2);
const bind = name => new Function('set', 'get', 'extractCanvasTitle', extract(name))(
  updater => { state = { ...state, ...updater(state) }; },
  () => ({ ...state, addMessage: append, saveChatToSupabase: async session => saves.push(session) }), () => 'Canvas',
);
const activeBefore = state.messages;
await append({ content: 'Generating image', role: 'assistant', type: 'image-generating' }, { sessionId: 'chat-a' });
await bind('replaceLastMessage')({ content: 'Image ready', role: 'assistant', type: 'image', imageUrl: 'private-image://fixture' }, { sessionId: 'chat-a' });
assert.deepEqual(state.messages, activeBefore);
assert.equal(state.chatSessions[0].messages.at(-1).type, 'image');
await bind('upsertCanvasMessage')('canvas text', 'Owned canvas', undefined, { sessionId: 'chat-a' });
await bind('upsertCodeMessage')('const answer = 42;', 'js', 'Owned code', undefined, { sessionId: 'chat-a' });
assert.deepEqual(state.messages, activeBefore, 'Inactive canvas/code results leave visible chat untouched');
assert.equal(state.currentSessionId, 'chat-b');
assert.deepEqual(state.chatSessions[0].messages.slice(-2).map(m => m.type), ['canvas', 'code']);
assert.ok(saves.slice(2).every(session => session.id === 'chat-a'));
assert.equal(await bind('upsertCodeMessage')('deleted', 'js', undefined, undefined, {sessionId:'missing'}), '');
console.log('Session persistence checks passed: late A completion keeps B untouched, persona ownership, existing active callers, deferred Work save deleted-chat guard, owned image replacement and owned canvas/code results.');
const patchOwned = bind('patchOwnedMessage');
const owner = state.chatSessions[0];
const target = owner.messages[0].id;
const visibleBefore = state.messages;
await patchOwned('chat-a', target, {content:'local partial'});
assert.equal(state.chatSessions[0].messages[0].content,'local partial');
assert.equal(state.messages,visibleBefore);
const lengthBefore = state.chatSessions[0].messages.length;
await patchOwned('chat-a',target,{content:'local final',sourceModel:'local'},true);
assert.equal(state.chatSessions[0].messages.length,lengthBefore,'Finalizing never truncates later messages');
assert.equal(saves.at(-1).id,'chat-a');
assert.equal(saves.at(-1).messages[0].sourceModel,'local');
const savesBefore=saves.length;
await patchOwned('missing',target,{content:'deleted'},true);
await patchOwned('chat-a','missing',{content:'missing'},true);
assert.equal(saves.length,savesBefore);
const activeId=state.messages[0].id;
await patchOwned('chat-b',activeId,{content:'active local'},true);
assert.equal(state.messages[0].content,'active local');
assert.equal(saves.at(-1).id,'chat-b');
let finishSave;
const awaitingPatch = new Function('set','get',extract('patchOwnedMessage'))(
  updater=>{state={...state,...updater(state)};},
  ()=>({saveChatToSupabase:()=>new Promise(resolve=>{finishSave=resolve;})}),
);
let finished=false;
const pendingSave=awaitingPatch('chat-a',target,{content:'awaited'},true).then(()=>{finished=true;});
await Promise.resolve();assert.equal(finished,false,'Completion waits for persistence');
finishSave();await pendingSave;assert.equal(finished,true);
console.log('Owned local patches passed: active/inactive owners, no truncation, missing/deleted targets, source metadata and awaited final persistence.');
// A late voice user turn can precede its saved assistant, only inside its owner.
const activeUnchanged = state.messages;
await append({id:'voice-anchor',role:'assistant',type:'text',content:'assistant final'}, {sessionId:'chat-a'});
await append({id:'voice-late-user',role:'user',type:'text',content:'late user'}, {sessionId:'chat-a',beforeMessageId:'voice-anchor'});
let owned=state.chatSessions.find(session=>session.id==='chat-a').messages;
assert.equal(owned.findIndex(message=>message.id==='voice-late-user')+1,owned.findIndex(message=>message.id==='voice-anchor'));
assert.equal(state.messages,activeUnchanged);
await append({id:'voice-no-anchor',role:'user',type:'text',content:'missing anchor'}, {sessionId:'chat-a',beforeMessageId:'not-in-this-chat'});
owned=state.chatSessions.find(session=>session.id==='chat-a').messages;
assert.equal(owned.at(-1).id,'voice-no-anchor');
const count=owned.length;
await append({id:'voice-late-user',role:'user',type:'text',content:'duplicate retry'}, {sessionId:'chat-a',beforeMessageId:'voice-anchor'});
assert.equal(state.chatSessions.find(session=>session.id==='chat-a').messages.length,count);
await append({id:'normal-append',role:'user',content:'normal append'});
assert.equal(state.messages.at(-1).id,'normal-append');
console.log('Voice late-order options preserve background owner, missing-anchor append, stable-ID dedupe and default active append.');
