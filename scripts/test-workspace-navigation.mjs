// Real React DOM and production navigation, with no browser, accounts or I/O.
// Layout geometry and physical Safari focus remain a separate QA step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
const { JSDOM } = await import(process.env.ARC_JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<!doctype html><html data-workspace-theme="dark"><body><div id="root"></div></body></html>', { url: 'https://offline.invalid', pretendToBeVisual: true });
const win = dom.window;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'localStorage']) Object.defineProperty(globalThis, name, { value: win[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.HTMLElement.prototype.scrollIntoView = function () {};
let desktop = true;
const listeners = new Set();
win.matchMedia = () => ({ get matches() { return desktop; }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), addListener() {}, removeListener() {} });
globalThis.matchMedia = win.matchMedia;
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('Network prohibited'); };
const stage = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root: stage, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: [{ find: '@', replacement: `${stage}/src` }] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Simulate } = await import('react-dom/test-utils');
  const { WorkspaceChrome, WorkspaceDialog } = await server.ssrLoadModule('/src/workspace/WorkspaceChrome.tsx');
  const root = createRoot(document.getElementById('root'));
  const events = [];
  let props = {
    accountId: 'owner-one', accountName: 'Fixture', section: 'chat', title: 'Saved conversation', currentId: 'one',
    recent: [{ id: 'one', title: 'Saved conversation', pinned: true }], folders: [],
    onNavigate: id => events.push(['navigate', id]), onNewChat: () => events.push(['new']), onOpenChat: id => events.push(['open', id]),
    onAllChats: () => events.push(['all']), onSearch: () => events.push(['search']), onUsage() {}, onInfo() {}, onAccount() {},
    onPinChat: async (...args) => events.push(['pin', ...args]), onRenameChat: async (...args) => events.push(['rename', ...args]), onDeleteChat: async (...args) => events.push(['delete', ...args]),
    children: React.createElement('div', null, React.createElement('h1', null, 'In-page title'), React.createElement('textarea', { id: 'current-draft', defaultValue: 'Preserved draft' })),
  };
  const render = async next => { props = { ...props, ...next }; await act(async () => root.render(React.createElement(WorkspaceChrome, props))); };
  const frame = () => document.querySelector('.ws-frame');
  const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label);
  const click = async node => { assert(node); await act(async () => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))); };
  const wait = async ms => { await act(async () => new Promise(resolve => setTimeout(resolve, ms))); };
  const enter = async node => { await act(async () => Simulate.pointerEnter(node)); };
  const leave = async node => { await act(async () => Simulate.pointerLeave(node)); };
  await render({});
  assert.equal(frame().dataset.sidebarState, 'docked');
  const draft = document.getElementById('current-draft');
  await click(button('Hide sidebar'));
  assert.equal(frame().dataset.sidebarState, 'hidden');
  assert.equal(localStorage.getItem('arc_chat_sidebar_docked:owner-one'), 'false');
  assert.ok(document.activeElement === button('Show sidebar'), 'Hide restores focus to Show sidebar');
  await enter(document.querySelector('.ws-sidebar-peek-edge'));
  assert.equal(frame().dataset.sidebarState, 'hidden', 'hiding cannot immediately reopen at the edge');
  await wait(370);
  await enter(document.querySelector('.ws-sidebar-peek-edge'));
  assert.equal(frame().dataset.sidebarState, 'peek');
  assert.ok(document.getElementById('current-draft') === draft, 'peek preserves the current page node');
  assert.equal(draft.value, 'Preserved draft');
  await leave(document.querySelector('.ws-sidebar'));
  await wait(370);
  assert.equal(frame().dataset.sidebarState, 'hidden');
  await enter(document.querySelector('.ws-sidebar-peek-edge'));
  const portal = document.createElement('div'); portal.setAttribute('role', 'menu'); document.body.append(portal);
  await leave(document.querySelector('.ws-sidebar'));
  await wait(370);
  assert.equal(frame().dataset.sidebarState, 'peek', 'portaled actions keep their anchor available');
  portal.remove();
  await wait(370);
  assert.equal(frame().dataset.sidebarState, 'hidden');
  await click(button('Show sidebar'));
  assert.equal(frame().dataset.sidebarState, 'peek');
  assert(document.querySelector('.ws-sidebar').contains(document.activeElement), 'explicit opening moves keyboard focus into navigation');
  await leave(document.querySelector('.ws-sidebar'));
  await wait(370);
  assert.equal(frame().dataset.sidebarState, 'peek', 'focused keyboard navigation does not disappear on pointer leave');
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(frame().dataset.sidebarState, 'hidden');
  assert.ok(document.activeElement === button('Show sidebar'), 'Escape restores focus to Show sidebar');
  await click(button('Show sidebar'));
  await click(document.querySelector('.ws-sidebar [aria-label="Dock sidebar"]'));
  assert.equal(frame().dataset.sidebarState, 'docked');
  assert.equal(localStorage.getItem('arc_chat_sidebar_docked:owner-one'), 'true');
  await leave(document.querySelector('.ws-sidebar')); await wait(370);
  assert.equal(frame().dataset.sidebarState, 'docked');
  await click(button('Hide sidebar'));
  await click(button('Show sidebar'));
  await act(async () => draft.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true })));
  assert.equal(frame().dataset.sidebarState, 'hidden', 'outside interaction dismisses only the temporary peek');
  await click(button('Show sidebar'));
  const options = document.querySelector('.ws-sidebar [aria-label="Options for Saved conversation"]');
  await act(async () => { options.focus(); Simulate.pointerDown(options, { button: 0, ctrlKey: false }); });
  const rename = [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.includes('Rename chat'));
  assert(rename);
  await click(rename);
  assert(document.querySelector('[role="alertdialog"]'));
  const backdrop = document.querySelector('.arc-overlay');
  assert(backdrop);
  await act(async () => backdrop.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true })));
  assert.equal(frame().dataset.sidebarState, 'peek', 'a nested alert backdrop cannot hide the parent sidebar');
  await click([...document.querySelectorAll('[role="alertdialog"] button')].find(node => node.textContent === 'Cancel'));
  await wait(30);
  assert.ok(document.activeElement === options, 'nested cancellation returns to its still-visible row');
  await render({ accountId: 'owner-two' });
  assert.equal(frame().dataset.sidebarState, 'docked', 'another account does not inherit the hidden preference');
  await render({ accountId: 'owner-one' });
  assert.equal(frame().dataset.sidebarState, 'hidden');
  await click(button('Show sidebar'));
  await click([...document.querySelectorAll('.ws-history-nav button')][0]);
  assert.deepEqual(events.splice(0), [['all']]);
  assert.equal(frame().dataset.sidebarState, 'hidden', 'All chats dismisses undocked navigation');
  for (const section of ['chat', 'reminders', 'shared', 'apps', 'images', 'canvases', 'memory', 'settings', 'build']) {
    await render({ section, title: `Page ${section}` });
    assert.equal(document.querySelector('.ws-header').querySelectorAll('h1,h2,h3,.ws-title').length, 0);
    assert.equal(document.querySelector('.ws-main').getAttribute('aria-label'), `Page ${section}`);
    assert.equal(document.querySelectorAll('.ws-main h1').length, 1, 'in-page headings are retained');
    assert.ok(document.getElementById('current-draft') === draft);
  }
  await act(async () => { desktop = false; listeners.forEach(listener => listener()); });
  assert.equal(frame().dataset.sidebarInteractive, 'false');
  assert.equal(button('Hide sidebar'), undefined);
  await click(button('Open navigation'));
  assert(document.querySelector('.ws-mobile-sidebar'));
  await act(async () => { desktop = true; listeners.forEach(listener => listener()); });
  assert.equal(document.querySelector('.ws-mobile-sidebar'), null, 'resizing closes the old mobile drawer');
  assert.equal(frame().dataset.sidebarState, 'hidden', 'the desktop preference survives mobile resizing');
  const css = readFileSync(`${stage}/src/workspace/workspace.css`, 'utf8');
  assert.match(css, /\[data-sidebar-interactive=true\]:not\(\[data-sidebar-state=docked\]\) \.ws-stage \{ left:0; \}/);
  assert.match(css, /\[data-sidebar-state=hidden\] \.ws-sidebar \{[^}]*visibility:hidden; pointer-events:none;/);
  await act(async () => root.unmount());
  assert.equal(listeners.size, 0, 'viewport listeners are cleaned up');
  const focusRoot = createRoot(document.getElementById('root'));
  function SearchFlow() {
    const [open, setOpen] = React.useState(false);
    const returnFocusRef = React.useRef(null);
    return React.createElement(WorkspaceChrome, { ...props, onSearch: trigger => {
      if (open) return;
      returnFocusRef.current = trigger ?? document.activeElement;
      setOpen(true);
    } }, React.createElement(WorkspaceDialog, { title: 'Search your chats', open, onOpenChange: setOpen, returnFocusRef }, React.createElement('input', { 'aria-label': 'Search text', autoFocus: true })));
  }
  await act(async () => focusRoot.render(React.createElement(SearchFlow)));
  await click(button('Show sidebar'));
  await click(document.querySelector('.ws-sidebar [aria-label="Search workspace"]'));
  assert.equal(frame().dataset.sidebarState, 'hidden');
  assert(document.querySelector('[role="dialog"]'));
  await click(button('Close dialog')); await wait(30);
  assert.ok(document.activeElement === button('Show sidebar'), `Search restores focus after its temporary sidebar opener becomes hidden; actual=${document.activeElement?.getAttribute('aria-label')}`);
  await click(button('Show sidebar'));
  await click(document.querySelector('.ws-sidebar [aria-label="Dock sidebar"]'));
  const dockedSearch = document.querySelector('.ws-sidebar [aria-label="Search workspace"]');
  // Safari-style pointer activation does not focus the clicked button. Keep a
  // different visible control focused; the caller must capture the real invoker.
  await act(async () => button('More workspace options').focus());
  await click(dockedSearch);
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await click(button('Close dialog')); await wait(30);
  assert.ok(document.activeElement === dockedSearch, `a still-visible docked opener regains focus after pointer/Close; actual=${document.activeElement?.getAttribute('aria-label')}`);
  await act(async () => button('More workspace options').focus());
  await click(dockedSearch);
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await wait(30);
  assert.ok(document.activeElement === dockedSearch, `Safari pointer/Escape restores the actual Search invoker; actual=${document.activeElement?.getAttribute('aria-label')}`);
  assert.match(css, /\.ws-brand-search:focus\s*\{ opacity:1;/, 'restored pointer focus keeps the Search icon visible');
  await act(async () => button('More workspace options').focus());
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
  assert(document.querySelector('[role="dialog"]'), 'keyboard shortcut still opens Search');
  await click(button('Close dialog')); await wait(30);
  assert.ok(document.activeElement === button('More workspace options'), 'shortcut returns to its original focused control');
  const shell = readFileSync(`${stage}/src/workspace/WorkspaceShell.tsx`, 'utf8');
  assert.ok(shell.includes('searchReturnFocusRef.current = trigger ?? (active instanceof HTMLElement ? active : null)'));
  assert.ok(shell.includes("if (dialog === 'search') return;"), 'repeated shortcuts cannot overwrite the original invoker with the dialog input');
  assert.ok(shell.includes('<WorkspaceDialog title="Search your chats" returnFocusRef={searchReturnFocusRef}'));
  assert.ok(shell.includes('<input autoFocus placeholder="Search chat titles…"'), 'fixture mirrors the production autofocus child');

  await act(async () => { desktop = false; listeners.forEach(listener => listener()); });
  await click(button('Open navigation'));
  await click(document.querySelector('.ws-mobile-sidebar [aria-label="Find chats"]'));
  await click(button('Close dialog')); await wait(30);
  assert.ok(document.activeElement === button('Open navigation'), `mobile dialog returns to the visible navigation trigger; actual=${document.activeElement?.getAttribute('aria-label')}`);
  await act(async () => focusRoot.unmount());
  assert.equal(listeners.size, 0);
  assert.equal(network, 0);
  console.log('PASS real Workspace navigation: retained layout, hide/edge peek/dock, dismissal/portal/focus/Escape, per-account persistence, All chats, mobile resize, non-remounting content, all-section header deduplication, dialog return-focus for hidden/docked/mobile openers, zero network. Safari geometry remains unverified.');
} finally { await server.close(); dom.window.close(); }
