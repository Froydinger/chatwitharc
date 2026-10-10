import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const read = path => readFileSync(`${root}${path}`, 'utf8');
const BASELINE = '251d889af61653983b82688fc1c310a0b2d62ebf';
const files = ['CanvasPanel', 'CanvasVersionHistory', 'SearchCanvas', 'PublishModal', 'SiteManageModal', 'ImageModal'];
const print = ts.createPrinter({ removeComments: true });
const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const contracts = source => {
  const collected = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer && /^(handle|persistCurrentCanvas$|formatActions$|editor$|copyUrl$|resetIcon$)/.test(node.name.getText(source))) {
      collected.push([node.name.getText(source), print.printNode(ts.EmitHint.Unspecified, node.initializer, source)]);
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') collected.push(['effect', print.printNode(ts.EmitHint.Unspecified, node, source)]);
    if (ts.isJsxAttribute(node) && /^(onClick|onChange|onKeyDown|onRestore|onPublish|onUpdated|onUnpublished)$/.test(node.name.getText(source))) {
      collected.push([node.name.getText(source), print.printNode(ts.EmitHint.Unspecified, node.initializer, source)]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return collected;
};
let protectedContracts = 0;
for (const name of files) {
  const path = `src/components/${name}.tsx`;
  const source = parse(path, read(path));
  assert.equal(source.parseDiagnostics.length, 0, `${name} parses`);
  const baseline = parse(path, execFileSync('git', ['show', `${BASELINE}:${path}`], { cwd: root, encoding: 'utf8' }));
  const expected = contracts(baseline);
  assert.deepEqual(contracts(source), expected, `${name}: all production handlers, effects, editor configuration and action wiring remain unchanged`);
  protectedContracts += expected.length;
}
const context = read('src/workspace/WorkspaceContext.ts');
assert.match(context, /createContext\(false\)/);
const css = read('src/workspace/workspace-canvas-modes.css');
const cssTree = postcss.parse(css);
// Evaluate the relevant cascade against real emitted DOM. In particular, test
// both load orders and hover so legacy !important Noir rules cannot silently win.
const specificity = selector => {
  const score = nodes => nodes.reduce((total, node) => {
    if (node.type === 'id') return total + 10000;
    if (node.type === 'class' || node.type === 'attribute') return total + 100;
    if (node.type === 'tag') return total + 1;
    if (node.type === 'pseudo') {
      if (node.value === ':where') return total;
      if ([':is', ':not', ':has'].includes(node.value)) return total + Math.max(...node.nodes.map(part => score(part.nodes)));
      return total + (node.value.startsWith('::') ? 1 : 100);
    }
    return total;
  }, 0);
  return score(selectorParser().astSync(selector).first.nodes);
};
const noirRules = [];
postcss.parse(read('src/index.css')).walkRules(rule => {
  if (rule.selector.includes(':root.dark[data-accent="noir"] button') || rule.selector.includes(':root.light[data-accent="noir"] button')) noirRules.push(rule);
});
const surfaceRules = [];
cssTree.walkRules(rule => surfaceRules.push(rule));
function winningValue(element, property, { hover = false, globalLast = false } = {}) {
  let best = null;
  const rules = globalLast ? [...surfaceRules, ...noirRules] : [...noirRules, ...surfaceRules];
  rules.forEach((rule, order) => {
    for (const selector of rule.selectors) {
      if (!hover && selector.includes(':hover')) continue;
      let matches = false;
      try { matches = element.matches(selector.replaceAll(':hover', '')); } catch { continue; }
      if (!matches) continue;
      for (const declaration of rule.nodes) {
        if (declaration.type !== 'decl' || (declaration.prop !== property && !(property === 'background' && declaration.prop === 'background-color'))) continue;
        const rank = [declaration.important ? 1 : 0, specificity(selector), order];
        if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] >= best.rank[2])))) best = { value: declaration.value, rank };
      }
    }
  });
  return best?.value;
}
function assertNoirFill(element, background, color) {
  for (const theme of ['dark', 'light']) {
    document.documentElement.className = theme;
    document.documentElement.dataset.accent = 'noir';
    for (const globalLast of [false, true]) for (const hover of [false, true]) {
      assert.equal(winningValue(element, 'background', { hover, globalLast }), background, `${theme} ${element.className} background, hover=${hover}, globalLast=${globalLast}`);
      assert.equal(winningValue(element, 'color', { hover, globalLast }), color, `${theme} ${element.className} color, hover=${hover}, globalLast=${globalLast}`);
    }
  }
  document.documentElement.className = '';
  delete document.documentElement.dataset.accent;
}

