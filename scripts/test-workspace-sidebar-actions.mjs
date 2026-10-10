import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const load = (path, aliases = {}) => {
  const compiled = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return exports;
};
function hooks() {
  let cursor = 0; const values = [];
  return {
    react: { ...React,
      useEffect() {},
      useRef(initial) { const i = cursor++; values[i] ??= { current: initial }; return values[i]; },
      useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    },
    render(component, props) { cursor = 0; return component(props); },
  };
}
const walk = (element, predicate) => React.isValidElement(element)
  ? [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(child => walk(child, predicate))] : [];
const text = element => React.isValidElement(element) ? React.Children.toArray(element.props.children).map(text).join('') : String(element ?? '');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// Render the active production Chrome, rather than the Workspace-hidden legacy sidebar.
const chromeHooks = hooks();
const chatActions = props => React.createElement('button', { 'aria-label': `Options for ${props.title}` });
const { WorkspaceChrome } = load('src/workspace/WorkspaceChrome.tsx', { react: chromeHooks.react, '@/components/ChatRowActions': { ChatRowActions: chatActions } });
const events = [];
const chromeProps = {
  section: 'chat', title: 'Saved title', currentId: 'mine', recent: [{ id: 'mine', title: 'Saved title', work: true, pinned: true, folderId: 'folder' }],
  folders: [{ id: 'folder', name: 'Owned folder' }], onNavigate: id => events.push(['navigate', id]), onNewChat() {}, onOpenChat: id => events.push(['open', id]),
  onAllChats: () => events.push(['all']), onPinChat: async (...args) => events.push(['pin', ...args]), onRenameChat: async (...args) => events.push(['rename', ...args]),
  onMoveChat: async (...args) => events.push(['move', ...args]), onDeleteChat: async (...args) => events.push(['delete', ...args]), onUsage() {}, onInfo() {}, onAccount() {}, children: 'Live chat',
};
let chrome = chromeHooks.render(WorkspaceChrome, chromeProps);
const html = renderToStaticMarkup(chrome);
assert.ok(html.includes('All chats') && html.includes('Options for Saved title') && html.includes('Work'));
assert.ok(html.includes('<h1 class="sr-only">Saved title</h1>'), 'saved title stays accessible without visible header text');
const row = walk(chrome, element => element.type === chatActions)[0];
assert.equal(row.props.workspaceUI, true);
assert.deepEqual(row.props.folders, chromeProps.folders);
assert.equal(row.props.pinned, true);
assert.equal(row.props.folderId, 'folder');
await row.props.onPin(false); await row.props.onRename('Renamed'); await row.props.onMove(null); await row.props.onDelete();
assert.deepEqual(events.splice(0), [['pin', 'mine', false], ['rename', 'mine', 'Renamed'], ['move', 'mine', null], ['delete', 'mine']]);
walk(chrome, element => element.props['aria-label'] === 'Open navigation')[0].props.onClick();
chrome = chromeHooks.render(WorkspaceChrome, chromeProps);
assert.equal(walk(chrome, element => element.props.open === true && typeof element.props.onOpenChange === 'function').length, 1);
walk(chrome, element => element.type === 'button' && text(element) === 'All chats')[0].props.onClick();
chrome = chromeHooks.render(WorkspaceChrome, chromeProps);
assert.deepEqual(events.splice(0), [['all']]);
assert.equal(walk(chrome, element => element.props.open === true).length, 0, 'All chats closes the mobile drawer');
walk(chrome, element => element.props.className === 'ws-recent-open')[0].props.onClick();
assert.deepEqual(events.splice(0), [['open', 'mine']]);
chrome = chromeHooks.render(WorkspaceChrome, { ...chromeProps, allChatsActive: true });
const navButtons = walk(chrome, element => element.type === 'button' && element.props['aria-current'] === 'page');
assert.ok(navButtons.every(element => text(element) === 'All chats'), 'history route does not also mark Chat/current row selected');

