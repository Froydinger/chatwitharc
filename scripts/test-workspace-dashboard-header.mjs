// Real Shell + Chrome + DashboardPreviewPage with inert auth/store/Supabase.
// The unrelated library controllers are replaced by real presentation pages
// with empty models. No account, provider, permission or network calls occur.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { JSDOM } = await import(process.env.ARC_JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://offline.invalid/dashboard?tab=chats', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'localStorage', 'sessionStorage']) Object.defineProperty(globalThis, key, { value: win[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
win.HTMLElement.prototype.scrollIntoView = function () {};
let desktop = true;
const mediaListeners = new Map();
win.matchMedia = query => ({ get matches() { return query.includes('min-width') ? desktop : query.includes('pointer: coarse') ? !desktop : false; }, addEventListener: (_, fn) => { if (!mediaListeners.has(query)) mediaListeners.set(query, new Set()); mediaListeners.get(query).add(fn); }, removeEventListener: (_, fn) => mediaListeners.get(query)?.delete(fn), addListener() {}, removeListener() {} });
globalThis.matchMedia = win.matchMedia;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network prohibited'); };
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const router = require('react-router-dom');
const rootPath = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(path.join(rootPath, name), 'utf8');
const baseCommit = '6bcee0db5b42c63acd3a39773ddb0f4f976c2b35';
const baseline = execFileSync('git', ['show', `${baseCommit}:src/pages/DashboardPreviewPage.tsx`], { cwd: rootPath, encoding: 'utf8' });
const source = read('src/pages/DashboardPreviewPage.tsx');
const parse = text => ts.createSourceFile('DashboardPreviewPage.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const findNodes = (text, predicate) => { const ast = parse(text); const found = []; const visit = node => { if (predicate(node)) found.push(node.getText(ast)); ts.forEachChild(node, visit); }; visit(ast); return found; };
assert.deepEqual(findNodes(source, node => ts.isCallExpression(node) && node.expression.getText() === 'useEffect'), findNodes(baseline, node => ts.isCallExpression(node) && node.expression.getText() === 'useEffect'), 'every original dashboard effect, including load/subscription/cleanup, is unchanged');
for (const name of ['clearNotifications', 'handleOpenNotification', 'resolveNotificationChat', 'handleOpenChat', 'handleTabChange']) {
  const select = node => ts.isVariableDeclaration(node) && node.name.getText() === name;
  assert.deepEqual(findNodes(source, select), findNodes(baseline, select), `${name}: original handler unchanged`);
}
const oldHeader = baseline.match(/<header className="dashboard-preview-header[\s\S]*?<\/header>/)[0];
assert.ok(source.includes(oldHeader), 'legacy/native-iOS/rollback header markup is exactly preserved');
assert.match(source, /const workspaceDashboard = live && workspaceUI;/);

let owner = { id: 'fixture-owner-one', email: 'one@example.test', user_metadata: {} };
const profile = { display_name: 'Fixture Owner' };
const requests = [];
const channels = new Set();
let subscriptionCount = 0;
let clearFails = false;
const historyRows = id => [
  { id: `${id}-push`, title: 'Images are ready', body: 'Your saved images are available.', url: '/dashboard?tab=images', tag: null, channel: 'push', created_at: '2026-10-10T12:00:00Z', read_at: null },
  { id: `${id}-email`, title: 'Saved canvas update', body: 'Your document is ready.', url: '/dashboard?tab=canvases', tag: null, channel: 'email', created_at: '2026-10-10T11:00:00Z', read_at: '2026-10-10T11:01:00Z' },
];
const supabase = {
  from(table) {
    assert.ok(['push_notification_history', 'scheduled_tasks'].includes(table), `Unexpected table: ${table}`);
    const request = { table, action: 'select', filters: [] };
    const query = {
      select(columns) { request.columns = columns; return query; },
      delete() { request.action = 'delete'; return query; },
      update(value) { request.action = 'update'; request.value = value; return query; },
      eq(...args) { request.filters.push(args); return query; },
      order(...args) { request.order = args; return query; },
      limit(value) { request.limit = value; return query; },
      then(resolve, reject) {
        requests.push(request);
        const userId = request.filters.find(([key]) => key === 'user_id')?.[1];
        const result = request.action === 'delete' && clearFails ? { error: { message: 'Fixture clear failure' } }
          : { error: null, count: 0, data: table === 'push_notification_history' && request.action === 'select' ? historyRows(userId) : [] };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  },
  rpc(name) { assert.equal(name, 'count_user_images'); return Promise.resolve({ data: 0, error: null }); },
  channel(name) {
    const channel = { name, on(type, filter, receive) { channel.filter = filter; channel.receive = receive; return channel; }, subscribe() { subscriptionCount++; channels.add(channel); return channel; } };
    return channel;
  },
  removeChannel(channel) { channels.delete(channel); return Promise.resolve(); },
  auth: { signOut() { throw new Error('Unexpected sign out'); } },
};
const noAction = () => { throw new Error('Unrelated action prohibited in notification test'); };
const arc = { chatSessions: [], folders: [], syncedUserId: owner.id, currentSessionId: null, messages: [], createNewSession: noAction, loadSession: noAction, deleteSession: noAction };
const store = state => Object.assign(selector => selector(state), { getState: () => state });
const loadedSources = new Set();
const modules = new Map();
const mocks = {
  '@/components/ui/liquid-metal-overlay': { LiquidMetalOverlay: () => null },
  '@/hooks/useAuth': { useAuth: () => ({ user: owner, profile, loading: false }) },
  '@/hooks/useProfile': { useProfile: () => ({ profile }) },
  '@/hooks/useChatSync': { useChatSync: () => ({ isLoaded: true }) },
  '@/hooks/useChatPins': { useChatPins: () => ({ pinnedIds: [], setPinned: noAction }) },
  '@/hooks/useAccentColor': { useAccentColor() {} },
  '@/store/useArcStore': { useArcStore: store(arc) },
  '@/store/useCanvasStore': { useCanvasStore: store({ isOpen: false }) },
  '@/store/useAccentStore': { useAccentStore: store({ themeMode: 'dark', cycleThemeMode: noAction, setThemeMode: noAction }) },
  '@/components/PrivateImage': { PrivateImage: () => null },
  '@/components/dashboard/UsageSnapshotWidget': { UsageSnapshotWidget: () => null },
  '@/lib/dashboardNavTrace': { logDashboardNavPhase() {} },
  '@/lib/features': { APP_BUILDER_ENABLED: true },
  '@/utils/platform': { isIOSPWA: () => false },
  '@/integrations/supabase/client': { supabase },
  '@/pages/DashboardPage': { DashboardPageInner: ({ activeTabOverride }) => {
    const tab = activeTabOverride === 'memories' ? 'memory' : activeTabOverride;
    const model = { tab, search: '', isLoaded: true, loading: false, page: 1, totalPages: 1, sessions: [], recentChats: [], folders: [], apps: [], images: [], canvases: [], viewerIndex: null, selected: null, summary: null, stats: [], greeting: 'Good afternoon', displayName: 'Fixture', settings: { app: null, title: '', description: '' } };
    const { WorkspaceDashboardPage } = loadSource('workspace/WorkspaceDashboardPages');
    return React.createElement(WorkspaceDashboardPage, { model });
  } },
};
function compile(text, name) {
  const result = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
  assert.equal((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, `${name}: valid syntax`);
  return result.outputText;
}
function loadSource(id) {
  if (modules.has(id)) return modules.get(id);
  const filename = ['.tsx', '.ts'].map(ext => path.join(rootPath, 'src', id + ext)).find(existsSync);
  assert.ok(filename, `Unmapped source module: ${id}`);
  loadedSources.add(id);
  const exports = {};
  modules.set(id, exports);
  new Function('exports', 'require', compile(readFileSync(filename, 'utf8'), id))(exports, name => {
    if (mocks[name]) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/')) return loadSource(name.slice(2));
    if (name.startsWith('.')) return loadSource(path.posix.normalize(path.posix.join(path.posix.dirname(id), name)));
    return require(name);
  });
  return exports;
}
const { DashboardNotificationTray } = loadSource('components/dashboard/DashboardNotificationTray');
const oldTraySource = findNodes(baseline, node => ts.isFunctionDeclaration(node) && node.name?.text === 'NotificationTray')[0];
const oldTrayExports = {};
new Function('exports', 'require', compile(`import { Bell, Mail } from 'lucide-react'; import { cn } from '@/lib/utils'; export ${oldTraySource}`, 'LegacyTray'))(oldTrayExports, name => name === '@/lib/utils' ? loadSource('lib/utils') : require(name));
const previewRows = [{ id: 'local-push', title: 'Saved', detail: 'Complete', time: 'now', channel: 'push', unread: true }];
for (const notifications of [[], previewRows]) {
  const props = { notifications, onClear() {}, onOpen() {} };
  assert.equal(renderToStaticMarkup(React.createElement(DashboardNotificationTray, props)), renderToStaticMarkup(React.createElement(oldTrayExports.NotificationTray, props)), 'extracted legacy tray is byte-for-byte identical');
}
const { WorkspaceShell } = loadSource('workspace/WorkspaceShell');
const { WorkspaceUIContext } = loadSource('workspace/WorkspaceContext');
const { DashboardPreviewPage } = loadSource('pages/DashboardPreviewPage');
let navigate;
let workspace = true;
function App() {
  navigate = router.useNavigate();
  const location = router.useLocation();
  const page = location.pathname === '/dashboard' ? React.createElement('div', { className: workspace ? 'ws-live-dashboard' : '' }, React.createElement(DashboardPreviewPage, { live: true }))
    : React.createElement('h1', null, 'Other page');
  return React.createElement(WorkspaceUIContext.Provider, { value: workspace }, workspace ? React.createElement(WorkspaceShell, null, page) : page);
}
const root = createRoot(document.getElementById('root'));
const render = async () => act(async () => { root.render(React.createElement(router.MemoryRouter, { initialEntries: ['/dashboard?tab=chats'] }, React.createElement(App))); });
const click = async node => { assert.ok(node, 'click target exists'); await act(async () => { node.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true })); node.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); };
const button = label => document.querySelector(`button[aria-label="${label}"]`);
const trigger = () => button('Recent push notifications');
const tray = () => document.querySelector('[role="dialog"][aria-label="Recent notifications"]');
const settle = async () => act(async () => new Promise(resolve => setTimeout(resolve, 25)));
const page = async tab => { await act(async () => navigate(`/dashboard${tab === 'overview' ? '' : `?tab=${tab}`}`)); await settle(); };
const selects = () => requests.filter(item => item.table === 'push_notification_history' && item.action === 'select');
try {
  await render(); await settle();
  const firstTrigger = trigger();
  assert.ok(firstTrigger);
  assert.equal(document.querySelector('.dashboard-preview-header'), null, 'old header is absent, not CSS-hidden');
  assert.equal(document.querySelector('[data-account-menu]'), null, 'old account control is not mounted');
  assert.ok(document.querySelector('.ws-sidebar .ws-account'), 'sidebar account access remains');
  assert.equal(channels.size, 1);
  assert.equal(selects().length, 1);
  assert.equal(selects()[0].limit, 20);
  for (const [tab, title] of [['chats', 'Chats'], ['images', 'Images'], ['canvases', 'Canvases'], ['apps', 'Apps'], ['memories', 'Memory'], ['overview', 'Good afternoon, Fixture.']]) {
    await page(tab);
    assert.equal(document.querySelectorAll('button[aria-label="Recent push notifications"]').length, 1, `${tab}: one real notification control`);
    assert.equal(trigger(), firstTrigger, `${tab}: the header control remains mounted across dashboard navigation`);
    assert.ok(document.querySelector('.ws-header').contains(trigger()));
    assert.equal(document.querySelector('.ws-header h1, .ws-header h2, .ws-header h3'), null, `${tab}: no toolbar title`);
    assert.equal(document.querySelector('.workspace-dashboard-page-intro h2')?.textContent, title);
    await click(trigger()); await settle();
    assert.ok(tray(), `${tab}: real tray opens`);
    assert.equal(tray().closest('.ws-frame'), null, `${tab}: body portal escapes the transformed/overflow-hidden frame`);
    assert.ok(tray().classList.contains('workspace-ui'), 'portaled tray carries its own Workspace theme scope');
    assert.equal(trigger().getAttribute('aria-controls'), tray().id, 'trigger points to its actual popover');
    assert.ok(tray().textContent.includes('Images are ready') && tray().textContent.includes('Saved canvas update'));
    assert.equal(document.querySelectorAll('.dashboard-preview-notification-tray').length, 1);
    await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await settle();
    assert.equal(tray(), null);
    assert.equal(document.activeElement, trigger(), 'Escape restores keyboard focus to notification trigger');
  }
  assert.equal(subscriptionCount, 1, 'navigation/opening never adds a notification subscription');
  assert.equal(selects().length, 1, 'navigation/opening never reloads notification history');
  await click(trigger()); await settle();
  clearFails = true;
  const oldError = console.error;
  console.error = () => {};
  try { await click([...tray().querySelectorAll('button')].find(node => node.textContent === 'Clear notifications')); } finally { console.error = oldError; }
  assert.ok(tray().textContent.includes('Images are ready'), 'failed clear preserves original entries');
  clearFails = false;
  await click([...tray().querySelectorAll('button')].find(node => node.textContent.includes('Images are ready')));
  await settle();
  assert.equal(document.querySelector('.workspace-dashboard-page-intro h2').textContent, 'Images', 'original notification destination runs');
  assert.equal(tray(), null);
  const update = requests.find(item => item.action === 'update');
  assert.deepEqual(update.filters, [['id', `${owner.id}-push`], ['user_id', owner.id]], 'original mark-read remains account scoped');
  assert.ok(update.value.read_at);
  await act(async () => [...channels][0].receive({ new: { ...historyRows(owner.id)[0], id: 'new-live-insert', title: 'Realtime insert' } }));
  await click(trigger()); await settle();
  assert.ok(tray().textContent.includes('Realtime insert'), 'existing subscription updates the header tray');
  await click([...tray().querySelectorAll('button')].find(node => node.textContent === 'Clear notifications'));
  assert.ok(tray().textContent.includes('You’re all caught up.'));
  assert.ok([...tray().querySelectorAll('button')].find(node => node.textContent === 'Clear notifications').disabled);
  assert.deepEqual(requests.filter(item => item.action === 'delete').at(-1).filters, [['user_id', owner.id]]);
  await click(document.querySelector('.workspace-dashboard-page-intro h2')); await settle();
  assert.equal(tray(), null, 'outside pointer dismisses the header popover');
  await act(async () => { desktop = false; mediaListeners.forEach(list => list.forEach(fn => fn())); });
  assert.equal(trigger(), firstTrigger, 'mobile breakpoint does not remount the notification control');
  await click(button('Open navigation')); await settle();
  assert.ok(document.querySelector('.ws-mobile-sidebar .ws-account'), 'mobile drawer retains account access');
  await click(document.querySelector('.ws-mobile-sidebar .ws-account')); await settle();
  assert.equal(trigger(), null, 'leaving dashboard removes the page-owned header action');
  assert.equal(channels.size, 0, 'leaving dashboard runs existing subscription cleanup');
  await page('chats');
  assert.equal(channels.size, 1);
  assert.equal(document.querySelectorAll('button[aria-label="Recent push notifications"]').length, 1);
  owner = { ...owner, id: 'fixture-owner-two' }; arc.syncedUserId = owner.id;
  await render(); await settle();
  assert.equal(channels.size, 1, 'account change cleans up the previous subscription');
  assert.deepEqual(selects().at(-1).filters, [['user_id', owner.id]]);
  assert.equal([...channels][0].filter.filter, `user_id=eq.${owner.id}`);
  workspace = false;
  await render(); await settle();
  assert.equal(document.querySelector('.ws-header'), null);
  assert.ok(document.querySelector('.dashboard-preview-header [data-account-menu]'));
  assert.equal(document.querySelectorAll('button[aria-label="Recent push notifications"]').length, 1);
  await click(trigger());
  assert.ok(document.querySelector('.dashboard-preview-header #dashboard-preview-notification-tray'), 'legacy/native/rollback branch retains its old tray');
  assert.equal(networkCalls, 0);
  for (const id of ['workspace/WorkspaceShell', 'workspace/WorkspaceChrome', 'pages/DashboardPreviewPage', 'workspace/WorkspaceDashboardPages', 'components/dashboard/DashboardNotificationTray']) assert.ok(loadedSources.has(id), `real ${id} was executed`);
  console.log('PASS real Shell/Chrome/dashboard composition on all six dashboard pages; one header tray; no old account/header; original controller effects and mutations; realtime insert; mark-read/navigation; failed/successful clear; Escape/outside/reopen; mobile account navigation; route/account cleanup; exact legacy tray/header parity; zero network calls.');
} finally {
  await act(async () => root.unmount());
  assert.equal(channels.size, 0);
  dom.window.close();
}
