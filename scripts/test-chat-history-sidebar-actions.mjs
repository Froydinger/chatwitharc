import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sidebar = read('src/components/ChatHistorySidebar.tsx');
const actions = read('src/components/ChatRowActions.tsx');

assert.ok(sidebar.includes('aria-label="All chats"'), 'sidebar exposes an All chats destination');
assert.ok(sidebar.includes("navigate('/dashboard?tab=chats')"), 'All chats opens the existing complete chats page');
assert.ok(sidebar.includes('closeAfterNavigate()'), 'navigating from the mobile sidebar closes it');
assert.ok(sidebar.includes('const folders = useArcStore(state => state.folders)'), 'sidebar uses the existing folder state');
assert.ok(sidebar.includes('onMove={folderId => useArcStore.getState().moveChatToFolder(session.id, folderId)}'), 'folder selection calls the existing move handler');
assert.ok(sidebar.includes('onPin={value => setPinned(session.id, value)}'), 'pin changes use the existing pin handler');
assert.ok(sidebar.includes('onDelete={() => useArcStore.getState().deleteSession(session.id)}'), 'delete uses the existing session handler');

assert.ok(actions.includes("{pinned ? 'Unpin chat' : 'Pin chat'}"), 'menu toggles pin state');
assert.ok(actions.includes('Move to folder') && actions.includes('<DropdownMenuSubContent'), 'folder moves are reachable in a submenu');
assert.ok(actions.includes('onSelect={() => moveTo(null)}'), 'a chat can be removed from its current folder');
assert.ok(actions.includes('folders.map(folder =>'), 'existing folders are available as move destinations');
assert.ok(actions.includes('disabled={folder.id === folderId}'), 'the current folder cannot be selected redundantly');
assert.ok(actions.includes('onMove(targetFolderId).catch'), 'move failures are surfaced without swallowing them');
assert.ok(actions.includes('Rename chat') && actions.includes('Delete this chat?'), 'existing rename and confirmed delete actions remain');

console.log('Sidebar All chats navigation and per-chat pin, move, rename, and confirmed delete actions are wired to existing handlers.');
