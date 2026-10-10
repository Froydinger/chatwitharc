import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Node DOM/controller coverage, not browser or Safari QA. Use an existing JSDOM
// install, e.g. QA_JSDOM_PATH=/absolute/path/to/jsdom/lib/api.js. No live services.
const { JSDOM } = await import(process.env.QA_JSDOM_PATH || 'jsdom');
const dom = new JSDOM('<!doctype html><html data-workspace-theme="dark"><body><div id="root"></div></body></html>', {
  url: 'https://offline.invalid', pretendToBeVisual: true,
});
const win = dom.window;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, { value: win[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.HTMLElement.prototype.scrollIntoView = function () {};
let networkCalls = 0;
globalThis.fetch = win.fetch = async () => { networkCalls++; throw new Error('Network prohibited in prompt-library QA'); };
win.WebSocket = class { constructor() { networkCalls++; throw new Error('WebSocket prohibited in prompt-library QA'); } };
const storagePrefix = 'qa_prompts_';
const fixtures = {
  ask: [{ label: 'Ask fixture', prompt: 'Explain the provided question.' }],
  reflect: [{ label: 'Reflect fixture', prompt: 'Help me think this through.' }],
  create: [{ label: 'Create fixture', prompt: 'code/ Make the provided example.' }],
};
for (const [category, prompts] of Object.entries(fixtures)) sessionStorage.setItem(storagePrefix + category, JSON.stringify(prompts));
const state = { calls: [], toasts: [], deferred: null, fallbackCalls: [], modelReads: 0 };
globalThis.__promptLibraryQA = state;

const stage = fileURLToPath(new URL('../', import.meta.url));
const virtualPrefix = '\0prompt-library-qa:';
const mockedImports = new Map([
  ['@/integrations/supabase/client', 'client'],
  ['@/store/useModelStore', 'model'],
  ['@/hooks/usePromptPreload', 'cache'],
  ['@/utils/promptGenerator', 'generator'],
  ['sonner', 'toast'],
  ...['Transition', 'TransitionPart', 'SequencedTransition', 'ConditionalTransition'].map(name => [`@/components/transitions/${name}`, name]),
]);
const sources = {
  client: `export const isSupabaseConfigured = true; export const supabase = { functions: { invoke: async (name, payload) => {
    const state = globalThis.__promptLibraryQA; state.calls.push({ name, payload });
    return await new Promise(resolve => { state.deferred = resolve; });
  } } };`,
  model: `export function getModelForTask(task) { globalThis.__promptLibraryQA.modelReads++; return 'offline-model-fixture'; }`,
  cache: `export const CACHE_KEY_PREFIX = '${storagePrefix}'; export const getCachedPrompts = category => JSON.parse(sessionStorage.getItem(CACHE_KEY_PREFIX + category) || 'null');`,
  generator: `export function generatePromptsByCategory(category) { globalThis.__promptLibraryQA.fallbackCalls.push(category); return [{ label: category + ' local fallback', prompt: category + ' local prompt' }]; }`,
  toast: `export const toast = { success: text => globalThis.__promptLibraryQA.toasts.push(text) };`,
};
for (const name of ['Transition', 'TransitionPart', 'SequencedTransition', 'ConditionalTransition']) {
  sources[name] = `import React from 'react'; export function ${name}({children, className}) { return React.createElement('div', {className}, children); }`;
}
const server = await createServer({
  configFile: false,
  root: stage,
  plugins: [{
    name: 'offline-prompt-library-services', enforce: 'pre',
    resolveId(id) { return id.startsWith(virtualPrefix) ? id : null; },
    load(id) { return id.startsWith(virtualPrefix) ? sources[id.slice(virtualPrefix.length)] : null; },
  }, react()],
  resolve: { alias: [...mockedImports].map(([find, name]) => ({ find, replacement: virtualPrefix + name })).concat({ find: '@', replacement: `${stage}/src` }) },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const React = await import('react');
  const { act, createElement: h, useRef, useState } = React;
  const { createRoot } = await import('react-dom/client');
  const { PromptLibrary } = await server.ssrLoadModule('/src/components/PromptLibrary.tsx');
  const root = createRoot(document.getElementById('root'));
  const selections = [];
  let closeCount = 0;
  let setOpen;
  const quickPrompts = [{ label: 'Supplied starter', prompt: 'write/ Preserve the exact supplied prompt.' }];
  function Harness({ workspaceUI = true }) {
    const [open, updateOpen] = useState(false);
    const [value, setValue] = useState('');
    const composer = useRef(null);
    setOpen = updateOpen;
    return h('div', { className: 'workspace-live-composer' },
      h('button', { className: 'ci-menu-btn', onClick: () => updateOpen(true) }, 'Open prompt library'),
      h('textarea', { ref: composer, 'aria-label': 'Composer', value, onChange: event => setValue(event.target.value) }),
      h('button', { id: 'other-destination' }, 'Other destination'),
      h(PromptLibrary, {
        workspaceUI, isOpen: open, prompts: quickPrompts,
        onClose: () => { closeCount++; updateOpen(false); },
        onSelectPrompt: prompt => { selections.push(prompt); setValue(prompt); composer.current?.focus(); },
      }));
  }
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };
  const click = async node => { assert(node); await act(async () => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))); await settle(); };
  const key = async (node, value, extra = {}) => { assert(node); await act(async () => node.dispatchEvent(new win.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }))); await settle(); };
  const button = label => document.querySelector(`button[aria-label="${label}"]`);
  const selectTab = async label => {
    const node = [...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === label);
    assert(node);
    await act(async () => node.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await settle();
  };
  const launcher = () => document.querySelector('.ci-menu-btn');
  const composer = () => document.querySelector('[aria-label="Composer"]');
  const dialog = () => document.querySelector('[role="dialog"]');
  const options = () => [...document.querySelectorAll('.ws-prompt-option')];
  const open = async () => { launcher().focus(); await click(launcher()); assert(dialog()); };

  await act(async () => root.render(h(Harness)));
  assert.equal(dialog(), null);
  await open();
  assert.equal(state.calls.length, 0, 'opening uses seeded cache; no service call');
  assert.equal(dialog().getAttribute('aria-modal'), 'true');
  assert.equal(dialog().getAttribute('aria-labelledby'), document.querySelector('.ws-prompt-title').id);
  assert.equal(dialog().getAttribute('aria-describedby'), document.querySelector('.ws-prompt-description').id);
  assert.equal(document.activeElement, document.querySelector('.ws-prompt-title'), 'opening focuses a heading, never a text field');
  assert.equal(document.querySelectorAll('[role="tab"]').length, 3);
  assert.equal(document.querySelector('[role="tab"][data-state="active"]').textContent, 'Ask');
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Ask fixture/);
  assert.equal(options()[1].textContent.includes('Supplied starter'), true, 'supplied quick prompts are rendered without replacement');
  assert(document.body.hasAttribute('data-scroll-locked'), 'modal locks background scrolling');
  await act(async () => composer().focus());
  assert.notEqual(document.activeElement, composer(), 'actual Radix focus trap keeps focus inside');

  // Opening the native disclosure makes all quick-prompt buttons tabbable.
  await click(document.querySelector('.ws-prompt-quick summary'));
  assert(document.querySelector('.ws-prompt-quick').open);
  await act(async () => options().at(-1).focus());
  await key(document.activeElement, 'Tab');
  assert.equal(document.activeElement, button('Close prompt library'), 'Tab wraps from the last option to the first modal control');
  await key(document.activeElement, 'Tab', { shiftKey: true });
  assert.equal(document.activeElement, options().at(-1), 'Shift+Tab wraps backwards');
  const askTab = document.querySelector('[role="tab"][data-state="active"]');
  await act(async () => askTab.focus());
  await key(askTab, 'ArrowRight');
  assert.equal(document.querySelector('[role="tab"][data-state="active"]').textContent, 'Reflect');
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Reflect fixture/);
  await key(document.activeElement, 'End');
  assert.equal(document.querySelector('[role="tab"][data-state="active"]').textContent, 'Create');
  await key(document.activeElement, 'Home');
  assert.equal(document.querySelector('[role="tab"][data-state="active"]').textContent, 'Ask');

  // Refresh resolves through a mock service. Keep existing options available and
  // ensure only the requested category/cache is changed.
  await click(button('Refresh Ask prompts'));
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].name, 'generate-category-prompts');
  assert.equal(state.calls[0].payload.body.category, 'ask');
  assert.equal(state.calls[0].payload.body.forceRefresh, true);
  assert.equal(state.calls[0].payload.body.model, 'offline-model-fixture');
  assert.equal(button('Refresh Ask prompts').disabled, true);
  assert.match(document.querySelector('[role="status"]').textContent, /Refreshing/);
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Ask fixture/);
  assert.equal(state.toasts.length, 0, 'refresh completion is announced only after its promise resolves');
  await click(button('Refresh Ask prompts'));
  assert.equal(state.calls.length, 1, 'repeat refresh is blocked while loading');
  await act(async () => state.deferred({ data: { category: 'ask', prompts: [{ label: 'Refreshed Ask', prompt: 'Use this refreshed prompt.' }] }, error: null }));
  await settle();
  assert.equal(button('Refresh Ask prompts').disabled, false);
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Refreshed Ask/);
  assert.equal(JSON.parse(sessionStorage.getItem(storagePrefix + 'reflect'))[0].label, 'Reflect fixture');
  assert.deepEqual(state.toasts, ['Prompts refreshed!']);

  // Normal Escape and close-button dismissal restore the actual opener.
  await key(document.activeElement, 'Escape');
  assert.equal(dialog(), null);
  assert.equal(document.activeElement, launcher());

  // A click from a temporary/hidden Create item returns to the composer launcher.
  const temporaryOpener = document.createElement('button');
  document.body.append(temporaryOpener);
  temporaryOpener.focus();
  await act(async () => setOpen(true));
  await settle();
  temporaryOpener.remove();
  await key(document.activeElement, 'Escape');
  assert.equal(document.activeElement, launcher());

  // If a newer interaction chooses a different destination during dismissal,
  // scheduled cleanup must not take its focus back.
  await open();
  await act(async () => {
    setOpen(false);
  });
  await act(async () => document.getElementById('other-destination').focus());
  await settle();
  assert.equal(document.activeElement, document.getElementById('other-destination'));

  // Reopening before old close cleanup is harmless and still traps focus.
  await open();
  await act(async () => setOpen(false));
  await act(async () => setOpen(true));
  await settle();
  assert(dialog());
  assert(dialog().contains(document.activeElement));
  await key(document.activeElement, 'Escape');
  assert.equal(dialog(), null);

  // Actual Radix outside-pointer dismissal also releases the focus/scroll lock.
  await open();
  await act(async () => document.querySelector('.ws-prompt-overlay').dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  await settle();
  assert.equal(dialog(), null);
  assert.equal(document.activeElement, launcher());
  assert.equal(document.body.hasAttribute('data-scroll-locked'), false);
  assert.equal(document.body.style.pointerEvents, '');
  await open();
  await click(button('Close prompt library'));
  assert.equal(dialog(), null);
  assert.equal(document.activeElement, launcher());

  // Selecting a real category prompt must reach the parent once, after closing,
  // with composer focus retained. A second open cannot replay the selection.
  await open();
  const selectedOption = options()[0];
  await act(async () => {
    selectedOption.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    selectedOption.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
  await settle();
  assert.equal(dialog(), null);
  assert.deepEqual(selections, ['Use this refreshed prompt.']);
  assert.equal(composer().value, selections[0]);
  assert.equal(document.activeElement, composer());
  await open();
  await click(document.querySelector('.ws-prompt-quick summary'));
  await click(options().at(-1));
  assert.deepEqual(selections, ['Use this refreshed prompt.', quickPrompts[0].prompt]);
  assert.equal(composer().value, quickPrompts[0].prompt);
  assert.equal(document.activeElement, composer());

  // Repeated close/open releases locks and does not emit selections.
  for (let index = 0; index < 3; index++) {
    await open();
    await key(document.activeElement, 'Escape');
    assert.equal(dialog(), null);
    assert.equal(document.activeElement, launcher());
    assert.equal(document.body.style.pointerEvents, '');
  }
  assert.equal(selections.length, 2);
  assert(closeCount >= 7);

  // A late refresh belongs to its requested category even if the user changes tabs.
  await open();
  await click(button('Refresh Ask prompts'));
  await selectTab('Reflect');
  await act(async () => state.deferred({ data: { category: 'ask', prompts: [{ label: 'Refreshed Ask', prompt: 'Use this refreshed prompt.' }] }, error: null }));
  await settle();
  assert.equal(document.querySelector('[role="tab"][data-state="active"]').textContent, 'Reflect');
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Reflect fixture/);
  assert.doesNotMatch(document.querySelector('[role="tabpanel"]').textContent, /Refreshed Ask/);

  // The production category guard rejects mismatched mock responses and never
  // caches them. No fallback data is added to the production component.
  await click(button('Refresh Reflect prompts'));
  await act(async () => state.deferred({ data: { category: 'ask', prompts: [{ label: 'Wrong category', prompt: 'Must not show.' }] }, error: null }));
  await settle();
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /reflect local fallback/);
  assert.doesNotMatch(document.querySelector('[role="tabpanel"]').textContent, /Wrong category/);
  assert.equal(sessionStorage.getItem(storagePrefix + 'reflect'), null);
  sessionStorage.setItem(storagePrefix + 'reflect', JSON.stringify(fixtures.reflect));
  await selectTab('Ask');
  await click(button('Refresh Ask prompts'));
  await click(button('Close prompt library'));
  await act(async () => document.getElementById('other-destination').focus());
  await act(async () => state.deferred({ data: { category: 'ask', prompts: [{ label: 'Refreshed Ask', prompt: 'Use this refreshed prompt.' }] }, error: null }));
  await settle();
  assert.equal(dialog(), null, 'late refresh does not reopen a dismissed modal');
  assert.equal(document.activeElement, document.getElementById('other-destination'), 'late refresh cannot move focus');
  assert.equal(selections.length, 2, 'refresh completion never selects a prompt');

  // Theme changes use the live root theme and never overwrite it on open/close.
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.workspaceTheme = theme;
    await open();
    assert(dialog().classList.contains('workspace-ui'));
    await click(button('Close prompt library'));
    assert.equal(document.documentElement.dataset.workspaceTheme, theme);
  }
  const css = readFileSync(new URL('../src/workspace/workspace-prompts.css', import.meta.url), 'utf8');
  for (const token of ['--ws-canvas', '--ws-text', '--ws-muted', '--ws-line', '--ws-bg']) assert(css.includes(`var(${token})`));
  assert.match(css, /\.workspace-ui\.ws-prompt-dialog[\s\S]*?max-height:calc\(var\(--ws-viewport-height, 100dvh\)/);
  assert.match(css, /\.ws-prompt-list\s*\{[^}]*overflow-y:auto/);
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /prefers-reduced-motion:reduce/);

  // Legacy stays on the original renderer and its immediate selection callback.
  await act(async () => root.render(h(Harness, { workspaceUI: false })));
  launcher().focus();
  await click(launcher());
  assert.equal(document.querySelector('.ws-prompt-dialog'), null);
  assert(document.querySelector('.glass-panel'));
  await click(document.querySelector('.arc-prompt-card'));
  assert.equal(selections.at(-1), 'Use this refreshed prompt.');
  assert.equal(document.querySelector('[data-testid="arc-prompt-library"]'), null);
  await act(async () => root.unmount());
  assert.equal(networkCalls, 0);
  console.log('PASS actual PromptLibrary + Radix DOM/controller checks: labels, cached categories, keyboard tabs, focus trap and boundary wrapping, refresh payload/loading/cache, category mismatch and late refresh, Escape/close/outside dismissal, exact prompt selection and prefill focus, supplied quick prompts, repeated/rapid reopen, opener fallback and newer-focus preservation, theme preservation, legacy gate. Zero real network/model/generation calls; refresh service is mocked.');
  console.log('Safari layout/visual/browser QA: NOT RUN (this is Node/JSDOM, not a browser).');
} finally {
  await server.close();
  dom.window.close();
  delete globalThis.__promptLibraryQA;
}