postcss.parse(css).walkRules(rule => {
  for (const selector of rule.selector.split(/,\s*(?=\.)/)) {
    assert.match(selector.trim(), /^\.workspace-(canvas-panel|canvas-history|search-canvas|mode-dialog)/, `narrow selector: ${selector}`);
  }
});
assert.match(css, /font-size: 16px !important/);
assert.ok(css.includes('.workspace-search-canvas.workspace-search-canvas .wss-input-shell.wss-input-shell input.wss-input:not([type=file])'), 'research fields outrank global dark-input !important rules');
assert.ok(css.includes('.workspace-mode-dialog.workspace-mode-dialog .wcm-card.wcm-card input:not([type=file])'), 'publish fields outrank global dark-input !important rules');
assert.match(css, /border-radius: 19px/);
assert.match(css, /\.workspace-canvas-panel\.workspace-ui\s*\{[^}]*background: var\(--ws-canvas\)/s, 'Canvas surface outranks a later workspace-ui background');
assert.match(css, /\.workspace-mode-dialog\.workspace-ui\s*\{[^}]*background: var\(--ws-canvas\)/s, 'portalled dialog surface outranks a later workspace-ui background');
assert.ok(css.includes('top: calc(var(--ws-viewport-top, 0px) + var(--ws-viewport-height, 100dvh) / 2)'), 'dialog centers within the keyboard-adjusted visual viewport');
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /\.wsc-preview-frame[^}]+max-width: 100%/);
for (const token of ['--ws-bg', '--ws-canvas', '--ws-line', '--ws-text']) assert.ok(css.includes(`var(${token})`));
console.log(`PASS: ${protectedContracts} unchanged handler/effect/editor/action contracts; all six components parse; CSS is scoped and uses Workspace/theme/mobile-safe tokens.`);

