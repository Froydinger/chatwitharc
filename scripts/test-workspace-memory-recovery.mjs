import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/workspace/WorkspaceDashboardPages.tsx', import.meta.url), 'utf8')
  .replace("import './workspace-pages.css';", '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const iconExports = new Proxy({}, { get: (target, name) => target[name] ?? (target[name] = props => React.createElement('svg', props)) });
const passthrough = tag => ({ children, ...props }) => React.createElement(tag, props, children);
const aliases = {
  '@/components/ChatRowActions': { ChatRowActions: () => null },
  '@/components/PrivateImage': { PrivateImage: () => null },
  '@/components/ui/button': { Button: ({ children, variant: _variant, size: _size, className, ...props }) => React.createElement('button', { ...props, className }, children) },
  '@/components/ui/input': { Input: passthrough('input') },
  '@/components/ui/textarea': { Textarea: passthrough('textarea') },
  '@/components/ui/label': { Label: passthrough('label') },
  '@/components/ui/switch': { Switch: passthrough('input') },
  '@/hooks/useChatPins': { useChatPins: () => ({}) },
  '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'].map(name => [name, passthrough('div')])),
  '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map(name => [name, passthrough('div')])),
  'lucide-react': iconExports,
};
const exports = {};
new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));

const callbacks = new Proxy({}, { get: () => () => {} });
const render = overrides => renderToStaticMarkup(React.createElement(exports.WorkspaceDashboardPage, { model: {
  tab: 'memory', loading: false, error: 'Could not save the living summary.',
  summary: { id: 'memory-summary:owner', content: 'Last saved summary', source: 'memory', created_at: null, updated_at: null },
  isAdding: false, newContent: '', editing: true, editContent: 'Unsaved draft to preserve', saving: false,
  onExport: callbacks.onExport, onStartAdd: callbacks.onStartAdd, onCancelAdd: callbacks.onCancelAdd,
  onNewContent: callbacks.onNewContent, onAdd: callbacks.onAdd, onStartEdit: callbacks.onStartEdit,
  onEditContent: callbacks.onEditContent, onCancelEdit: callbacks.onCancelEdit, onSave: callbacks.onSave,
  onImport: callbacks.onImport, onRetry: callbacks.onRetry,
  ...overrides,
} }));

const failedSave = render({});
assert.ok(failedSave.includes('Could not save the living summary.'), 'save errors stay visible');
assert.ok(failedSave.includes('Unsaved draft to preserve'), 'failed save keeps the edit value rendered');
assert.ok(failedSave.includes('Save summary') && failedSave.includes('Cancel'), 'the user can retry saving or cancel');
assert.ok(failedSave.includes('Try again'), 'the memory read retry remains available');

const refreshWhileEditing = render({ loading: true, error: 'Could not refresh memory.', summary: null });
assert.ok(refreshWhileEditing.includes('Unsaved draft to preserve'), 'a read refresh does not unmount an active draft');
assert.ok(refreshWhileEditing.includes('Living summary'), 'the editor remains labeled while the stored copy is unavailable');

console.log('Workspace memory recovery checks passed: failed save, read error, retry controls and unsaved edits remain visible.');
