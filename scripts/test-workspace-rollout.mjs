import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function load(path, aliases = {}) {
  const source = read(path).replace('import.meta.env?.VITE_WORKSPACE_UI_ENABLED', 'undefined');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return exports;
}
const rollout = load('src/workspace/rollout.ts');
const native = load('src/lib/installedAppRuntime.ts');
const canvas = load('src/workspace/conversationCanvas.ts');
const user = { enabled: true, pathname: '/', userId: 'owner', isAnonymous: false, authLoading: false, needsOnboarding: false, nativeIOS: false };
assert.equal(rollout.WORKSPACE_UI_ENABLED, true);
assert.equal(rollout.isWorkspaceFlagEnabled('false'), false);
assert.equal(rollout.isWorkspaceFlagEnabled('true'), true);
for (const path of ['/', '/chat/one', '/dashboard', '/dashboard/settings', '/tasks', '/shared', '/shared/team', '/build', '/build/app']) {
  assert.equal(rollout.shouldUseWorkspace({ ...user, pathname: path }), true, path);
  assert.equal(rollout.shouldUseWorkspace({ ...user, pathname: path, enabled: false }), false, `rollback ${path}`);
  assert.equal(rollout.shouldUseWorkspace({ ...user, pathname: path, nativeIOS: true }), false, `native iOS ${path}`);
}
for (const path of ['/welcome', '/pricing', '/docs', '/downloads', '/blog', '/blog/post', '/share/chat', '/upgrade', '/checkout/return', '/auth/callback', '/auth/reset-password', '/desktop-auth-callback', '/terms', '/privacy', '/voice-lab', '/admin', '/missing', '/chat/a/b']) {
  assert.equal(rollout.shouldUseWorkspace({ ...user, pathname: path }), false, `public/original ${path}`);
}
for (const overrides of [{ userId: null }, { isAnonymous: true }, { authLoading: true }, { needsOnboarding: true }]) {
  assert.equal(rollout.shouldUseWorkspace({ ...user, ...overrides }), false);
}
// Native-only evidence. iPhone/iPad Safari and installed PWA are intentionally web.
const signal = { native: false, userAgent: 'Mozilla iPhone', iosClass: false };
assert.equal(native.matchesNativeIOSApp(signal), false);
assert.equal(native.matchesNativeIOSApp({ ...signal, userAgent: 'Mozilla iPad' }), false);
assert.equal(native.matchesNativeIOSApp({ ...signal, native: true, platform: 'ios' }), true);
assert.equal(native.matchesNativeIOSApp({ ...signal, iosClass: true }), true);
assert.equal(native.matchesNativeIOSApp({ ...signal, native: true }), true);
assert.equal(native.matchesNativeIOSApp({ ...signal, native: true, platform: 'android', userAgent: 'Android' }), false);
assert.equal(native.matchesNativeIOSApp({ ...signal, userAgent: 'Electron Macintosh' }), false);
assert.equal(native.matchesNativeIOSApp({ ...signal, native: true, userAgent: 'Macintosh', maxTouchPoints: 5 }), true);
assert.equal(native.matchesNativeIOSApp({ ...signal, userAgent: 'Macintosh', maxTouchPoints: 5 }), false);
assert.equal(native.matchesInstalledApp({ userAgent: 'Electron', standalone: false, native: false, desktopShell: false, androidSource: null }), true);
assert.equal(native.matchesInstalledApp({ userAgent: 'iPhone', standalone: true, native: false, desktopShell: false, androidSource: null }), true);
// Canvas ownership and empty/new/switch/close/reopen evidence has no global fallback.
assert.equal(canvas.getConversationCanvas(null), null);
assert.equal(canvas.getConversationCanvas({ messages: [{ type: 'text' }] }), null);
const writing = { canvasContent: 'edited current writing', messages: [{ type: 'canvas', canvasContent: 'old writing' }] };
assert.deepEqual(canvas.getConversationCanvas(writing), { content: 'edited current writing', type: 'writing' });
assert.deepEqual(canvas.getConversationCanvas({ messages: [{ type: 'code', codeContent: 'const x = 1;', codeLanguage: 'javascript' }] }), { content: 'const x = 1;', type: 'code', language: 'javascript' });
assert.equal(canvas.isCurrentConversationRoute('/chat/new', 'old'), false);
assert.equal(canvas.isCurrentConversationRoute('/chat/current', 'current'), true);
assert.equal(canvas.isCurrentConversationRoute('/chat/encoded%20id', 'encoded id'), true);
assert.equal(canvas.isCurrentConversationRoute('/chat/%broken', 'anything'), false);
assert.equal(canvas.isCurrentConversationRoute('/dashboard', 'current'), false);
assert.equal(canvas.isCurrentConversationRoute('/', null), true);
const util = { cn: (...values) => values.filter(Boolean).join(' ') };
const { ComposerView } = load('src/components/chat-input/ComposerView.tsx', { '@/lib/utils': util });
const props = { inputBarRef: { current: null }, active: true, voiceActive: false, onFocusRequest() {}, menu: React.createElement('button', null, 'menu'), field: React.createElement('textarea', { 'aria-label': 'Prompt' }), actions: React.createElement('button', null, 'send') };
const legacy = renderToStaticMarkup(React.createElement(ComposerView, props));
const workspace = renderToStaticMarkup(React.createElement(ComposerView, { ...props, footer: React.createElement('span', null, 'model and mode') }));
assert.ok(!legacy.includes('workspace-live-composer') && !legacy.includes('ws-live-composer-top'));
assert.ok(legacy.includes('flex items-end gap-2 relative'));
assert.ok(workspace.includes('ws-live-composer-top') && workspace.includes('ws-live-composer-bottom'));
const hidden = renderToStaticMarkup(React.createElement(ComposerView, { ...props, voiceActive: true }));
assert.ok(hidden.includes('aria-hidden="true"') && hidden.includes('pointer-events-none'));
const baseline = process.env.WORKSPACE_BASELINE_DIR;
if (baseline) {
  const old = readFileSync(`${baseline}/src/components/chat-input/ComposerView.tsx`, 'utf8');
  const compiled = ts.transpileModule(old, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; new Function('exports', 'require', compiled)(exports, name => name === '@/lib/utils' ? util : require(name));
  assert.equal(legacy, renderToStaticMarkup(React.createElement(exports.ComposerView, props)), 'legacy DOM exact match');
  const oldApp = readFileSync(`${baseline}/src/App.tsx`, 'utf8');
  const newApp = read('src/App.tsx');
  assert.deepEqual(newApp.match(/<Route\s[^>]*\/>/g), oldApp.match(/<Route\s[^>]*\/>/g), 'all Route declarations unchanged');
  assert.equal(newApp.slice(newApp.indexOf('const RootGate'), newApp.indexOf('const DashboardShellGate')), oldApp.slice(oldApp.indexOf('const RootGate'), oldApp.indexOf('const DashboardShellGate')), 'auth and landing gate exact match');
  const oldMobile = readFileSync(`${baseline}/src/components/MobileChatApp.tsx`, 'utf8');
  const newMobile = read('src/components/MobileChatApp.tsx');
  const voiceMounts = source => source.slice(source.indexOf('      {/* Voice Mode Overlay */}'), source.indexOf('      <Dialog open={isWorkHandoffOpen}'));
  assert.equal(voiceMounts(newMobile), voiceMounts(oldMobile).replace('<VoiceModeOverlay />', '{!workspaceVoiceHost && <VoiceModeOverlay />}').replace('<VoiceModeController />', '{!workspaceVoiceHost && <VoiceModeController />}'), 'native/legacy mounts retained behind exclusive host ownership');
  for (const name of ['handleNewChat', 'requestWorkMode', 'persistCanvasBeforeLeaving']) {
    const extract = source => {
      const ast = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let result;
      function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.getText(ast); ts.forEachChild(node, visit); }
      visit(ast); return result;
    };
    assert.ok(extract(oldMobile)); assert.equal(extract(newMobile), extract(oldMobile), `${name} unchanged`);
  }
}
const boundary = read('src/workspace/WorkspaceBoundary.tsx');
assert.ok(!/key=|matchMedia|innerWidth|hasBoost|useVoice/.test(boundary.replace('key={user.id}', '')), 'only authenticated account changes may remount the voice host');
assert.ok(boundary.includes('key={user.id}'));
const shell = read('src/workspace/WorkspaceShell.tsx');
assert.ok(shell.includes('isCurrentConversationRoute(location.pathname, currentId)'));
assert.ok(shell.includes('canvas.hydrateFromSession(conversationCanvas.content'));
assert.ok(!shell.includes('openWithContent('));
const allWorkspace = readdirSync(new URL('src/workspace/', root)).map(name => read(`src/workspace/${name}`)).join('\n');
assert.ok(!/WorkspaceDemo|sampleData|enterSampleWorkspace|WorkspaceLogin|signInWithPassword|workspace-public-config/.test(allWorkspace));
assert.ok(!existsSync(new URL('src/workspace/entry.tsx', root)));
const css = read('src/workspace/workspace.css'); postcss.parse(css);
assert.ok(css.includes('--ws-bg:#000000') && css.includes('--ws-sidebar:#000000'));
assert.ok(css.includes('--arcai-desktop-titlebar-safe-area') && css.includes('safe-area-inset-bottom'));
assert.ok(css.includes('.workspace-ui .workspace-live-composer textarea'));
assert.ok(css.includes('.ws-boost-icon') && css.includes('flex-shrink:0'));
const changed = ['src/App.tsx', 'src/lib/installedAppRuntime.ts', 'src/components/ChatInput.tsx', 'src/components/ChatModelPicker.tsx', 'src/components/MobileChatApp.tsx', 'src/components/chat-input/ComposerView.tsx', ...readdirSync(new URL('src/workspace/', root)).filter(name => /\.tsx?$/.test(name)).map(name => `src/workspace/${name}`)];
for (const path of changed) {
  const source = read(path); const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics, [], `syntax ${path}`);
}
console.log('PASS Workspace rollout/rollback, public/auth routes, native platform matrix, per-conversation canvas guard, legacy composer DOM, exclusive voice host ownership and syntax/CSS checks. No network, model, mic or audio calls.');
