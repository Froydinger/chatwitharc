import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./appBuilderIntent.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleFixture = { exports: {} };
new Function('exports', 'module', compiled)(moduleFixture.exports, moduleFixture);
const { getAppBuilderIntent, resolveAppBuilderProject } = moduleFixture.exports;

test('keeps existing app creation, edit, and how-to routing', () => {
  assert.equal(getAppBuilderIntent('How do I build an app?'), null);
  assert.deepEqual(getAppBuilderIntent('Create a shopping list app'), {
    action: 'create', prompt: 'Create a shopping list app',
  });
  assert.deepEqual(getAppBuilderIntent('/app Build an expense tracker'), {
    action: 'create', prompt: 'Build an expense tracker',
  });
  assert.deepEqual(getAppBuilderIntent('Update my website header'), {
    action: 'edit', prompt: 'Update my website header',
  });
  assert.deepEqual(getAppBuilderIntent('edit my notes app'), {
    action: 'edit', prompt: 'edit my notes app',
  });
  assert.deepEqual(getAppBuilderIntent('Make it easier to read', true), {
    action: 'edit', prompt: 'Make it easier to read',
  });
});

const projects = [
  { id: 'white-notes', title: 'Notes Journal', prompt: 'A white, bright note taking app with a pen icon.', favicon_label: 'Idea' },
  { id: 'dark-notes', title: 'Notes Archive', prompt: 'A dark notebook for saving notes.', favicon_label: 'Book' },
  { id: 'tasks', title: 'Task Board', prompt: 'A simple project tracking board.', favicon_label: 'Layout' },
];

test('opens the uniquely matching saved app from a new chat', () => {
  const result = resolveAppBuilderProject('edit my notes app', [projects[0], projects[2]]);
  assert.equal(result.kind, 'open');
  assert.equal(result.project.id, 'white-notes');
});

test('asks the user when multiple saved apps match the same app name', () => {
  const result = resolveAppBuilderProject('edit my notes app', projects);
  assert.equal(result.kind, 'choose');
  assert.deepEqual(result.projects.map((project) => project.id), ['white-notes', 'dark-notes']);
});

test('uses a visual clue to disambiguate matching app names', () => {
  const result = resolveAppBuilderProject('edit my white notes app', projects);
  assert.equal(result.kind, 'open');
  assert.equal(result.project.id, 'white-notes');
});

test('asks for a choice when the user gives no distinguishing app details', () => {
  const result = resolveAppBuilderProject('edit my app', projects);
  assert.equal(result.kind, 'choose');
  assert.equal(result.projects.length, 3);
});

test('does not create or select a project when no saved app exists', () => {
  assert.deepEqual(resolveAppBuilderProject('edit my notes app', []), { kind: 'not-found' });
});

test('opens the only saved app when its context is unambiguous by count', () => {
  const result = resolveAppBuilderProject('edit my app', [projects[2]]);
  assert.equal(result.kind, 'open');
  assert.equal(result.project.id, 'tasks');
});
