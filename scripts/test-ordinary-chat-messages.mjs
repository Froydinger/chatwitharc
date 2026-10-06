import assert from 'node:assert/strict';
import {mergeOrdinaryChatMessages as merge} from '../src/lib/ordinaryChatMessages.ts';
const user=(id,content=id)=>({id,role:'user',content,timestamp:'2026-10-06T00:00:00Z'}),reply=(id,content=id)=>({...user(id,content),role:'assistant'});
const turn=(id,uid,status='completed')=>({submission_id:id,user_message:user(uid),assistant_message:reply(id),status});
assert.deepEqual(merge([],[turn('a','u')]).map(x=>x.id),['u','a'],'fresh browser recovers accepted input and reply');
assert.deepEqual(merge([user('u')],[turn('a','u','running')]).map(x=>x.id),['u'],'pending request does not fabricate a reply');
assert.deepEqual(merge([user('u'),reply('a')],[turn('a','u')]).map(x=>x.id),['u','a'],'connected completion is not duplicated');
assert.equal(merge([user('u','edited'),reply('a','edited reply')],[turn('a','u')])[1].content,'edited reply','recovery preserves local edits');
assert.deepEqual(merge([user('u1'),user('u2')],[turn('a2','u2'),turn('a1','u1')]).map(x=>x.id),['u1','a1','u2','a2'],'replies stay beside the corresponding user turn');
assert.deepEqual(merge([user('u','edited')],[turn('old','u')],new Set(['old'])).map(x=>x.id),['u'],'stale recovery cannot resurrect edited-away replies');
assert.deepEqual(merge([user('u','edited')],[turn('old','u'),turn('new','u')],new Set(['old'])).map(x=>x.id),['u','new'],'a new explicit retry survives old reply invalidation');
assert.deepEqual(merge([],[]),[]);
console.log('PASS: cross-browser recovery, pending state, stable-ID deduplication, edit preservation, ordering, stale invalidation and explicit retry');

assert.deepEqual(merge([user('u','edited'),reply('old')],[{...turn('old','u'),invalidated_at:'now',status:'cancelled',assistant_message:null}]).map(x=>x.id),['u'],'remote edit invalidation removes obsolete answer and preserves edited input');
assert.deepEqual(merge([],[{...turn('old','u'),invalidated_at:'now',status:'cancelled'}]),[],'late edited input is not recovered');

assert.deepEqual(merge([user('u'),reply('old')],[],new Set(['old'])).map(x=>x.id),['u'],'pending invalidation suppresses obsolete cached output even without an RPC response');