// Real React DOM/controller coverage with local deterministic dependencies.
// This is not Safari visual QA and never performs auth, network or paid calls.
const jsdomPath = process.env.QA_JSDOM_PATH || '/tmp/arc-create-modes-test-deps/node_modules/jsdom/lib/api.js';
let JSDOM;
try { ({ JSDOM } = require(jsdomPath)); } catch {
  throw new Error('DOM regression requires jsdom. Set QA_JSDOM_PATH to an installed jsdom API module; no browser is launched.');
}
const dom = new JSDOM('<!doctype html><html><body><button id="opener">Open</button><div id="root"></div></body></html>', { url: 'https://arc.local', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
HTMLElement.prototype.getBoundingClientRect = () => ({ width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600, x: 0, y: 0 });
HTMLElement.prototype.scrollTo = () => {};
const downloads = [];
dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
window.URL.createObjectURL = globalThis.URL.createObjectURL = () => 'blob:test';
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL = () => {};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = globalThis.__workspaceModeTest = { mobile: false, boost: true, notifications: [], requests: [], copied: [], deployments: [], updates: [], deleted: [], followups: [], checkout: 0, closed: 0, format: [] };
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => h.copied.push(text) } });
globalThis.fetch = async url => { assert.equal(url, 'https://example.test/image.png'); return { blob: async () => new Blob(['image'], { type: 'image/png' }) }; };
h.notify = value => h.notifications.push(value);
function store(initial) {
  let snapshot = initial;
  const listeners = new Set();
  const hook = selector => {
    const state = React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => snapshot, () => snapshot);
    return selector ? selector(state) : state;
  };
  hook.getState = () => snapshot;
  hook.patch = change => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  return hook;
}
h.canvas = store({ content: '# Draft', versions: [{ id: 'v1', label: 'First draft', timestamp: 1, content: '# Original' }], activeVersionIndex: -1, isAIWriting: false, isLoading: false, canvasType: 'writing', codeLanguage: 'html', showCodePreview: false,
  setContent: content => h.canvas.patch({ content }), setShowCodePreview() {}, saveVersion: () => h.format.push('saveVersion'), restoreVersion: index => { h.format.push(`restore:${index}`); h.canvas.patch({ content: h.canvas.getState().versions[index].content, activeVersionIndex: index }); }, closeCanvas: () => h.closed++,
});
h.arc = store({ currentSessionId: 'chat-1', rightPanelOpen: false, updateSessionCanvasContent: async (...args) => h.updates.push(args) });
h.search = store({ sessions: [], activeSessionId: null, isSearching: false, lists: [{ id: 'default', links: [] }], pendingSearchQuery: null,
  closeSearch: () => h.closed++, setActiveSession: activeSessionId => h.search.patch({ activeSessionId }), clearAllSessions: () => h.search.patch({ sessions: [], activeSessionId: null }), setSearching: isSearching => h.search.patch({ isSearching }), setPendingSearchQuery: pendingSearchQuery => h.search.patch({ pendingSearchQuery }), syncFromSupabase: async () => {},
  addSession: (query, results, formattedContent, unused, images, quickAnswer, ultra) => { const id = `search-${h.search.getState().sessions.length}`; h.search.patch({ activeSessionId: id, sessions: [{ id, query, results, formattedContent, images, quickAnswer, ultra, timestamp: Date.now() }, ...h.search.getState().sessions] }); return id; },
  updateSession: (id, changes) => h.search.patch({ sessions: h.search.getState().sessions.map(session => session.id === id ? { ...session, ...changes } : session) }),
  saveLink: link => h.search.patch({ lists: [{ id: 'default', links: [...h.search.getState().lists[0].links, { ...link, id: 'link-1' }] }] }), removeLink: (listId, id) => { h.deleted.push(id); h.search.patch({ lists: [{ id: listId, links: h.search.getState().lists[0].links.filter(link => link.id !== id) }] }); }, sendSummaryMessage: async (...args) => h.followups.push(args),
});
const chain = new Proxy({}, { get: (_, key) => (...args) => { h.format.push([key, ...args]); return chain; } });
h.editor = { isDestroyed: false, getMarkdown: () => h.markdown ?? h.canvas.getState().content, setEditable() {}, commands: { setContent() {} }, chain: () => chain, isActive: () => false, can: () => ({ undo: () => true, redo: () => true }) };
h.invoke = async (name, options) => { h.requests.push([name, options]); if (h.searchResponse) return h.searchResponse; return options.body.quickAnswerOnly ? { data: { quickAnswer: 'Quick summary' }, error: null } : { data: { content: 'Research result', sources: [{ title: 'Source', url: 'https://example.test/source', snippet: 'Snippet' }], images: [] }, error: null }; };
const mocks = {
  '@/lib/utils': `export const cn=(...xs)=>xs.flat().filter(Boolean).join(' ');`,
  '@/hooks/use-mobile': `export const useIsMobile=()=>globalThis.__workspaceModeTest.mobile;`,
  '@/hooks/use-toast': `export const useToast=()=>({toast:globalThis.__workspaceModeTest.notify});`,
  '@/hooks/useSubscription': `export const useSubscription=()=>({hasBoost:globalThis.__workspaceModeTest.boost,isAdmin:false,openCheckout:()=>globalThis.__workspaceModeTest.checkout++});`,
  '@/store/useCanvasStore': `export const useCanvasStore=globalThis.__workspaceModeTest.canvas;`,
  '@/store/useArcStore': `export const useArcStore=globalThis.__workspaceModeTest.arc;`,
  '@/store/useSearchStore': `export const useSearchStore=globalThis.__workspaceModeTest.search;`,
  '@/store/useCorporateModeStore': `export const useCorporateModeStore=selector=>selector({enabled:false});`,
  '@/store/useAccentStore': `export const useAccentStore=selector=>selector({themeMode:'system'});`,
  '@/utils/platform': `export const shouldReserveDesktopTrafficLightSpace=()=>false;`,
  '@/utils/codeUtils': `export const canPreview=lang=>['html','javascript'].includes(lang); export const getLanguageDisplay=lang=>lang; export const getFileExtension=()=>'.html';`,
  '@/lib/deploy': `export const PUBLISH_DOMAIN='askarc.chat'; export const checkSubdomainAvailability=async()=>true; export const deployCodeBlock=async(...args)=>{globalThis.__workspaceModeTest.deployments.push(args);return {siteId:'site-1',subdomain:'my-site',url:'https://my-site.askarc.chat'};}; export const unpublishFromNetlify=async id=>globalThis.__workspaceModeTest.deleted.push(id);`,
  '@/lib/publishedSites': `export const savePublishedSite=async site=>({...site,id:'published-1'}); export const updatePublishedSite=async(id,site)=>({...site,id}); export const deletePublishedSite=async id=>globalThis.__workspaceModeTest.deleted.push(id);`,
  '@/lib/boostPricing': `export const BOOST_NEW_SUBSCRIBER_PRICE_COPY='Boost price';`,
  '@/integrations/supabase/client': `export const supabase={functions:{invoke:(...args)=>globalThis.__workspaceModeTest.invoke(...args)}};`,
  '@/components/ui/button': `import React from 'react'; export const Button=React.forwardRef(({variant,size,...props},ref)=><button {...props} ref={ref}/>);`,
  '@/components/ui/input': `import React from 'react'; export const Input=React.forwardRef((props,ref)=><input {...props} ref={ref}/>);`,
  '@/components/ui/label': `export const Label=props=><label {...props}/>;`,
  '@/components/ui/scroll-area': `export const ScrollArea=props=><div {...props}/>;`,
  '@/components/ui/smooth-image': `export const SmoothImage=({imageClassName,loadingClassName,...props})=><img {...props}/>;`,
  '@/components/CanvasCodeEditor': `export const CanvasCodeEditor=({code,onChange,language,...props})=><textarea {...props} aria-label="Code editor" value={code} onChange={event=>onChange(event.target.value)}/>;`,
  '@/components/CodePreview': `export const CodePreview=({code})=><div data-testid="code-preview">{code}</div>;`,
  '@/components/MobileChatApp': `export const ArcInputEffects=({children})=><div className="arc-input-shell">{children}</div>;`,
  '@/components/ResearchDashGame': `export const ResearchDashGame=()=><div>Research game</div>;`,
  '@/components/ThinkingIndicator': `export const useResolvedOrbTheme=()=> 'dark';`,
  '@/hooks/useThinkingOrbConfig': `export const useThinkingOrbConfig=()=>({});export const useMotionConfig=()=>({chatSpeed:1});export const normalizedOrbSpeed=()=>1;`,
  '@/components/MediaEmbed': `export const MediaEmbed=()=>null;export const getYouTubeVideoId=()=>null;export const isImageUrl=()=>false;`,
  'sonner': `export const toast={success:globalThis.__workspaceModeTest.notify};`,
  'thinking-orbs': `export const ThinkingOrb=()=> <span>Thinking</span>;`,
  'react-markdown': `export default function Markdown({children}){return <p>{children}</p>;}`,
  'remark-gfm': `export default ()=>{};`,
  '@tiptap/react': `export const useEditor=options=>{globalThis.__workspaceModeTest.editorOptions=options;return globalThis.__workspaceModeTest.editor;}; export const EditorContent=({editor,...props})=><div {...props}><div className="ProseMirror" contentEditable suppressContentEditableWarning>Editable document</div></div>;`,
  '@tiptap/starter-kit': `export default {configure:()=>({})};`,
  '@tiptap/markdown': `export const Markdown={};`,
};
for (const name of ['Transition', 'TransitionPart', 'ConditionalTransition', 'SequencedTransition']) mocks[`@/components/transitions/${name}`] = `export const ${name}=({children})=><>{children}</>;`;
mocks['@/components/transitions/AccordionPanel'] = `export const AccordionPanel=({open,children})=>open?<>{children}</>:null;`;
const esbuild = require('esbuild-wasm');
const bundled = await esbuild.build({ stdin: { contents: `export {WorkspaceUIContext} from './src/workspace/WorkspaceContext'; ${files.map(name=>`export {${name}} from './src/components/${name}';`).join('\n')}`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', plugins: [{ name: 'offline-mode-dependencies', setup(build) {
  build.onResolve({ filter: /./ }, args => {
    if (mocks[args.path]) return { path: args.path, namespace: 'mock' };
    if (args.path.endsWith('.css')) return { path: args.path, namespace: 'css' };
    if (args.path.startsWith('@/')) { const path = `${root}src/${args.path.slice(2)}`; return { path: existsSync(`${path}.tsx`) ? `${path}.tsx` : `${path}.ts` }; }
    if (args.namespace === 'mock' && !args.path.startsWith('.')) return { path: args.path, external: true };
  });
  build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));
  build.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: '', loader: 'js' }));
} }] });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, loaded, loaded.exports);
const exports = loaded.exports;
let reactRoot;
const tick = async (ms = 0) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
async function mount(name, props = {}, workspace = true) {
  if (reactRoot) await act(async () => reactRoot.unmount());
  document.getElementById('opener').focus();
  reactRoot = createRoot(document.getElementById('root'));
  await act(async () => reactRoot.render(React.createElement(exports.WorkspaceUIContext.Provider, { value: workspace }, React.createElement(exports[name], props))));
  await tick();
}
const query = selector => { const node = document.querySelector(selector); assert.ok(node, `Expected ${selector}`); return node; };
const button = label => { const node = [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.getAttribute('title') === label || node.textContent.trim() === label); assert.ok(node, `Expected button ${label}`); return node; };
const click = async node => act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const type = async (node, value) => act(async () => { const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
const key = async (node, name, options = {}) => act(async () => node.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...options })));

