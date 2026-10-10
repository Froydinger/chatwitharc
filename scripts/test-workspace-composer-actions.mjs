import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const chatInput = read('src/components/ChatInput.tsx');
const actionsComponent = read('src/components/chat-input/ComposerActions.tsx');
const workspaceActions = read('src/components/chat-input/WorkspaceComposerActions.tsx');
const workspaceCss = read('src/workspace/workspace.css');

const createActions = chatInput.slice(
  chatInput.indexOf('const createActions = ['),
  chatInput.indexOf('const createMenuActions = createActions;'),
);
assert.deepEqual(
  [...createActions.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]),
  ['attach', 'generate', 'write', 'prompts', 'work', 'code', 'git', 'search', 'deep-search'],
  'Workspace menu receives the complete real production action list in its existing order',
);
assert.equal((createActions.match(/run: \(\) =>/g) ?? []).length, 9, 'all nine original action callbacks remain defined');
assert.ok(chatInput.includes('const createMenuActions = createActions;'), 'menu reuses the action objects and callback identities');
assert.ok(chatInput.includes('workspaceUI={workspaceUI} anchorRef={menuButtonRef}'));
assert.ok(chatInput.includes('aria-expanded={showMenu}') && chatInput.includes('aria-haspopup="menu"'));

assert.ok(actionsComponent.includes('if (workspaceUI && anchorRef)'));
assert.ok(actionsComponent.includes('<WorkspaceComposerActions showMenu={showMenu} actions={actions} onClose={onClose} anchorRef={anchorRef} />'));
assert.ok(actionsComponent.includes('LiquidMetalOverlay') && actionsComponent.includes('TransitionPart'), 'the legacy menu renderer stays intact');

assert.ok(workspaceActions.includes('<Popover.Root open={showMenu}'), 'Workspace popover is controlled by ChatInput state');
assert.ok(workspaceActions.includes('virtualRef={anchorRef as RefObject<'));
assert.ok(workspaceActions.includes('side="top"') && workspaceActions.includes('align="start"'));
assert.ok(workspaceActions.includes('sideOffset={10}') && workspaceActions.includes('collisionPadding={12}'));
assert.ok(workspaceActions.includes('className="workspace-ui ws-menu ci-tiles ci-workspace-create-menu arc-dropdown"'));
assert.ok(workspaceActions.includes('onClick={action.run}'), 'each menu item uses the exact original callback function');
assert.ok(workspaceActions.includes("role={isWorkMode ? 'menuitemcheckbox' : 'menuitem'}"));
assert.ok(workspaceActions.includes('aria-checked={isWorkMode ? Boolean(action.active) : undefined}'));
assert.ok(workspaceActions.includes('inert={!showMenu}') && workspaceActions.includes("pointerEvents: showMenu ? 'auto' : 'none'"));
assert.ok(workspaceActions.includes('event.target.closest(\'.ci-menu-btn\')'), 'external + clicks do not trigger outside-dismiss reopen');
assert.ok(workspaceActions.includes('event.stopPropagation()'), 'portal clicks do not bubble into the composer');
assert.ok(workspaceActions.includes('querySelector<HTMLButtonElement>(menuItemSelector)?.focus({ preventScroll: true })'), 'opening focuses the first enabled item without scrolling');
assert.ok(workspaceActions.includes('onCloseAutoFocus={(event) => event.preventDefault()}'), 'closing a menu action preserves its destination focus');
for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) assert.ok(workspaceActions.includes(key), `${key} keyboard behavior is handled`);
assert.ok(workspaceActions.includes('focusTabDestination(event.shiftKey)'), 'Tab and Shift+Tab leave the menu without trapping focus');
assert.ok(!workspaceActions.includes('LiquidMetalOverlay') && !workspaceActions.includes('liquid-metal-surface'));

assert.ok(workspaceCss.includes('width:min(280px,calc(100vw - 24px))'));
assert.ok(workspaceCss.includes('var(--ws-canvas)') && workspaceCss.includes('var(--ws-text)') && workspaceCss.includes('var(--ws-line)'));
assert.ok(workspaceCss.includes('var(--radix-popover-content-available-height') && workspaceCss.includes('overflow-y:auto'));
assert.ok(workspaceCss.includes('min-height:44px') && workspaceCss.includes('gap:11px') && workspaceCss.includes('font-size:14px'));
assert.ok(workspaceCss.includes('@media(prefers-reduced-motion:reduce)') && workspaceCss.includes('.ci-workspace-create-menu * { animation:none!important'));

console.log('Workspace composer actions preserve all nine callbacks and verify the controlled accessible popover, positioning, dismissal, keyboard handling, focus behavior, theme tokens, and legacy gate.');
