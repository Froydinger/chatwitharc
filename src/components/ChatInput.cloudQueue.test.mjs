import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./ChatInput.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ChatInput.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(predicate) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node.getText(ast)); ts.forEachChild(node, visit); }
  visit(ast); assert.equal(found.length, 1); return found[0];
}
const helper = extract(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'canSubmitCloudTextWhileBusy');
const busy = extract(n => ts.isIfStatement(n) && n.expression.getText(ast).startsWith('(isLoading || storeIsLoading || storeIsGenerating)'));
const keyboard = extract(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleKeyPress');
function fixture(overrides = {}) {
  const calls = [];
  const deps = {
    onCloudTextSubmit() {}, user: { id: 'owner' }, isAnonymous: false, isGuestMode: false,
    isLocalChatPreview: () => false, useCorporateModeStore: { getState: () => ({ enabled: false }) },
    selectedImages: [], selectedDocuments: [], shouldShowBanana: false, shouldShowBuildMode: false,
    shouldShowCanvasMode: false, shouldShowCodeMode: false, shouldShowSearchMode: false,
    canGenerateVideo: false, messages: [], analyzeImageRequestIntent: () => 'none', routeRequest: () => 'cloud-chat',
    ...Object.fromEntries(['checkForImageRequest', 'checkForBuildRequest', 'checkForVideoRequest',
      'isImageEditRequest', 'isAnimateImageRequest', 'checkForSearchRequest', 'shouldForceVideoSearch',
      'checkForCanvasRequest', 'checkForCodingRequest'].map(name => [name, () => false])),
    isLoading: true, storeIsLoading: false, storeIsGenerating: false, messageToSend: 'next',
    cloudExecutionMode: undefined,
    messageOverride: undefined, inputValue: 'next',
    useMessageQueueStore: { getState: () => ({ addToQueue: text => calls.push(['queue', text]) }) },
    setInputValue: text => calls.push(['input', text]), handleSend: () => calls.push(['send']),
    ...overrides,
  };
  const code = ts.transpileModule(`const ${helper}; const ${keyboard};
    return {eligible: canSubmitCloudTextWhileBusy, keyboard: handleKeyPress,
      busy: () => { ${busy} return 'continue-existing-send'; }};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { ...new Function(...Object.keys(deps), code)(...Object.values(deps)), calls };
}
test('active cloud text continues existing session/message/intent flow instead of local queue', () => {
  for (const state of [{}, { isLoading: false, storeIsLoading: true }, { isLoading: false, storeIsGenerating: true }]) {
    const f = fixture(state);
    assert.equal(f.busy(), 'continue-existing-send'); assert.deepEqual(f.calls, []);
  }
});
test('legacy, attachments and specialized image/app routes retain busy queue behavior', () => {
  for (const overrides of [
    { onCloudTextSubmit: undefined }, { user: null }, { isAnonymous: true }, { isGuestMode: true },
    { isLocalChatPreview: () => true }, { useCorporateModeStore: { getState: () => ({ enabled: true }) } },
    { selectedImages: [{}] }, { selectedDocuments: [{}] },
    { shouldShowBanana: true }, { shouldShowBuildMode: true }, { analyzeImageRequestIntent: () => 'generate' },
    { analyzeImageRequestIntent: () => 'ask' }, { checkForImageRequest: () => true },
    { messages: [{ role: 'assistant', type: 'image' }], isImageEditRequest: () => true },
  ]) {
    const f = fixture(overrides); assert.equal(f.eligible('next'), false);
    f.busy(); assert.deepEqual(f.calls[0], ['queue', 'next']);
  }
});
test('ready Local AI does not make ordinary signed-in Arc Chat ephemeral', () => {
  const f = fixture({ routeRequest: () => 'local' });
  assert.equal(f.eligible('next'), true);
  f.busy();
  assert.deepEqual(f.calls, []);
});
test('Arc Work keeps ordinary conversation durable without forcing extra agent steps', () => {
  const conversational = fixture({ cloudExecutionMode: 'auto' });
  assert.equal(conversational.eligible('what do you think?'), true);
  conversational.busy();
  assert.deepEqual(conversational.calls, []);
});
test('Ctrl/Cmd Enter submits eligible cloud text immediately; legacy remains queued', () => {
  for (const key of ['ctrlKey', 'metaKey']) {
    const event = { key: 'Enter', [key]: true, preventDefault() {} };
    const cloud = fixture(); cloud.keyboard(event); assert.deepEqual(cloud.calls, [['send']]);
    const legacy = fixture({ selectedDocuments: [{}] }); legacy.keyboard(event);
    assert.deepEqual(legacy.calls, [['queue', 'next'], ['input', '']]);
  }
});