await mount('CanvasPanel');
assert.ok(query('.workspace-canvas-panel'));
assert.equal(winningValue(query('.workspace-canvas-panel'), 'background'), 'var(--ws-canvas)', 'real Canvas root matches its background rule without requiring an unrendered class');
await click(button('Bold')); assert.ok(h.format.some(item=>item[0] === 'toggleBold'));
await click(button('Save')); assert.ok(h.format.includes('saveVersion')); assert.deepEqual(h.updates.at(-1), ['chat-1', '# Draft']);
await click(button('History')); await tick(); await click(query('.wsc-history-version')); assert.equal(h.canvas.getState().content, '# Original');
assertNoirFill(query('.wsc-history-version[aria-current=true]'), 'var(--ws-hover)', 'var(--ws-text)');
await click(button('Copy')); assert.equal(h.copied.at(-1), '# Original');
await click(button('Download')); assert.match(downloads.at(-1), /\.md$/);
await act(async () => { h.canvas.patch({ canvasType: 'code', content: '<h1>Code</h1>' }); });
await type(query('[aria-label="Code editor"]'), '<h1>Edited</h1>'); assert.equal(h.canvas.getState().content, '<h1>Edited</h1>');
await click(button('Preview')); assert.equal(query('[data-testid="code-preview"]').textContent, '<h1>Edited</h1>');
await click(button('Mobile view')); assert.equal(button('Mobile view').getAttribute('aria-pressed'), 'true');
assertNoirFill(button('Mobile view'), 'var(--ws-hover)', 'var(--ws-text)');
await click(button('Code')); assert.ok(query('[aria-label="Code editor"]'));
await click(button('Close Canvas')); assert.equal(h.closed, 1);
await mount('CanvasPanel', {}, false); assert.equal(document.querySelector('.workspace-canvas-panel'), null); assert.equal(document.querySelector('[data-wsc-control]'), null);
h.mobile = true; await mount('CanvasPanel'); await click(button('More Canvas actions')); await click(button('Download')); assert.match(downloads.at(-1), /\.html$/); assert.equal(document.querySelector('.wsc-menu'), null);
h.mobile = false;
console.log('PASS: real Canvas DOM/controller wiring for formatting, save/persist, history restore, copy, download, editing, preview/device switching, close, mobile menu and legacy gate.');

