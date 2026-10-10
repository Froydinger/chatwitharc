// Real React/Radix DOM regression using the production build's layer rules.
// Run `npm run build` first. This is not a physical-device/Safari geometry test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';

const stage = fileURLToPath(new URL('../', import.meta.url));
const assets = `${stage}/dist/assets`;
const productionCss = readdirSync(assets).filter(file => file.endsWith('.css')).map(file => readFileSync(`${assets}/${file}`, 'utf8')).find(css => css.includes('.ws-chat-actions-menu'));
assert(productionCss, 'Build the production app before running the menu layer regression');
// Preserve the emitted order, including the later Tailwind z-[100] utility.
// Only layer declarations are needed; JSDOM does not implement layout/animation.
const layerRules = [];
postcss.parse(productionCss).walkRules(rule => {
  if (rule.parent.type !== 'root' || !/(?:ws-chat-actions-menu|ws-menu|ws-mobile-sidebar|ws-drawer-overlay|z-\\\[100\\\])/.test(rule.selector)) return;
  const declarations = rule.nodes.filter(node => node.type === 'decl' && node.prop === 'z-index');
  if (declarations.length) layerRules.push(`${rule.selector}{${declarations.map(node => node.toString()).join(';')}}`);
});
assert(layerRules.some(rule => rule.includes('.z-\\[100\\]')), 'Include the real shared-dropdown utility in the cascade');
const { JSDOM } = await import(process.env.ARC_JSDOM_MODULE || 'jsdom');
const dom = new JSDOM(`<!doctype html><html><head><style>${layerRules.join('\n')}</style></head><body><div id="root"></div></body></html>`, { url: 'https://offline.invalid', pretendToBeVisual: true });
const win = dom.window;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'localStorage']) Object.defineProperty(globalThis, name, { value: win[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.HTMLElement.prototype.scrollIntoView = function () {};
win.HTMLCanvasElement.prototype.getContext = () => null;
let desktop = false;
const listeners = new Set();
win.matchMedia = () => ({ get matches() { return desktop; }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), addListener() {}, removeListener() {} });
globalThis.matchMedia = win.matchMedia;
let network = 0;
globalThis.fetch = async () => { network++; throw new Error('Network prohibited'); };
const server = await createServer({ configFile: false, root: stage, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: [{ find: '@', replacement: `${stage}/src` }] }, server: { middlewareMode: true }, appType: 'custom' });
let root;
try {
  const React = (await import('react')).default;
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { Simulate } = await import('react-dom/test-utils');
  const { WorkspaceChrome } = await server.ssrLoadModule('/src/workspace/WorkspaceChrome.tsx');
  const { ChatRowActions } = await server.ssrLoadModule('/src/components/ChatRowActions.tsx');
  root = createRoot(document.getElementById('root'));
  const events = [];
  let props = {
    accountId: 'offline-owner', accountName: 'Fixture', section: 'chat', title: 'Current conversation', currentId: 'one',
    recent: [{ id: 'one', title: 'Current conversation', pinned: true }, { id: 'two', title: 'Other conversation' }],
    folders: [{ id: 'folder', name: 'Owned folder' }],
    onNavigate: id => events.push(['navigate', id]), onNewChat: () => events.push(['new']), onOpenChat: id => events.push(['open', id]),
    onAllChats: () => events.push(['all']), onSearch() {}, onUsage() {}, onInfo() {}, onAccount() {},
    onPinChat: async (...args) => events.push(['pin', ...args]), onRenameChat: async (...args) => events.push(['rename', ...args]),
    onMoveChat: async (...args) => events.push(['move', ...args]), onDeleteChat: async (...args) => events.push(['delete', ...args]),
    children: React.createElement('textarea', { id: 'current-draft', defaultValue: 'Preserved draft' }),
  };
  const render = async next => { props = { ...props, ...next }; await act(async () => root.render(React.createElement(WorkspaceChrome, props))); };
  const button = (label, scope = document) => [...scope.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label);
  const item = text => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === text);
  const dialogButton = text => [...document.querySelectorAll('[role="alertdialog"] button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert(node); await act(async () => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))); };
  const wait = async () => { await act(async () => new Promise(resolve => setTimeout(resolve, 30))); };
  const pointer = async (node, pointerType = 'touch') => {
    assert(node);
    const event = new win.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    await act(async () => node.dispatchEvent(event));
  };
  const escape = async () => { await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await wait(); };
  const drawer = () => document.querySelector('.ws-mobile-sidebar');
  const options = () => button('Options for Other conversation', desktop ? document.querySelector('.ws-sidebar') : drawer());
  const assertMenuLayer = () => {
    const menus = [...document.querySelectorAll('[role="menu"]')];
    assert(menus.length, 'A real Radix menu is open');
    for (const menu of menus) {
      assert.equal(getComputedStyle(menu).zIndex, '12020', 'Workspace root/submenu must beat the shared z-[100] utility');
      const popper = menu.closest('[data-radix-popper-content-wrapper]');
      assert(popper, 'Radix created the actual portaled positioning wrapper');
      assert.equal(popper.style.zIndex, '12020', 'The actual stacking wrapper inherits the visible content layer');
      if (drawer()) assert(Number(popper.style.zIndex) > Number(getComputedStyle(drawer()).zIndex), 'The menu is above its mobile drawer, not hidden behind it');
      assert.equal(menu.style.pointerEvents, 'auto', 'The top menu remains interactive');
    }
  };
  const openMenu = async () => { await pointer(options()); await click(options()); await wait(); assertMenuLayer(); };
  const assertDrawerUsable = () => {
    assert(drawer(), 'Menu action/dismissal must preserve the mobile drawer');
    assert.equal(drawer().style.pointerEvents, 'auto', 'No orphaned menu can block drawer interactions');
    assert.equal(drawer().getAttribute('aria-hidden'), null, 'Drawer accessibility is restored');
    assert.equal(document.querySelector('[role="menu"], [role="alertdialog"]'), null);
    assert.equal(document.body.style.pointerEvents, 'none', 'The drawer still owns background shielding');
    assert.equal(document.querySelectorAll('.ws-drawer-overlay').length, 1, 'One drawer overlay remains');
  };
  const assertReleased = () => {
    assert.equal(document.querySelector('.ws-mobile-sidebar, [role="menu"], [role="alertdialog"]'), null);
    assert.equal(document.body.style.pointerEvents, '', 'All modal pointer locks are released');
    assert.equal(document.getElementById('root').getAttribute('aria-hidden'), null, 'Background accessibility is restored');
    assert.equal(document.body.hasAttribute('data-scroll-locked'), false, 'All scroll locks are released');
  };
  await render({});
  const draft = document.getElementById('current-draft');
  await click(button('Open navigation')); await wait(); assertDrawerUsable();
  // Touch/Safari-like activation begins with another control focused. No
  // artificial trigger.focus() call is needed to open or return from the menu.
  assert.ok(document.activeElement === button('Close navigation'));
  for (let n = 0; n < 3; n++) {
    await openMenu();
    assert.equal(drawer().style.pointerEvents, 'none', 'Visible modal menu owns input while open');
    await escape(); assertDrawerUsable();
    assert.ok(document.activeElement === options(), 'Escape returns to the actual chat option trigger');
  }
  for (const pointerType of ['touch', 'mouse']) {
    await openMenu();
    const outside = document.querySelector('.ws-drawer-overlay');
    await pointer(outside, pointerType); await click(outside); await wait(); assertDrawerUsable();
  }
  await openMenu(); await click(item('Pin chat')); await wait(); assertDrawerUsable();
  assert.deepEqual(events.splice(0), [['pin', 'two', true]], 'Pin keeps the existing owned-chat callback');
  for (const dismissal of ['Cancel', 'Escape', 'Save name']) {
    await openMenu(); await click(item('Rename chat')); await wait();
    const dialog = document.querySelector('[role="alertdialog"]');
    assert(dialog); assert.equal(dialog.style.zIndex, '12030');
    assert.equal(drawer().style.pointerEvents, 'none', 'Rename owns input until it is dismissed');
    assert(dialog.contains(document.activeElement), 'Focus moved into the rename confirmation');
    if (dismissal === 'Save name') {
      const input = document.querySelector('[aria-label="Chat name"]');
      await act(async () => Simulate.change(input, { target: { value: 'Renamed conversation' } }));
      await click(dialogButton(dismissal));
    } else if (dismissal === 'Escape') await escape();
    else await click(dialogButton(dismissal));
    await wait(); assertDrawerUsable();
    // Async saves/deletes may disable the trigger during the existing dialog
    // close callback. Cancel/Escape must return focus; every path must unlock
    // the drawer and allow the next real menu interaction.
    if (dismissal === 'Cancel' || dismissal === 'Escape') assert.ok(document.activeElement === options(), 'Dismissal restores the option trigger');
  }
  assert.deepEqual(events.splice(0), [['rename', 'two', 'Renamed conversation']]);
  for (const dismissal of ['Cancel', 'Escape', 'Delete chat']) {
    await openMenu(); await click(item('Delete chat')); await wait();
    assert(document.querySelector('[role="alertdialog"]')); assert.equal(drawer().style.pointerEvents, 'none');
    if (dismissal === 'Escape') await escape(); else await click(dialogButton(dismissal));
    await wait(); assertDrawerUsable();
    if (dismissal === 'Cancel' || dismissal === 'Escape') assert.ok(document.activeElement === options(), 'Dismissal restores the option trigger');
  }
  assert.deepEqual(events.splice(0), [['delete', 'two']], 'Only the confirmed Delete calls the handler');
  await openMenu(); await click(item('Move to folder')); await wait(); assertMenuLayer();
  assert.equal(document.querySelectorAll('[role="menu"]').length, 2, 'Actual folder submenu opens');
  await click(item('Owned folder')); await wait(); assertDrawerUsable();
  assert.deepEqual(events.splice(0), [['move', 'two', 'folder']]);
  await render({ recent: props.recent.map(chat => chat.id === 'two' ? { ...chat, folderId: 'folder' } : chat) });
  await openMenu(); await click(item('Move to folder')); await wait(); assertMenuLayer();
  assert.equal(item('Owned folderCurrent folder')?.getAttribute('aria-disabled'), 'true', 'Current folder stays disabled');
  await click(item('Remove from folder')); await wait(); assertDrawerUsable();
  assert.deepEqual(events.splice(0), [['move', 'two', null]]);
  await openMenu(); await click(item('Move to folder')); await wait(); await escape();
  // Escape from a submenu closes the menu tree, preserving the owning drawer.
  assertDrawerUsable();
  await click([...drawer().querySelectorAll('.ws-recent-open')].find(node => node.textContent === 'Other conversation')); await wait();
  assert.deepEqual(events.splice(0), [['open', 'two']], 'Opening a chat still works without closing/reopening the drawer first');
  assertReleased();
  await click(button('Open navigation')); await wait();
  await openMenu(); await escape();
  await click([...drawer().querySelectorAll('.ws-nav button')].find(node => node.textContent === 'Memory')); await wait();
  assert.deepEqual(events.splice(0), [['navigate', 'memory']]); assertReleased();
  await click(button('Open navigation')); await wait();
  await openMenu(); await escape(); await click(button('Close navigation')); await wait(); assertReleased();
  assert.ok(document.getElementById('current-draft') === draft, 'All menu flows preserve the current chat mount');
  assert.equal(draft.value, 'Preserved draft');
  // Resizing away with a nested menu open must release every modal layer.
  await click(button('Open navigation')); await wait(); await openMenu();
  await act(async () => { desktop = true; listeners.forEach(listener => listener()); }); await wait(); assertReleased();
  await openMenu(); await escape(); assertReleased();
  await openMenu(); await click(item('Rename chat')); await wait(); await click(dialogButton('Cancel')); await wait();
  assert.ok(document.activeElement === options(), 'Desktop rename focus is preserved'); assertReleased();
  await openMenu(); await click(item('Move to folder')); await wait(); assertMenuLayer(); await click(item('Remove from folder')); await wait(); assertReleased();
  assert.deepEqual(events.splice(0), [['move', 'two', null]]);
  await act(async () => { desktop = false; listeners.forEach(listener => listener()); });
  await click(button('Open navigation')); await wait(); await openMenu();
  await render({ recent: props.recent.filter(chat => chat.id !== 'two') }); await wait(); assertDrawerUsable();
  await click(button('Close navigation')); await wait(); assertReleased();
  // Legacy callers retain the shared dropdown's original layer and behavior.
  await act(async () => root.render(React.createElement(ChatRowActions, { title: 'Legacy', pinned: false, onPin: async () => {}, onDelete: async () => {} })));
  await pointer(button('Chat options'), 'mouse'); await wait();
  const legacyMenu = document.querySelector('[role="menu"]');
  assert(legacyMenu); assert.equal(legacyMenu.style.zIndex, ''); assert.equal(getComputedStyle(legacyMenu).zIndex, '100');
  await escape(); assertReleased();
  await act(async () => root.unmount()); root = null;
  assert.equal(listeners.size, 0); assert.equal(network, 0);
  console.log('PASS production-layer + real React/Radix menu: visible root/submenu wrappers, repeated touch-like opens, Escape/outside dismiss, pin, rename/save/cancel, confirmed delete, folder move/remove, subsequent chat/navigation, resize/removed-row cleanup, desktop/legacy behavior, focus, pointer/scroll/accessibility release, preserved draft, zero network.');
} finally {
  if (root) { const { act } = await import('react'); await act(async () => root.unmount()); }
  await server.close(); dom.window.close();
}
