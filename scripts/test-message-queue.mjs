import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { create } from 'zustand';
function module(path, deps = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(deps), code)(exports, ...Object.values(deps));
  return exports;
}
const types = module('../src/lib/chat-input/types.ts');
const { snapshotComposerRequest, ownsComposerRequest } = types;
const store = module('../src/store/useMessageQueueStore.ts', { create, ownsComposerRequest }).useMessageQueueStore;
const scope = { ownerId: 'owner', sessionId: 'chat-a', executionMode: 'ask' };
const images = [new File(['first'], 'first.png', { type: 'image/png' })];
const documents = [new File(['document'], 'notes.txt', { type: 'text/plain' })];
const request = content => snapshotComposerRequest({
  ...scope, content, images, documents, reasoningSelection: 'medium', corporateMode: false, hasExistingApp: false,
  modes: { image: false, code: false, canvas: false, search: true, git: false, regularChat: true, editImages: false },
  imageOptions: { aspect: 'auto', editAspect: 'auto', count: 1, generationModel: 'gemini-3.1-flash-image', editModel: 'gemini-3.1-flash-image' },
  workspace: { isOpen: false, content: '', canvasType: 'writing', codeLanguage: 'html' },
});
const first = request('first');
const second = request('second');
images.length = 0; documents.length = 0;
assert.equal(first.images[0].name, 'first.png');
assert.equal(await first.documents[0].text(), 'document');
assert.ok(Object.isFrozen(first) && Object.isFrozen(first.images) && Object.isFrozen(first.modes));
store.getState().addToQueue(first);
store.getState().addToQueue(first);
store.getState().addToQueue(second);
assert.equal(store.getState().queue.length, 2, 'Duplicate request id is ignored');
for (const wrong of [{ ...scope, sessionId: 'chat-b' }, { ...scope, ownerId: 'other' }, { ...scope, executionMode: 'auto' }]) {
  assert.equal(store.getState().popNext(wrong), null);
  assert.equal(store.getState().queue.length, 2);
}
assert.equal(store.getState().popNext(scope, second.id), null, 'A later id cannot skip FIFO');
store.getState().pause(); store.getState().pause();
assert.equal(store.getState().isPaused, true);
assert.equal(store.getState().popNext(scope), null);
assert.deepEqual(store.getState().queue.map(item => item.content), ['first', 'second']);
store.getState().togglePause();
assert.equal(store.getState().popNext(scope, first.id), first);
assert.equal(store.getState().popNext(scope, first.id), null, 'Atomic claim prevents duplicate timer/button dispatch');
store.getState().editInQueue(second.id, 'edited');
assert.equal(store.getState().queue[0].content, 'edited');
assert.equal(store.getState().queue[0].imageOptions.generationModel, 'gemini-3.1-flash-image', 'Editing queued text retains the captured image provider');
assert.ok(Object.isFrozen(store.getState().queue[0].imageOptions));
assert.equal(store.getState().queue[0].images[0], second.images[0]);
store.getState().reorderQueue(-1, 20);
assert.equal(store.getState().queue.length, 1);
store.getState().retainFailure(first, 'synthetic failure');
assert.equal(store.getState().isPaused, true);
assert.equal(store.getState().failed[0].request.images[0], first.images[0]);
assert.equal(store.getState().takeFailure({ ...scope, sessionId: 'other-chat' }, first.id), null);
assert.equal(store.getState().takeFailure(scope, first.id).request, first);
assert.equal(store.getState().takeFailure(scope, first.id), null, 'Repeated Retry cannot dispatch twice');
store.getState().retainFailure(first, 'second failure');
store.getState().discardOtherOwners('other');
assert.equal(store.getState().queue.length, 0, 'Logout/account switch discards private requests');
assert.equal(store.getState().failed.length, 0, 'Account switch discards private recovery too');
const input = readFileSync(new URL('../src/components/ChatInput.tsx', import.meta.url), 'utf8');
const cancellation = input.slice(input.indexOf('export const cancelCurrentRequest'), input.indexOf('/**', input.indexOf('export const cancelCurrentRequest')));
assert.ok(cancellation.indexOf('.pause()') < cancellation.indexOf('store.setLoading(false)'));
console.log('Queue checks passed: immutable Files/modes, owner/chat/route hold, FIFO, idempotent Stop, explicit resume, atomic claim, edit retention and account cleanup.');