await mount('SearchCanvas');
assert.ok(query('.workspace-search-canvas'));
await click(button('Ultra Deep SearchUnlimited')); assert.equal(button('Ultra Deep SearchUnlimited').getAttribute('aria-pressed'), 'true');
await type(query('[aria-label="Research query"]'), 'Test research'); await key(query('[aria-label="Research query"]'), 'Enter'); await tick();
assert.deepEqual(h.requests[0], ['perplexity-search', { body: { query: 'Test research', deepResearch: true, ultra: true } }]);
assert.equal(h.requests[1][1].body.quickAnswerOnly, true); assert.match(document.body.textContent, /Quick summary/);
await type(query('[aria-label="Research follow-up"]'), 'Compare sources'); await click(button('Send follow-up')); assert.deepEqual(h.followups.at(-1), ['search-0', 'Compare sources']);
await click(button('Copy')); assert.equal(h.copied.at(-1), 'Research result');
await click(button('Sources')); await click(query('.wss-source-pill button')); assert.equal(h.search.getState().lists[0].links.length, 1);
await click(button('Select')); await click(button('All')); await click(button('Chat')); assert.match(h.followups.at(-1)[1], /saved links/);
await click(button('New search')); assert.equal(h.search.getState().activeSessionId, null);
h.searchResponse = { data: { quotaExceeded: true, mode: 'ultra' }, error: null };
await type(query('[aria-label="Research query"]'), 'Quota test'); await key(query('[aria-label="Research query"]'), 'Enter'); await tick();
assert.equal(h.checkout, 1); assert.equal(h.search.getState().isSearching, false); assert.equal(h.notifications.at(-1).title, 'Ultra Deep Search used up');
h.searchResponse = { data: null, error: { message: 'Offline fixture' } };
const oldError = console.error; console.error = () => {};
await type(query('[aria-label="Research query"]'), 'Error test'); await key(query('[aria-label="Research query"]'), 'Enter'); await tick(); console.error = oldError;
assert.equal(h.notifications.at(-1).title, 'Search failed'); assert.equal(h.search.getState().isSearching, false);
await key(document, 'Escape'); assert.equal(h.closed, 2);
await mount('SearchCanvas', {}, false); assert.equal(document.querySelector('.workspace-search-canvas'), null);
h.mobile = true;
await act(async () => h.search.patch({ activeSessionId: 'search-0' }));
await mount('SearchCanvas');
assertNoirFill(query('.wss-new-search'), 'var(--ws-text)', 'var(--ws-bg)');
h.mobile = false;
console.log('PASS: real Deep/Ultra DOM/controller wiring, unchanged request payloads and quick-answer call, follow-up, copy, source saving/selection/chat, new search, quota/error reset, Escape and legacy gate.');

