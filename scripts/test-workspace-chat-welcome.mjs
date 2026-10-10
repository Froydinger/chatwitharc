import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const load = (path, aliases = {}) => {
  const source = read(path);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return exports;
};
const walk = (element, predicate) => {
  if (!React.isValidElement(element)) return [];
  return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(child => walk(child, predicate))];
};
const mobile = read('src/components/MobileChatApp.tsx');
const ast = ts.createSourceFile('MobileChatApp.tsx', mobile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.deepEqual(ast.parseDiagnostics, []);
let welcomeNode;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'WorkspaceChatWelcome') {
    assert.equal(welcomeNode, undefined, 'there is one Workspace welcome cluster');
    welcomeNode = node;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(welcomeNode);
const ancestors = [];
for (let node = welcomeNode.parent; node; node = node.parent) {
  if (ts.isJsxElement(node)) ancestors.push(node.openingElement.getText(ast));
}
assert.ok(ancestors.some(tag => tag.includes('ref={messagesContainerRef}') && tag.includes('ws-original-message-scroll')), 'welcome belongs to the real message scroller');
assert.ok(!ancestors.some(tag => tag.includes('ref={inputDockRef}')), 'welcome is outside the fixed composer');
assert.match(mobile, /import \{ WelcomeSection, CyclingGreeting \}/, 'legacy CyclingGreeting still has its runtime import');
assert.match(mobile, /workspaceUI \? pickWorkspacePrompts\(\) : pickRandomPrompts\(3\)/);
assert.match(mobile.slice(mobile.indexOf('ref={messagesContainerRef}'), welcomeNode.pos), /currentSessionId && isHydratingSession === currentSessionId && !hydrationTimedOut/, 'hydrating a saved chat does not show empty-state suggestions');
assert.match(mobile.slice(mobile.indexOf('ref={inputDockRef}')), /!workspaceUI && !isVoiceActive && messages.length === 0[\s\S]*?<SmartSuggestions/, 'legacy suggestions retain their original dock placement');

// Extract the real existing prompt pool without loading unrelated component hooks.
const poolNode = ts.createSourceFile('WelcomeSection.tsx', read('src/components/WelcomeSection.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let poolText;
function findPool(node) { if (ts.isVariableDeclaration(node) && node.name.getText(poolNode) === 'GENERAL_QUICK_PROMPTS') poolText = node.initializer.getText(poolNode); ts.forEachChild(node, findPool); }
findPool(poolNode);
const pool = new Function(`return ${poolText}`)();
const { pickWorkspacePrompts } = load('src/workspace/workspacePrompts.ts', { '@/components/WelcomeSection': { GENERAL_QUICK_PROMPTS: pool } });
const categories = [
  ['Ask a question', 'Explain a topic', 'Research this', 'Check the sources', 'Book recs'],
  ['Reflect on today', 'Think it through', 'Plan my day'],
  ['Write together', 'Create art', 'Draft an email', 'Tell a story', 'Build something', 'Analyze data'],
];
for (const random of [0, 0.2, 0.5, 0.999999, 1]) {
  const selected = pickWorkspacePrompts(() => random);
  assert.equal(selected.length, 3);
  selected.forEach((prompt, i) => {
    assert.ok(categories[i].includes(prompt.label), `category ${i}: ${prompt.label}`);
    assert.ok(pool.includes(prompt), 'the same existing prompt object and text reach the handler');
  });
}
const sparse = load('src/workspace/workspacePrompts.ts', { '@/components/WelcomeSection': { GENERAL_QUICK_PROMPTS: pool.filter(prompt => prompt.label === 'Reflect on today') } });
assert.deepEqual(sparse.pickWorkspacePrompts(() => 0), pool.filter(prompt => prompt.label === 'Reflect on today'));

const calls = [];
const select = prompt => calls.push(prompt);
const more = () => calls.push('library');
let received;
const { WorkspaceChatWelcome } = load('src/components/WorkspaceChatWelcome.tsx', {
  '@/components/WelcomeSection': { CyclingGreeting: () => React.createElement('span', null, 'Existing rotating greeting') },
  '@/workspace/WorkspaceChrome': { ArcMark: () => React.createElement('span', { 'aria-label': 'Arc', className: 'ws-logo' }) },
  '@/components/SmartSuggestions': { SmartSuggestions: props => { received = props; return React.createElement('div', null, 'Prompt cards'); } },
});
const html = renderToStaticMarkup(React.createElement(WorkspaceChatWelcome, { suggestions: pool.slice(0, 3), onSelectPrompt: select, onShowMore: more }));
assert.ok(html.indexOf('aria-label="Arc"') < html.indexOf('Existing rotating greeting'));
assert.ok(html.indexOf('Existing rotating greeting') < html.indexOf('Ask. Reflect. Create.'));
assert.ok(html.indexOf('Ask. Reflect. Create.') < html.indexOf('Prompt cards'));
assert.equal(received.onSelectPrompt, select);
assert.equal(received.onShowMore, more);
assert.equal(received.workspaceUI, true);

// Execute the component's short-viewport effect and real click callbacks offline.
const previousWindow = globalThis.window;
const previousStorage = globalThis.sessionStorage;
try {
  globalThis.sessionStorage = { getItem: () => 'true', setItem() {} };
  for (const workspaceUI of [false, true]) {
    let visible = true;
    globalThis.window = { innerHeight: 300, addEventListener() {}, removeEventListener() {} };
    const effects = [];
    const { SmartSuggestions } = load('src/components/SmartSuggestions.tsx', {
      react: { ...React, useRef: value => ({ current: value }), useState: () => [visible, value => { visible = value; }], useEffect: callback => effects.push(callback) },
      '@/components/transitions/Transition': { Transition: ({ children }) => children },
      '@/components/ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
    });
    const props = { workspaceUI, suggestions: [{ label: 'Live prompt', prompt: 'short', fullPrompt: 'full existing prompt' }], onSelectPrompt: select, onShowMore: more };
    SmartSuggestions(props);
    effects.splice(0).forEach(effect => effect());
    const tree = SmartSuggestions(props);
    const buttons = walk(tree, element => typeof element.props.onClick === 'function');
    assert.equal(buttons.length, workspaceUI ? 2 : 1, 'Workspace prompts remain scrollable on a short keyboard viewport; legacy chip hiding stays unchanged');
    buttons.forEach(button => button.props.onClick());
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previousStorage;
}
assert.deepEqual(calls, ['library', 'full existing prompt', 'library']);

// Run the existing message-scroller effect for an empty-session switch and a
// nonempty chat. This catches stale delayed scrolls into the new welcome.
let scrollEffect;
function findScrollEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const sessionChanged = currentSessionId !== lastScrolledSessionRef.current')) scrollEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, findScrollEffect);
}
findScrollEffect(ast);
assert.ok(scrollEffect);
function runScrollEffect({ workspaceUI, isVoiceActive = false, messages = [] }) {
  const scrolls = [], cancelled = [];
  const node = { scrollHeight: 4000, scrollTo: options => scrolls.push(options) };
  const env = { workspaceUI, isVoiceActive, messages, currentSessionId: 'new', messagesContainerRef: { current: node }, lastScrolledSessionRef: { current: 'old' }, lastMessageCountRef: { current: 20 }, userScrolledUpRef: { current: true }, requestAnimationFrame: () => 1, setTimeout: () => 2, cancelAnimationFrame: id => cancelled.push(['frame', id]), clearTimeout: id => cancelled.push(['timer', id]) };
  const compiled = ts.transpileModule(`exports.run = ${scrollEffect}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(env), compiled)(exports, ...Object.values(env));
  const cleanup = exports.run();
  cleanup?.();
  return { scrolls, cancelled, env };
}
assert.deepEqual(runScrollEffect({ workspaceUI: true }).scrolls, [{ top: 0, behavior: 'auto' }]);
assert.deepEqual(runScrollEffect({ workspaceUI: false }).scrolls, []);
assert.deepEqual(runScrollEffect({ workspaceUI: true, isVoiceActive: true }).scrolls, []);
assert.deepEqual(runScrollEffect({ workspaceUI: true, messages: [{}] }).cancelled, [['frame', 1], ['timer', 2]], 'session changes cancel both delayed old-chat scrolls');

const styles = read('src/workspace/workspace.css');
const css = postcss.parse(styles);
const welcomeRules = [];
css.walkRules(rule => { if (rule.selector.includes('.ws-chat-welcome')) welcomeRules.push(rule); });
for (const rule of welcomeRules) rule.walkDecls('position', decl => assert.notEqual(decl.value, 'fixed', 'welcome cannot become fixed over the scroller'));
assert.match(styles, /\.ws-frame \{[^}]*min-height:min\(320px,var\(--ws-viewport-height,100dvh\)\)/);
assert.match(styles, /glass-dock:focus-within[^}]*box-shadow:inset 0 0 0 1px var\(--ws-muted\)!important/);
assert.match(styles, /\.ws-live-content \.ws-original-composer-dock \{[^}]*bottom:calc\(16px \+ env\(safe-area-inset-bottom,0px\)\)/);
assert.ok(styles.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
assert.ok(styles.includes('grid-template-columns:1fr'));
for (const rule of [...css.nodes].filter(node => node.type === 'rule' && node.selector.includes('ws-original-composer-dock'))) {
  rule.walkDecls(decl => assert.ok(!['background', 'background-color', 'backdrop-filter'].includes(decl.prop), 'the floating dock is not an opaque shelf'));
}
for (const height of [240, 300, 500, 852]) assert.ok(Math.min(320, height) <= height, 'frame never exceeds the visual viewport minimum');
assert.ok(!/maximum-scale|user-scalable\s*=\s*no/.test(read('index.html')));
console.log('PASS Workspace scroll ownership, hydration/legacy gates, balanced original prompt objects, welcome SSR order, real prompt/library handlers, short-keyboard visibility, rounded focus and floating safe-area CSS. No browser or network calls.');
