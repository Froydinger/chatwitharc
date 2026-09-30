import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const modelSource = readFileSync(new URL('../src/store/useModelStore.ts', import.meta.url), 'utf8');
const modelAst = ts.createSourceFile('model.ts', modelSource, ts.ScriptTarget.Latest, true);
const functions = modelAst.statements.filter(node => ts.isFunctionDeclaration(node) && ['canSeeFlynnPreview', 'getModelDisplayName', 'resolveReasoningEffort'].includes(node.name?.text));
const exports = {};
new Function('exports', transpile(functions.map(node => node.getText(modelAst)).join('\n')))(exports);
assert.equal(exports.canSeeFlynnPreview({ email: ' JAKEFROYDINGER@gmail.com ' }), true);
for (const user of [null, {}, { email: 'another@example.com' }, { email: 'jakefroydinger@gmail.com', is_anonymous: true }]) assert.equal(exports.canSeeFlynnPreview(user), false);
assert.equal(exports.getModelDisplayName('flynn'), 'Flynn');
assert.equal(exports.resolveReasoningEffort('flynn', 3, false), 'low');
assert.equal(exports.resolveReasoningEffort('auto', 3, false), 'medium');
assert.equal(exports.resolveReasoningEffort('auto', 3, true), 'high');

const source = readFileSync(new URL('../src/services/ai.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ai.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AIService');
assert.ok(declaration);
const classExports = {};
new Function('exports', 'FLYNN_MODEL', 'useModelStore', transpile(declaration.getText(ast).replaceAll('import.meta.env', '{}')))(classExports, 'gemini-3.8-flash', { getState: () => ({ reasoningEffort: 'medium' }) });
for (const kind of ['code', 'canvas', 'text']) {
  const ai = new classExports.AIService('flynn');
  const calls = [];
  ai.sendMessage = async (...args) => {
    calls.push(args);
    return { content: 'Answer', modelUsed: 'gemini-3.8-flash', reasoningEffortUsed: 'low',
      ...(kind === 'code' ? { codeUpdate: { code: 'const answer = 42;', language: 'js', label: 'Owned code' } } : {}),
      ...(kind === 'canvas' ? { canvasUpdate: { content: 'Owned prose', label: 'Draft' } } : {}),
    };
  };
  const events = [];
  const signal = new AbortController().signal;
  await ai.sendMessageStreaming([{ role: 'user', content: 'fixture' }], {}, kind === 'canvas', kind === 'code',
    mode => events.push(['start', mode]), text => events.push(['delta', text]), result => events.push(['done', result]),
    error => { throw new Error(error); }, 'original-chat', false, signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], 'original-chat');
  assert.equal(calls[0][11], signal);
  assert.equal(events.at(-1)[1].mode, kind);
  assert.equal(events.at(-1)[1].modelUsed, 'gemini-3.8-flash');
  assert.equal(events.at(-1)[1].content, kind === 'code' ? 'const answer = 42;' : kind === 'canvas' ? 'Owned prose' : 'Answer');
}
const mobileSource = readFileSync(new URL('../src/components/MobileChatApp.tsx', import.meta.url), 'utf8');
const mobileAst = ts.createSourceFile('mobile.tsx', mobileSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submission;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(mobileAst) === 'submitCloudText') submission = node.initializer;
  ts.forEachChild(node, visit);
}
visit(mobileAst);
assert.ok(submission);
function expression(name) {
  let found;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(mobileAst) === name) found = node.initializer;
    ts.forEachChild(node, walk);
  }
  walk(submission); assert.ok(found, name);
  return transpile(`return (${found.getText(mobileAst)});`);
}
let currentSelection = 'flynn';
const store = { getState: () => ({ reasoningEffort: currentSelection }) };
for (const original of ['flynn', 'medium']) {
  const intent = { sessionId: 'original-chat', reasoningSelection: original, messages: [{ role: 'user', content: 'hey' }], forceGit: true };
  const captured = new Function('intent', 'useModelStore', expression('captured'))(intent, store);
  currentSelection = original === 'flynn' ? 'medium' : 'flynn';
  const build = new Function('captured', 'workspaceContext', 'useBrowserbaseSessionStore', 'useArcStore', 'FLYNN_MODEL', 'resolveReasoningEffort', 'getQueryComplexity', 'message', expression('buildRequest'))(
    captured, undefined, { getState: () => ({ getSession: () => null }) }, { getState: () => ({ chatSessions: [] }) },
    'gemini-3.8-flash', selection => exports.resolveReasoningEffort(selection, 0, true), () => 0, { content: 'hey' },
  );
  const request = build();
  assert.equal(request.model, original === 'flynn' ? 'gemini-3.8-flash' : undefined);
  assert.equal(request.reasoningEffort, original === 'flynn' ? 'low' : 'medium');
  assert.equal(request.browserbaseDevice, 'desktop');
  assert.deepEqual(request.messages, intent.messages);
}
console.log('Flynn routing passed: owner-only visibility, unchanged Auto tiers, captured selection, original chat/cancellation, code/canvas artifact delivery, and queued Work model/desktop viewport retention.');
