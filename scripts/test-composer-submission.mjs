import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function load(path) {
  const exports = {};
  new Function('exports', transpile(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '')))(exports);
  return exports;
}
const routing = load('../supabase/functions/_shared/arcModelRouting.ts');
const intent = load('../src/lib/chat-input/intent.ts');
const { createComposerActivity } = load('../src/lib/chat-input/activity.ts');
const types = load('../src/lib/chat-input/types.ts');
const { createComposerSubmitter } = load('../src/hooks/chat-input/useComposerSubmission.ts');
const appIntent = load('../src/utils/appBuilderIntent.ts');
const source = readFileSync(new URL('../src/components/ChatInput.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('input.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function arrow(name) {
  let node;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) node = n.initializer; ts.forEachChild(n, visit); }
  visit(ast); assert.ok(node, name); return transpile(`return (${node.getText(ast)});`);
}
const workspace = { isOpen: false, canvasType: 'writing', content: '', codeLanguage: 'html' };
const scope = { ownerId: 'owner', sessionId: 'chat-a', executionMode: 'ask' };
const request = (overrides = {}) => types.snapshotComposerRequest({
  ...scope, content: 'hey', images: [], documents: [], corporateMode: false, hasExistingApp: false,
  modes: { image: false, code: false, canvas: false, search: true, git: false, regularChat: false, editImages: false },
  workspace, modelSelection: 'gpt-6.1-sol', imageOptions: { quality: 'low', aspect: 'auto', editAspect: 'auto', count: 1 }, ...overrides,
});
function fixture(options = {}) {
  const calls = []; const failed = []; let resolveProvider, rejectProvider;
  const state = { currentSessionId: 'chat-a', isLoading: false, isGeneratingImage: false,
    messages: [], chatSessions: [{ id: 'chat-a', messages: [], title: 'Saved fixture' }],
    addMessage: async (message, opts) => {
      calls.push(['message', message, opts]);
      const id = message.id || crypto.randomUUID();
      const session = state.chatSessions.find(item => item.id === opts.sessionId);
      if (session && !session.messages.some(item => item.id === id)) session.messages.push({ ...message, id });
      if (session?.id === state.currentSessionId) state.messages = session.messages;
      if (opts.awaitCloudPersistence) await options.messageSave?.(message, opts);
      return id;
    },
    setActiveTask: value => calls.push(['task', value]), setActiveStatusDetails: value => calls.push(['status', value]),
  };
  const deps = {
    normalizeModelSelection: routing.normalizeArcModelSelection, useModelStore: { getState: () => ({ modelSelection: 'auto' }) },
    ...intent, ...types, LUNA_MODEL: "gpt-6-luna",
    inputValue: 'newer draft', selectedImages: [new File(['new'], 'new.png', { type: 'image/png' })], selectedDocuments: [],
    shouldShowBanana: true, shouldShowCodeMode: true, shouldShowCanvasMode: true, shouldShowSearchMode: true, shouldShowGitMode: true,
    forceRegularChatMode: false, allImagesEditMode: true, imageGenAspect: 'portrait', imageEditAspect: 'portrait', imageGenCount: 3, imageGenModel: 'gpt-image-2.5-flare', imageEditModel: 'gpt-image-2.5-sunburst',
    dispatchScopeRef: { current: scope }, createNewSession: () => 'chat-a', clearComposer: () => calls.push(['clear-draft']),
    captureComposerRequest: () => request(), useArcStore: { getState: () => state },
    useMessageQueueStore: { getState: () => ({ retainFailure: (captured, error) => failed.push({ captured, error }) }) },
    isLoading: false, user: { id: 'owner' }, isAnonymous: false, isGuestMode: false, isArcWorkMode: false,
    isLocalChatPreview: () => false, requireAuth: () => calls.push(['auth']), canSubmitCloudTextWhileBusy: () => false,
    enqueueComposerRequest: (...args) => calls.push(['queue', ...args]), useIDEStore: { getState: () => ({}) },
    subscriptionLoading: false, hasBoost: true, isAdmin: true, canGenerateVideo: false, isWriteCanvasOpen: false,
    getAppBuilderIntent: appIntent.getAppBuilderIntent, parseSubagentDirective: () => ({ requested: false }),
    isAppBuilderDesktopAvailable: () => true,
    requestsCurrentLocation: () => false, useCorporateModeStore: { getState: () => ({ enabled: false }) },
    useCanvasStore: { getState: () => ({ ...workspace, isOpen: true, content: 'newer canvas' }) },
    setLoading: value => { state.isLoading = value; calls.push(['loading', value]); },
    setSearchingChats: value => calls.push(['chats', value]), setAccessingMemory: value => calls.push(['memory', value]),
    setSearchingWeb: value => calls.push(['web', value]), predictActivity: () => 'web', memoryBlocks: [],
    cancelRequested: false, activeForegroundRequestId: null, currentAbortController: null, markSessionAsGit: () => {}, messages: [], profile: {},
    onCloudTextSubmit: undefined, cloudExecutionMode: 'ask', routeRequest: () => 'cloud-chat',
    toast: data => calls.push(['toast', data.title]), console: { log() {}, warn() {} }, window: { dispatchEvent() {}, setTimeout },
    FileReader: class {
      result = 'data:text/plain;base64,Zml4dHVyZQ==';
      readAsDataURL() { queueMicrotask(() => this.onload()); }
    },
    AIService: class {
      constructor(selection) { calls.push(['reasoning', selection]); }
      async sendMessageWithDocument(_messages, _bytes, name) {
        calls.push(['document', name]);
        throw new Error('Synthetic document failure');
      }
      sendMessage(...args) {
        calls.push(['provider', args]);
        return new Promise((resolve, reject) => { resolveProvider = resolve; rejectProvider = reject;
          args[11]?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }); });
      }
    },
    createComposerActivity, foregroundSubmissionRef: { current: false }, foregroundOwnerRef: { current: null },
    ...options,
  };
  state.setLoading = deps.setLoading;
  state.setGeneratingImage = value => { state.isGeneratingImage = value; };
  state.setSearchingChats = deps.setSearchingChats;
  state.setAccessingMemory = deps.setAccessingMemory;
  state.setSearchingWeb = deps.setSearchingWeb;
  deps.executeRequest = new Function('deps', `with(deps){${arrow('executeRequest')}}`)(deps);
  const send = createComposerSubmitter({ ownerId: deps.user?.id ?? null, inputValue: deps.inputValue, canSubmitWork: deps.canSubmitCloudTextWhileBusy, execute: deps.executeRequest, enqueue: deps.enqueueComposerRequest, busyRef: deps.foregroundSubmissionRef, ownerRef: deps.foregroundOwnerRef });
  return { send, deps, state, calls, failed,
    resolve: () => resolveProvider({ content: 'complete reply', modelUsed: 'gpt-6-luna', reasoningEffortUsed: 'medium', toolsUsed: ['web_search'] }),
    reject: () => rejectProvider(new Error('Synthetic provider failure')),
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const first = request();
const f = fixture();
const pending = f.send(undefined, first);
await tick();
assert.equal(f.calls.filter(c => c[0] === 'provider').length, 1, 'Captured text is sent as text despite newer selected image/modes');
assert.equal(f.calls.find(c => c[0] === 'provider')[1][4], true, 'Captured search flag is passed');
assert.equal(f.calls.find(c => c[0] === 'reasoning')[1], 'gpt-6.1-sol');
assert.ok(f.calls.findIndex(c => c[0] === 'loading' && c[1]) < f.calls.findIndex(c => c[0] === 'message'), 'Accepted indicator precedes preparation await');
await f.send(undefined, first);
assert.equal(f.calls.filter(c => c[0] === 'provider').length, 1, 'Foreground lock prevents concurrent duplicate');
f.state.currentSessionId = 'chat-b';
f.resolve(); await pending;
assert.equal(f.calls.filter(c => c[0] === 'clear-draft').length, 0, 'Queued dispatch preserves newer draft');
assert.ok(f.calls.filter(c => c[0] === 'message').every(c => c[2].sessionId === 'chat-a'), 'Late completion stays in original chat');
assert.equal(f.state.isLoading, false);
const failure = fixture();
const failedPending = failure.send(undefined, first); await tick(); failure.reject(); await failedPending;
assert.equal(failure.failed.length, 1);
assert.equal(failure.failed[0].captured, first);
assert.equal(failure.calls.filter(c => c[0] === 'clear-draft').length, 0);
assert.equal(failure.state.isLoading, false);
const cancellation = fixture();
const cancelPending = cancellation.send(undefined, first); await tick();
cancellation.deps.cancelRequested = true; cancellation.deps.activeForegroundRequestId = null; cancellation.deps.currentAbortController.abort(); await cancelPending;
assert.equal(cancellation.failed.length, 0, 'Cancellation does not offer retry or save an error reply');
assert.equal(cancellation.calls.filter(c => c[0] === 'message' && c[1].role === 'assistant').length, 0);
const stale = fixture();
const stalePending = stale.send(undefined, first); await tick();
stale.deps.activeForegroundRequestId = 'newer-request';
stale.state.isLoading = true;
stale.resolve(); await stalePending;
assert.equal(stale.state.isLoading, true, 'Stale completion cannot clear a newer request indicator');
assert.equal(stale.calls.filter(c => c[0] === 'message' && c[1].role === 'assistant').length, 0);
const document = fixture();
const docRequest = request({ content: 'summarize', documents: [new File(['saved doc'], 'original.txt', {type:'text/plain'})] });
await document.send(undefined, docRequest);
assert.equal(document.calls.find(c => c[0] === 'document')[1], 'original.txt');
assert.equal(document.failed[0].captured.documents[0], docRequest.documents[0]);
assert.equal(document.calls.filter(c => c[0] === 'clear-draft').length, 0);
const appCalls = [];
const editedApp = fixture({ selectedImages: [],
  getAppBuilderIntent: (content, hasExistingApp) => { assert.equal(hasExistingApp, false); return appIntent.getAppBuilderIntent(content, hasExistingApp); },
  useIDEStore: { getState: () => ({ ideProjectId: 'newer-app', ideFiles: {}, openIDECanvas: prompt => appCalls.push(prompt) }) },
});
await editedApp.send(undefined, request({ content: '/app recipe planner', modes: {...first.modes, search:false} }));
assert.deepEqual(appCalls, ['recipe planner'], 'Edited queued text is reclassified with captured app context');
assert.equal(editedApp.calls.filter(c => c[0] === 'clear-draft').length, 0);
const denied = fixture({ hasBoost: false, openCheckout: () => {} });
assert.equal(await denied.send(undefined, request({ images: [new File(['old'],'original.png',{type:'image/png'})], modes: {...first.modes, editImages:true} })), false);
assert.equal(denied.calls.filter(c => c[0] === 'clear-draft').length, 0);
assert.equal(denied.calls.filter(c => c[0] === 'provider').length, 0);
const workScope = { ...scope, executionMode: 'auto' };
const work = fixture({ dispatchScopeRef: { current: workScope }, isArcWorkMode: true, cloudExecutionMode: 'auto',
  onCloudTextSubmit: async () => { throw new Error('Lost acknowledgement'); } });
await work.send(undefined, request({ executionMode: 'auto' }));
assert.equal(work.failed.length, 0, 'Uncertain durable acknowledgement never becomes duplicate manual retry');
assert.equal(work.calls.filter(c => c[0] === 'provider').length, 0, 'Work never silently falls back to Chat');
console.log('Production composer adapter checks passed: snapshot route/model, prompt indicator, atomic foreground lock, original-session result, preserved newer draft, failure recovery, cancellation and uncertain Work handoff.');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const delayedSave = deferred();
const ordered = fixture({ messageSave: () => delayedSave.promise });
const orderedPending = ordered.send(undefined, first);
await tick();
assert.equal(ordered.state.messages.filter(message => message.role === 'user').length, 1, 'User bubble appears before the save finishes');
assert.equal(ordered.calls.filter(call => call[0] === 'provider').length, 0, 'Provider cannot race delayed first-message persistence');
assert.deepEqual(ordered.calls.find(call => call[0] === 'message')[2].awaitCloudPersistence, { ownerId: 'owner' });
delayedSave.resolve(); await tick();
assert.equal(ordered.calls.filter(call => call[0] === 'provider').length, 1);
ordered.resolve(); await orderedPending;

let saveFails = true;
const failedSave = fixture({ messageSave: async () => { if (saveFails) throw new Error('Synthetic save failure'); } });
await failedSave.send(undefined, first);
assert.equal(failedSave.calls.filter(call => call[0] === 'provider').length, 0);
assert.equal(failedSave.failed[0].captured, first, 'Failed save retains the original complete request for manual retry');
assert.equal(failedSave.state.isLoading, false);
assert.equal(failedSave.state.messages[0].content, first.content, 'The draft remains in the owning chat');
saveFails = false;
failedSave.deps.messages = [...failedSave.state.messages];
const retryPending = failedSave.send(undefined, first); await tick();
assert.equal(failedSave.state.messages.filter(message => message.role === 'user').length, 1, 'Retry reuses the same user-message ID');
const retryMessages = failedSave.calls.find(call => call[0] === 'provider')[1][0];
assert.equal(retryMessages.filter(message => message.role === 'user').length, 1, 'Retry submits the user turn only once in provider history');
assert.ok(retryMessages.find(message => message.role === 'user').content.includes(first.content));
failedSave.resolve(); await retryPending;

for (const change of ['cancel', 'owner', 'navigation', 'deleted']) {
  const saved = deferred();
  const waiting = fixture({ messageSave: () => saved.promise });
  const pending = waiting.send(undefined, first); await tick();
  if (change === 'cancel') {
    waiting.deps.cancelRequested = true;
    waiting.deps.activeForegroundRequestId = null;
  } else if (change === 'owner') {
    waiting.deps.dispatchScopeRef.current = { ...scope, ownerId: 'another-owner' };
  } else if (change === 'navigation') {
    waiting.state.currentSessionId = 'chat-b';
    waiting.deps.dispatchScopeRef.current = { ...scope, sessionId: 'chat-b' };
  } else {
    waiting.state.chatSessions = [];
  }
  saved.resolve(); await pending;
  assert.equal(waiting.calls.filter(call => call[0] === 'provider').length, 0, `${change} during save must not spend on a provider request`);
  assert.equal(waiting.calls.filter(call => call[0] === 'message' && call[1].role === 'assistant').length, 0);
  assert.equal(waiting.failed.length, change === 'navigation' ? 1 : 0, `${change} has the correct retry visibility`);
  if (change === 'navigation') {
    assert.equal(waiting.failed[0].captured.sessionId, 'chat-a', 'Navigation retains retry in its original chat');
    waiting.state.currentSessionId = 'chat-a';
    waiting.deps.dispatchScopeRef.current = scope;
    waiting.deps.messages = [...waiting.state.messages];
    const returned = waiting.send(undefined, first); await tick();
    assert.equal(waiting.state.messages.filter(message => message.role === 'user').length, 1);
    waiting.resolve(); await returned;
  }
}
const workMessage = work.calls.find(call => call[0] === 'message');
assert.equal(workMessage[2].deferCloudPersistence, true);
assert.equal(workMessage[2].awaitCloudPersistence, undefined, 'Durable Work still delegates its transactional save');
console.log('Chat startup ordering passed: immediate bubble, delayed/failed save, stable manual retry, owner switch, Stop, navigation and deleted-session fences before provider calls.');

let rejectOlderSave = true;
const olderRequest = request({ content: 'Question A', modes: { ...first.modes, search: false } });
const newerRequest = request({ content: 'Question B', modes: { ...first.modes, search: false } });
const olderRetry = fixture({ messageSave: async () => { if (rejectOlderSave) throw new Error('First save failed'); } });
await olderRetry.send(undefined, olderRequest);
rejectOlderSave = false;
olderRetry.deps.messages = [...olderRetry.state.messages];
const newerPending = olderRetry.send(undefined, newerRequest); await tick(); olderRetry.resolve(); await newerPending;
olderRetry.deps.messages = [...olderRetry.state.messages];
const olderPending = olderRetry.send(undefined, olderRequest); await tick();
const olderCall = olderRetry.calls.filter(call => call[0] === 'provider').at(-1)[1];
assert.equal(olderCall[14], olderRequest.id, 'Production composer passes the submitted A ID after newer B');
assert.equal(olderCall[0].at(-1).content, 'Question A');
assert.equal(olderRetry.state.messages.filter(message => message.id === olderRequest.id).length, 1);
olderRetry.resolve(); await olderPending;
console.log('Older manual retry keeps its original user-message identity through the production AIService call.');