// Execute real Shell callbacks with an in-memory store. No API calls occur.
const shellHooks = hooks();
let user = { id: 'owner' };
let location = { pathname: '/', search: '' };
let state = {
  syncedUserId: 'owner', currentSessionId: 'mine', messages: [],
  chatSessions: [
    { id: 'recent', title: 'Recent', persistenceOwnerId: 'owner' },
    { id: 'mine', title: 'Pinned owned', persistenceOwnerId: 'owner' },
    { id: 'legacy', title: 'Synced legacy' },
    { id: 'other', title: 'Private other account', persistenceOwnerId: 'other-owner' },
  ],
  folders: [{ id: 'folder', name: 'Owned folder', userId: 'owner' }, { id: 'other-folder', name: 'Other folder', userId: 'other-owner' }],
  updateSessionTitle: async (...args) => events.push(['rename-store', ...args]),
  moveChatToFolder: async (...args) => events.push(['move-store', ...args]),
  deleteSession: async id => { events.push(['delete-store', id]); state.currentSessionId = null; },
};
const arcStore = selector => selector(state); arcStore.getState = () => state;
const canvasState = { isOpen: false }; const canvasStore = selector => selector(canvasState); canvasStore.getState = () => canvasState;
const { WorkspaceShell } = load('src/workspace/WorkspaceShell.tsx', {
  react: shellHooks.react,
  'react-router-dom': { useLocation: () => location, useNavigate: () => path => events.push(['go', path]) },
  '@/hooks/useAuth': { useAuth: () => ({ user, profile: null }) },
  '@/hooks/useChatPins': { useChatPins: () => ({ pinnedIds: ['mine', 'other'], setPinned: async (...args) => events.push(['pin-store', ...args]) }) },
  '@/store/useArcStore': { useArcStore: arcStore }, '@/store/useCanvasStore': { useCanvasStore: canvasStore },
  '@/store/useAccentStore': { useAccentStore: selector => selector({ themeMode: 'dark', setThemeMode() {} }) },
  './WorkspaceChrome': { WorkspaceChrome: 'WorkspaceChrome', WorkspaceDialog: 'WorkspaceDialog', IconButton: 'IconButton' },
  './conversationCanvas': load('src/workspace/conversationCanvas.ts'), './useWorkspaceTheme': { useWorkspaceTheme() {} },
});
let shell = shellHooks.render(WorkspaceShell, { children: null });
assert.deepEqual(shell.props.recent.map(item => item.id), ['mine', 'recent', 'legacy']);
assert.deepEqual(shell.props.folders.map(folder => folder.id), ['folder']);
shell.props.onAllChats();
await shell.props.onPinChat('mine', false); await shell.props.onRenameChat('mine', 'Changed'); await shell.props.onMoveChat('mine', 'folder'); await shell.props.onMoveChat('mine', null);
assert.deepEqual(events.splice(0), [['go', '/dashboard?tab=chats'], ['pin-store', 'mine', false], ['rename-store', 'mine', 'Changed'], ['move-store', 'mine', 'folder'], ['move-store', 'mine', null]]);
for (const action of [() => shell.props.onPinChat('other', true), () => shell.props.onRenameChat('other', 'No'), () => shell.props.onMoveChat('other', 'folder'), () => shell.props.onDeleteChat('other'), () => shell.props.onMoveChat('mine', 'other-folder')]) await assert.rejects(action);
assert.deepEqual(events, [], 'cross-account actions never reach controllers');
state.folders[0].userId = 'other-owner';
await assert.rejects(() => shell.props.onMoveChat('mine', 'folder'), /not available/, 'folder ownership is rechecked at click time');
state.folders[0].userId = 'owner';
state.syncedUserId = 'other-owner';
await assert.rejects(() => shell.props.onRenameChat('legacy', 'No'), /not available/, 'legacy cache ownership is rechecked after sync changes');
state.syncedUserId = 'owner';
await shell.props.onDeleteChat('mine');
assert.deepEqual(events.splice(0), [['delete-store', 'mine'], ['go', '/']], 'deleting current chat uses existing deletion and leaves the stale route without saving its canvas');
location = { pathname: '/dashboard', search: '' };
assert.equal(shellHooks.render(WorkspaceShell, { children: null }).props.allChatsActive, false, 'the dashboard overview is not All chats');
location = { pathname: '/dashboard', search: '?tab=chats' };
assert.equal(shellHooks.render(WorkspaceShell, { children: null }).props.allChatsActive, true);
user = null;
shell = shellHooks.render(WorkspaceShell, { children: null });
assert.deepEqual(shell.props.recent, []); assert.deepEqual(shell.props.folders, []);

