import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*(\/\/ ARC_CHUNK_RECOVERY:[\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'test must execute the real pre-entrypoint recovery code');
const chunk = new Error('Failed to fetch dynamically imported module: /assets/old.js');
const NOW = 1_800_000_000_000;

function browser({ session = new Map(), blockedStorage = false, href = 'https://askarc.chat/dashboard?tab=apps&keep=yes#saved', throwsNavigation = false } = {}) {
  const events = new Map();
  const screens = [];
  const navigations = [];
  const timers = [];
  const local = new Map([['arc-chats', 'saved chat'], ['themeMode', 'light'], ['sb-auth', 'session'], ['draft', 'unsent']]);
  const root = Object.freeze({ untouched: true });
  const sessionStorage = {
    getItem(key) { if (blockedStorage) throw new Error('SecurityError'); return session.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw new Error('QuotaExceededError'); session.set(key, value); },
    clear() { throw new Error('recovery must not clear session storage'); },
    removeItem() { throw new Error('recovery must not remove guards'); },
  };
  const localStorage = {
    getItem: key => local.get(key),
    setItem() { throw new Error('recovery must not modify local storage'); },
    clear() { throw new Error('recovery must not clear local storage'); },
  };
  const document = {
    body: { appendChild(node) { screens.push(node); } },
    getElementById(id) { return id === 'root' ? root : screens.find(screen => screen.id === id); },
    createElement() {
      const button = { events: {}, focused: false, addEventListener(name, fn) { this.events[name] = fn; }, focus() { this.focused = true; } };
      return { style: {}, button, setAttribute() {}, addEventListener() {}, querySelector() { return button; } };
    },
  };
  const window = {
    location: {
      href,
      replace(url) { if (throwsNavigation) throw new Error('navigation blocked'); navigations.push(url); },
      reload() { navigations.push(href); },
    },
    setTimeout(fn) { timers.push(fn); },
    addEventListener(name, fn) { events.set(name, fn); },
  };
  vm.runInNewContext(script, { window, document, sessionStorage, localStorage, URL, Date: { now: () => NOW } });
  return { window, document, session, local, sessionStorage, localStorage, events, screens, navigations, timers };
}

// Duplicate reports within one page issue only one navigation, with all URL state intact.
const first = browser();
assert.equal(first.window.__recoverArcChunk(chunk), true);
first.events.get('error')({ error: chunk });
first.events.get('unhandledrejection')({ reason: chunk, preventDefault() {} });
assert.equal(first.navigations.length, 1);
const target = new URL(first.navigations[0]);
assert.equal(target.pathname, '/dashboard');
assert.equal(target.searchParams.get('tab'), 'apps');
assert.equal(target.searchParams.get('keep'), 'yes');
assert.equal(target.hash, '#saved');
assert.equal(target.searchParams.get('arc_refresh'), String(NOW));
assert.equal(first.session.get('arc_chunk_recovery'), String(NOW));
assert.equal(first.screens.length, 0);

// A second document observes the same budget. Successful imports cannot erase it.
const second = browser({ session: first.session, href: target.toString() });
second.window.__recoverArcChunk(chunk);
second.window.__recoverArcChunk(chunk);
assert.equal(second.navigations.length, 0);
assert.equal(second.screens.length, 1);
assert.equal(second.document.getElementById('root').untouched, true);
assert.equal(second.screens[0].button.focused, true);
second.screens[0].button.events.click();
assert.equal(second.navigations.length, 1, 'manual retry remains available');
assert.equal(new URL(second.navigations[0]).searchParams.get('tab'), 'apps');
assert.equal(second.session.get('arc_chunk_recovery'), String(NOW));

// Old deployment guard and URL guard also block repeat reloads.
for (const options of [
  { session: new Map([['arc:chunk-reload-ts', String(NOW)]]) },
  { href: `https://askarc.chat/dashboard?arc_refresh=${NOW}` },
  { blockedStorage: true },
  { throwsNavigation: true },
]) {
  const state = browser(options);
  assert.doesNotThrow(() => state.window.__recoverArcChunk(chunk));
  assert.equal(state.navigations.length, 0);
  assert.equal(state.screens.length, 1);
}

// An expired budget permits a later retry, without clearing any stored content.
const expired = browser({ session: new Map([['arc_chunk_recovery', String(NOW - 60001)], ['draft', 'keep']]) });
expired.window.__recoverArcChunk(chunk);
assert.equal(expired.navigations.length, 1);
assert.equal(expired.session.get('draft'), 'keep');
assert.equal(expired.local.get('arc-chats'), 'saved chat');

// Navigation may silently do nothing in a host; leave a usable screen after timeout.
first.timers[0]();
assert.equal(first.screens.length, 1);
assert.equal(first.document.getElementById('root').untouched, true);

// Unrelated errors are not swallowed or incorrectly labeled as deployment failures.
const unrelated = browser();
assert.equal(unrelated.window.__recoverArcChunk(new ReferenceError("Can't find variable: useCallback")), false);
let prevented = false;
unrelated.events.get('vite:preloadError')({ payload: new Error('ordinary render error'), preventDefault() { prevented = true; } });
unrelated.events.get('unhandledrejection')({ reason: new Error('ordinary error'), preventDefault() { prevented = true; } });
assert.equal(prevented, false);
assert.equal(unrelated.navigations.length, 0);
assert.equal(unrelated.screens.length, 0);
unrelated.events.get('vite:preloadError')({ payload: chunk, preventDefault() { prevented = true; } });
assert.equal(prevented, false, 'Vite must reject rather than fulfill a broken lazy import');
assert.equal(unrelated.navigations.length, 1);

// Execute the actual boundary class, including its real refresh button handler.
const boundarySource = readFileSync(new URL('../src/components/ErrorBoundary.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(boundarySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const environment = browser();
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require, window: environment.window, localStorage: environment.localStorage, sessionStorage: environment.sessionStorage, console: { error() {} } });
const { ErrorBoundary } = module.exports;
const child = require('react').createElement('div', null, 'failed child');
const boundary = new ErrorBoundary({ children: child });
boundary.state = ErrorBoundary.getDerivedStateFromError(chunk);
boundary.setState = () => { throw new Error('must not retry a cached failed child'); };
boundary.componentDidCatch(chunk, { componentStack: 'Dashboard' });
assert.equal(boundary.state.hasError, true);
assert.notEqual(boundary.render(), child);
function findButton(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'button') return node;
  for (const value of [node.props?.children].flat(Infinity)) {
    const result = findButton(value);
    if (result) return result;
  }
}
const before = [...environment.local];
findButton(boundary.render()).props.onClick();
assert.deepEqual([...environment.local], before);
assert.equal(environment.navigations.length, 2);
environment.window.__recoverArcChunk = () => { throw new Error('handler failure'); };
assert.doesNotThrow(() => boundary.componentDidCatch(chunk, { componentStack: '' }));
assert.equal(boundary.state.hasError, true);

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(app, /lazyWithChunkRetry|CHUNK_RELOAD_KEY|new Promise<never>/, 'routes must not implement an independent reload loop');
console.log('Chunk recovery tests passed: reload budget, duplicate events, storage failures, safe fallback, URL preservation, failed-child containment, and refresh data preservation.');
