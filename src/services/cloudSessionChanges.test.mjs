import { test } from 'node:test';
import { deepStrictEqual, throws } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('./cloudSessionChanges.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { transcriptChanges } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const message = (id, content = id) => ({ id, role: 'user', content });

test('local append carries no remote replacement or inferred deletion', () => {
  deepStrictEqual(transcriptChanges({ messages: [message('a')] }, { messages: [message('a'), message('b')] }), [{ kind: 'append', message: message('b') }]);
});
test('edits and intentional removals carry exact old-value preconditions', () => {
  deepStrictEqual(transcriptChanges({ messages: [message('a'), message('b')] }, { messages: [message('a', 'edited')] }), [
    { kind: 'replace', id: 'a', expected: message('a'), message: message('a', 'edited') },
    { kind: 'remove', id: 'b', expected: message('b') },
  ]);
});
test('Date normalization and object key order do not fabricate edits', () => {
  const timestamp = new Date('2026-09-12T12:00:00Z');
  deepStrictEqual(transcriptChanges({ messages: [{ ...message('a'), timestamp }] }, {
    messages: [{ content: 'a', timestamp: timestamp.toISOString(), role: 'user', id: 'a' }],
  }), []);
});
test('canvas edits retain old value; input state is not mutated', () => {
  const before = { messages: [message('a')], canvasContent: 'old' };
  const after = { messages: [message('a')], canvasContent: 'new' };
  deepStrictEqual(transcriptChanges(before, after), [{ kind: 'canvas', expected: 'old', value: 'new' }]);
  deepStrictEqual(before, { messages: [message('a')], canvasContent: 'old' });
});
test('ambiguous duplicate IDs, reordering and middle insertions fail closed', () => {
  throws(() => transcriptChanges({ messages: [] }, { messages: [message('a'), message('a')] }), /duplicate/);
  throws(() => transcriptChanges({ messages: [message('a'), message('b')] }, { messages: [message('b'), message('a')] }), /reordering/);
  throws(() => transcriptChanges({ messages: [message('a')] }, { messages: [message('b'), message('a')] }), /Insertion/);
});