let published;
await mount('PublishModal', { open: true, onClose: () => h.closed++, onPublish: async opts => { published = opts; } });
assert.ok(query('[role="dialog"].workspace-mode-dialog'));
assert.ok(query('[role="dialog"]').contains(document.activeElement), 'focus enters Workspace dialog');
await type(query('#pub-title'), 'Example Site'); await tick(450); await click(button('Publish')); assert.deepEqual(published, { subdomain: 'example-site', title: 'Example Site' });
assert.match(document.body.textContent, /URL can't be recovered/);
const closeBefore = h.closed; await key(document.activeElement, 'Escape'); assert.equal(h.closed, closeBefore + 1);
h.boost = false; await mount('PublishModal', { open: true, onClose: () => h.closed++, onPublish: async () => { throw new Error('must not publish'); } });
assert.match(document.body.textContent, /Publishing requires Boost/); assert.equal(document.querySelector('#pub-title'), null); h.boost = true;
await mount('PublishModal', { open: true, onClose() {}, onPublish: async () => {} }, false); assert.equal(document.querySelector('.workspace-mode-dialog'), null);
const site = { id: 'published-1', netlify_site_id: 'site-1', subdomain: 'my-site', title: 'My site', url: 'https://my-site.askarc.chat', code: '<h1>Site</h1>', code_language: 'html' };
let updated, unpublished = false;
await mount('SiteManageModal', { open: true, onClose: () => h.closed++, site, onUpdated: value => { updated = value; }, onUnpublished: () => { unpublished = true; } });
await click(button('Copy URL')); assert.equal(h.copied.at(-1), site.url);
await click(button('Update site')); assert.equal(updated.id, site.id); assert.equal(h.deployments.at(-1)[0], site.code);
await click(button('Unpublish')); assert.match(query('[role="alert"]').textContent, /permanent/); assert.equal(unpublished, false);
await click(button('Yes, unpublish')); assert.equal(unpublished, true); assert.ok(h.deleted.includes('site-1'));
await mount('ImageModal', { isOpen: true, onClose: () => h.closed++, imageUrl: 'https://example.test/image.png', alt: 'Test image', sourceUrl: 'https://example.test/source' });
assert.equal(query('[role="dialog"] img').getAttribute('alt'), 'Test image');
assert.equal(winningValue(query('.workspace-mode-dialog-image'), 'width'), 'min(1100px, calc(100vw - 32px))', 'image variant width wins over the narrower shared dialog rule');
await click(button('Download image')); assert.match(downloads.at(-1), /\.png$/);
assert.equal(query('.wcm-image-actions a').getAttribute('href'), 'https://example.test/source');
await key(document.activeElement, 'Escape');
await act(async () => reactRoot.unmount()); await tick();
assert.equal(document.activeElement.id, 'opener', 'dialog dismissal/unmount restores trigger focus');
console.log('PASS: real portalled dialog rendering/focus/Escape/restoration, publish fields/subdomain/warnings/Boost gate, update/copy/two-step unpublish, and image source/download. All service calls are deterministic local mocks.');
dom.window.close();
console.log('Safari visual/browser QA: NOT RUN (no Safari in this Linux environment).');
