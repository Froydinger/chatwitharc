import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mobile = read('src/components/MobileChatApp.tsx');
const welcome = read('src/components/WorkspaceChatWelcome.tsx');
const suggestions = read('src/components/SmartSuggestions.tsx');
const styles = read('src/workspace/workspace.css');
const greetingSource = read('src/components/WelcomeSection.tsx');

const workspaceWelcomeIndex = mobile.indexOf('<WorkspaceChatWelcome');
const composerIndex = mobile.indexOf('<ConditionalTransition preset="panel">{!isVoiceActive && (', workspaceWelcomeIndex);
const legacySuggestionsIndex = mobile.indexOf('className="pointer-events-auto mt-4 flex justify-center"', composerIndex);
assert.ok(workspaceWelcomeIndex > 0 && workspaceWelcomeIndex < composerIndex, 'Workspace welcome cluster renders before the composer');
assert.ok(legacySuggestionsIndex > composerIndex, 'ordinary mobile chat keeps suggestions after the composer');
assert.match(mobile.slice(workspaceWelcomeIndex - 180, workspaceWelcomeIndex), /messages\.length === 0 && workspaceUI/);
assert.match(mobile.slice(legacySuggestionsIndex - 120, legacySuggestionsIndex), /!workspaceUI && !isVoiceActive && messages\.length === 0/);

assert.ok(welcome.indexOf('<CyclingGreeting />') < welcome.indexOf('<SmartSuggestions'), 'the unchanged rotating greeting precedes quick prompts in the same component');
assert.ok(welcome.includes('workspaceUI\n      />'), 'quick prompts use the Workspace appearance only in this branch');
assert.ok(welcome.includes('onSelectPrompt={onSelectPrompt}'), 'prompt selection is delegated to the existing live callback');
assert.ok(welcome.includes('onShowMore={onShowMore}'), 'the real prompt-library opener is retained');
assert.ok(suggestions.includes('workspaceUI?: boolean'), 'Workspace classes are optional');
assert.ok(suggestions.includes('onClick={() => onSelectPrompt(suggestion.fullPrompt || suggestion.prompt)}'), 'the actual prompt handler is preserved');
assert.ok(suggestions.includes('onClick={onShowMore}'), 'the actual prompt-library handler is preserved');
assert.match(styles, /\.ws-live-content \.ws-chat-welcome\s*\{[^}]*position:fixed/s);
assert.match(styles, /\.ws-chat-welcome>\.ws-quick-prompts\s*\{[^}]*pointer-events:auto/s);
assert.match(styles, /\.ws-quick-prompts \.ws-quick-prompt\s*\{[^}]*var\(--ws-canvas\)/s);
assert.match(styles, /@media\(max-height:520px\)\s*\{\s*\.ws-live-content \.ws-chat-welcome \{ top:16px; \}\s*\}/);
assert.ok(!styles.includes('.ws-live-content .ws-live-greeting {\n  position:fixed'), 'the greeting is no longer detached from its prompts');
assert.ok(!greetingSource.includes('const MORNING_GREETINGS = []'), 'time-based greeting content remains intact');

console.log('Workspace quick prompts stay directly under the existing rotating greeting; ordinary mobile chat keeps its legacy placement and both actions remain live.');