// Run pin, move, rename/save, delete/confirm and focus callbacks in the real row component.
const rowHooks = hooks();
const dropdownNames = ['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuSeparator','DropdownMenuSub','DropdownMenuSubContent','DropdownMenuSubTrigger','DropdownMenuTrigger'];
const dialogNames = ['AlertDialog','AlertDialogAction','AlertDialogCancel','AlertDialogContent','AlertDialogDescription','AlertDialogFooter','AlertDialogHeader','AlertDialogTitle'];
const { ChatRowActions } = load('src/components/ChatRowActions.tsx', {
  react: rowHooks.react, '@/components/ui/input': { Input: 'Input' }, '@/components/ui/button': { Button: 'Button' },
  '@/components/ui/dropdown-menu': Object.fromEntries(dropdownNames.map(name => [name, name])),
  '@/components/ui/alert-dialog': Object.fromEntries(dialogNames.map(name => [name, name])),
  sonner: { toast: { error: message => events.push(['error', message]) } },
});
const rowProps = { workspaceUI: true, title: 'Old', pinned: false, folderId: 'folder', folders: [{ id: 'folder', name: 'Current' }, { id: 'second', name: 'Next' }], onPin: async value => events.push(['pin', value]), onMove: async value => events.push(['move', value]), onRename: async value => events.push(['rename', value]), onDelete: async () => events.push(['delete']) };
let rowTree = rowHooks.render(ChatRowActions, rowProps);
const item = label => walk(rowTree, element => element.type === 'DropdownMenuItem' && text(element).includes(label))[0];
item('Pin chat').props.onSelect(); await flush();
assert.equal(item('Current').props.disabled, true);
item('Remove from folder').props.onSelect(); await flush(); item('Next').props.onSelect(); await flush();
item('Rename chat').props.onSelect(); rowTree = rowHooks.render(ChatRowActions, rowProps);
assert.equal(walk(rowTree, element => element.type === 'AlertDialog')[0].props.open, true);
walk(rowTree, element => element.type === 'Input')[0].props.onChange({ target: { value: '  New name  ' } });
rowTree = rowHooks.render(ChatRowActions, rowProps);
walk(rowTree, element => element.type === 'AlertDialogAction' && text(element) === 'Save name')[0].props.onClick({ preventDefault() {} }); await flush();
rowTree = rowHooks.render(ChatRowActions, rowProps);
assert.equal(walk(rowTree, element => element.type === 'AlertDialog')[0].props.open, false);
item('Delete chat').props.onSelect();
assert.ok(!events.some(event => event[0] === 'delete'), 'menu click does not delete without confirmation');
rowTree = rowHooks.render(ChatRowActions, rowProps);
assert.equal(walk(rowTree, element => element.type === 'AlertDialog')[1].props.open, true);
walk(rowTree, element => element.type === 'AlertDialogAction' && text(element) === 'Delete chat')[0].props.onClick(); await flush();
assert.deepEqual(events.splice(0), [['pin', true], ['move', null], ['move', 'second'], ['rename', 'New name'], ['delete']]);
assert.ok(walk(rowTree, element => element.type === 'AlertDialogContent').every(element => element.props.layer === 12030));
const legacyTree = rowHooks.render(ChatRowActions, { ...rowProps, workspaceUI: false });
const legacyMenu = walk(legacyTree, element => element.type === 'DropdownMenuContent')[0];
assert.equal(legacyMenu.props.onCloseAutoFocus, undefined);
assert.equal(legacyMenu.props.collisionPadding, undefined);
assert.equal(legacyMenu.props.className, undefined);
const styles = read('src/workspace/workspace.css');
assert.ok(styles.includes('top:calc(var(--ws-viewport-top,0px) + var(--ws-viewport-height,100dvh)/2)'), 'rename dialog follows keyboard visual viewport');
assert.match(styles, /\.ws-chat-actions-menu \{ z-index:12020/);
assert.match(styles, /@media\(max-height:900px\)[^\n]*overflow-y:auto[^\n]*min-height:80px/);
assert.match(styles, /\.ws-chat-actions-dialog input \{[^}]*font-size:16px/);
console.log('PASS actual Workspace sidebar SSR, navigation/drawer closure, real row callbacks, pin ordering, folder/session ownership, rename and delete confirmation, mobile portal layers/keyboard styling and unchanged legacy options. Offline component tests only.');
