import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('./useTheme.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ remote = 'dark', failedRead = false, failedWrite = false } = {}) {
  const effects = [], listeners = new Set(), cache = new Map(), writes = [];
  let state;
  const setThemeMode = themeMode => { const before = state; state = { ...state, themeMode }; for (const f of listeners) f(state, before); };
  state = { themeMode: 'light', setThemeMode };
  const store = selector => selector(state);
  store.subscribe = f => { listeners.add(f); return () => listeners.delete(f); };
  const options = { remote, failedRead, failedWrite };
  const supabase = { from() { let saving; return {
    update(value) { saving = value.theme_preference; return this; }, select() { return this; }, eq() { return this; },
    async maybeSingle() {
      if (saving) { writes.push(saving); if (options.failedWrite) return { error: true }; options.remote = saving; return { data: { user_id: 'owner' } }; }
      return options.failedRead ? { error: true } : { data: { theme_preference: options.remote } };
    },
  }; } };
  globalThis.localStorage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) };
  globalThis.window = Object.assign(new EventTarget(), { setInterval: () => 1, clearInterval() {} });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const imports = {
    react: { useEffect: f => effects.push(f) },
    '@/store/useAccentStore': { useAccentStore: store },
    '@/hooks/useAuth': { useAuth: () => ({ user: { id: 'owner' }, loading: false, isAnonymous: false }) },
    '@/integrations/supabase/client': { supabase },
    'react-router-dom': { useLocation: () => ({ pathname: '/chat' }) },
    '@/store/useIDEStore': { useIDEStore: () => false },
  };
  const exports = {}; new Function('require', 'exports', js)(name => imports[name], exports);
  exports.useTheme(); const cleanup = effects[0]();
  return { options, writes, cache, setThemeMode, state: () => state, cleanup };
}
test('profile hydration and device focus restore the account theme without writing stale local state', async () => {
  const h = setup(); await tick(); assert.equal(h.state().themeMode, 'dark'); assert.deepEqual(h.writes, []);
  h.options.remote = 'system'; window.dispatchEvent(new Event('focus')); await tick();
  assert.equal(h.state().themeMode, 'system'); assert.deepEqual(h.writes, []); h.cleanup();
});
test('failed loading preserves selection; failed saving persists and retries on reconnect', async () => {
  const h = setup({ failedRead: true, failedWrite: true }); await tick(); assert.equal(h.state().themeMode, 'light');
  h.setThemeMode('dark'); await tick(); assert.equal(h.cache.get('arc-theme-pending:owner'), 'dark');
  h.options.failedWrite = false; h.options.failedRead = false;
  window.dispatchEvent(new Event('online')); await tick();
  assert.equal(h.options.remote, 'dark'); assert.equal(h.cache.has('arc-theme-pending:owner'), false); h.cleanup();
});
test('rapid selection changes serialize and preserve the final preference', async () => {
  const h = setup(); await tick(); h.setThemeMode('light'); h.setThemeMode('system'); await tick();
  assert.deepEqual(h.writes, ['light', 'system']); assert.equal(h.options.remote, 'system'); h.cleanup();
});
