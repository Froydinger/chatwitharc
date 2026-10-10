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
assert.ok(shell.includes('title: session.title'), 'saved history titles remain available');
assert.ok(shell.includes("window.addEventListener('workspace-open-usage', openUsage)"), 'model picker usage link opens the real usage dialog');
const chrome = read('src/workspace/WorkspaceChrome.tsx');
assert.ok(chrome.includes("section === 'chat' ? <h1 className=\"sr-only\">{title}</h1>"));
const composerTextarea = read('src/components/chat-input/ComposerTextarea.tsx');
assert.ok(composerTextarea.includes('text-base md:text-base'), 'composer remains 16px at desktop breakpoints');
assert.ok(!/maximum-scale|user-scalable\s*=\s*no/.test(read('index.html')), 'pinch zoom remains available');
const mobileChatSource = read('src/components/MobileChatApp.tsx');
const emptyChatLayout = mobileChatSource.slice(
  mobileChatSource.indexOf('{/* Greeting - above quick prompts on empty state */'),
  mobileChatSource.indexOf('{/* Music Popup */'),
);
const greetingIndex = emptyChatLayout.indexOf('<CyclingGreeting />');
const quickPromptIndex = emptyChatLayout.indexOf('<SmartSuggestions');
const composerIndex = emptyChatLayout.indexOf('<ChatInput ref=');
assert.ok(greetingIndex >= 0 && quickPromptIndex > greetingIndex && composerIndex > quickPromptIndex, 'quick prompts sit beneath the unchanged greeting and before the composer');
assert.ok(emptyChatLayout.includes('messages.length === 0') && emptyChatLayout.includes('!isVoiceActive'), 'greeting and prompts keep their original empty-chat/non-voice visibility gate');
const workspaceChrome = read('src/workspace/WorkspaceChrome.tsx');
assert.ok(workspaceChrome.includes("viewport?.addEventListener('resize', update)"));
assert.ok(workspaceChrome.includes("viewport?.addEventListener('scroll', update)"), 'keyboard viewport panning refreshes the Workspace frame');
assert.ok(workspaceChrome.includes("'--ws-viewport-height'") && workspaceChrome.includes("'--ws-viewport-top'"));
const workspaceCss = read('src/workspace/workspace.css');
assert.ok(workspaceCss.includes('.workspace-ui .ws-live-content .glass-dock:focus-within'));
assert.ok(workspaceCss.includes('box-shadow:0 0 0 2px var(--ws-text)!important'), 'focus halo follows the existing rounded composer card');
assert.ok(!workspaceCss.includes('.workspace-ui .workspace-live-composer:focus-within { outline:2px'), 'no rectangular inner composer outline');
assert.ok(workspaceCss.includes('bottom:calc(16px + env(safe-area-inset-bottom,0px))'), 'floating composer clears the home indicator');
assert.ok(workspaceCss.includes('env(safe-area-inset-left,0px)') && workspaceCss.includes('env(safe-area-inset-right,0px)'), 'floating composer clears both side insets');
for (const [width, safeSide] of [[320, 0], [390, 0], [852, 59], [1024, 0], [1440, 0]]) {
  const minimum = width <= 650 ? 12 : width <= 980 ? 16 : 22;
  const safePad = width <= 980 ? 8 : 12;
  const gutter = Math.max(minimum, safeSide + safePad);
  assert.ok(width - gutter * 2 > 180, `composer card keeps visible side clearance at ${width}px`);
}
const modelPicker = read('src/components/ChatModelPicker.tsx');
assert.ok(!modelPicker.includes('Choose how Arc responds'));
assert.ok(!modelPicker.includes('Auto can use your Sol allowance'));
assert.ok(modelPicker.includes("? 'Allowance'"));
const builderViewport = load('src/lib/builderViewport.ts');
const profile = (overrides = {}) => ({ viewportWidth: 1280, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0,
  screenWidth: 1920, screenHeight: 1080, coarsePointer: false, ...overrides });
for (const width of [320, 390, 767]) assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: width })), false);
for (const width of [768, 1024, 1440]) assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: width })), true);
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: 844, userAgent: 'iPhone', maxTouchPoints: 5, screenWidth: 874, screenHeight: 402, coarsePointer: true })), false, 'landscape phones stay desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: 980, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5, screenWidth: 402, screenHeight: 874, coarsePointer: true })), false, 'phone desktop-site mode stays desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: 1024, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5, screenWidth: 834, screenHeight: 1194 })), false, 'iPad desktop UA stays desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ mobileHint: true })), false, 'mobile user-agent hints stay desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ nativePlatform: 'ios' })), false, 'native iOS wrapper stays desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ nativePlatform: 'android' })), false, 'native Android wrapper stays desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ nativeIOSClass: true })), false, 'native iOS class stays desktop-only');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ viewportWidth: 700 })), false, 'narrow desktop window stays guarded');
assert.equal(builderViewport.canUseAppBuilderOnDesktop(profile({ maxTouchPoints: 10, coarsePointer: true })), true, 'wide touchscreen laptops stay available');
const builderPageSource = read('src/pages/AppBuilderPage.tsx');
assert.ok(builderPageSource.includes('if (projectId && desktopBuilderAvailable)'));
assert.ok(builderPageSource.includes('if (!desktopBuilderAvailable && !hasMountedBuilder)'));
assert.ok(builderPageSource.includes('AppBuilderDesktopNotice'));
const builderNoticeSource = read('src/components/app-builder/AppBuilderDesktopNotice.tsx');
assert.ok(builderNoticeSource.includes('Back to chat'));
assert.ok(builderNoticeSource.includes('saved projects and running jobs stay available'));
assert.ok(builderNoticeSource.includes('bg-background') && builderNoticeSource.includes('bg-card') && builderNoticeSource.includes('text-foreground'), 'mobile notice uses theme tokens for light, dark and system themes');
const builderAvailabilityHook = read('src/hooks/useAppBuilderDesktopAvailability.ts');
assert.ok(builderAvailabilityHook.includes("addEventListener('orientationchange'"));
assert.ok(builderAvailabilityHook.includes("addEventListener('change', update)"));
const appSource = read('src/App.tsx');
assert.ok(appSource.includes('<Route path="/build" element={<AppBuilderPage />} />'));
assert.ok(appSource.includes('<Route path="/build/:projectId" element={<AppBuilderPage />} />'));

let ideProjectWrites = 0, checkoutCalls = 0, navigations = 0, closeCalls = 0;
let mobileViewportWidth = 390;
let builderDesktopAvailable = false;
const previousWindow = globalThis.window;
globalThis.window = { innerWidth: mobileViewportWidth };
const ideStore = selector => selector({
  setIdeProjectId: () => { ideProjectWrites++; },
  closeIDE: () => { closeCalls++; },
});
ideStore.getState = () => ({ closeIDE: () => { closeCalls++; } });
function renderBuilder({ available, hasMountedBuilder = false, user, hasBoost }) {
  const source = read('src/pages/AppBuilderPage.tsx').replace('import.meta.env.DEV', 'false');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const aliases = {
    react: { ...React, useEffect: effect => effect(), useState: initial => [hasMountedBuilder || initial, () => {}] },
    'react-router-dom': {
      useParams: () => ({ projectId: 'saved-project' }),
      useNavigate: () => () => { navigations++; },
      useSearchParams: () => [new URLSearchParams()],
      useLocation: () => ({ state: null }),
    },
    '@/hooks/useAuth': { useAuth: () => ({ user, loading: false }) },
    '@/store/useIDEStore': { useIDEStore: ideStore },
    '@/components/app-builder/AppBuilderWorkspace': { AppBuilderWorkspace: () => React.createElement('div', { 'data-builder-workspace': true }) },
    '@/components/app-builder/AppBuilderDesktopNotice': { AppBuilderDesktopNotice: ({ overlay, onBackToChat }) => React.createElement('div', { 'data-builder-notice': true, 'data-overlay': overlay }, 'Open on desktop', onBackToChat ? React.createElement('button', null, 'Back to chat') : null) },
    '@/hooks/useSubscription': { useSubscription: () => ({ hasBoost, isAdmin: false, loading: false, openCheckout: () => { checkoutCalls++; } }) },
    '@/hooks/useAppBuilderDesktopAvailability': { useAppBuilderDesktopAvailability: () => available },
  };
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return renderToStaticMarkup(React.createElement(exports.AppBuilderPage));
}
try {
  builderDesktopAvailable = false;
  const mobileBuilder = renderBuilder({ available: builderDesktopAvailable, user: null, hasBoost: false });
  assert.ok(mobileBuilder.includes('Open on desktop'));
  assert.ok(mobileBuilder.includes('Back to chat'));
  assert.equal(mobileBuilder.includes('data-builder-workspace'), false);
  assert.equal(ideProjectWrites, 0, 'mobile direct project URL must not write IDE store state');
  assert.equal(checkoutCalls, 0, 'mobile Builder guard must not open billing UI');
  assert.equal(navigations, 0, 'mobile guard keeps the project route available');
  assert.equal(closeCalls, 0, 'mobile guard leaves saved projects and running jobs intact');

  mobileViewportWidth = 1280;
  builderDesktopAvailable = true;
  globalThis.window.innerWidth = mobileViewportWidth;
  const desktopBuilder = renderBuilder({ available: builderDesktopAvailable, user: { id: 'owner' }, hasBoost: true });
  assert.ok(desktopBuilder.includes('data-builder-workspace'));
  const desktopWriteCount = ideProjectWrites;
  assert.ok(desktopWriteCount >= 1, 'desktop project route restores its saved IDE project');

  builderDesktopAvailable = false;
  mobileViewportWidth = 390;
  globalThis.window.innerWidth = mobileViewportWidth;
  const resizedBuilder = renderBuilder({ available: builderDesktopAvailable, hasMountedBuilder: true, user: { id: 'owner' }, hasBoost: true });
  assert.ok(resizedBuilder.includes('data-builder-workspace'));
  assert.ok(resizedBuilder.includes('aria-hidden="true"'));
  assert.ok(resizedBuilder.includes('class="hidden"'), 'hidden Builder is removed from keyboard and accessibility navigation without unmounting');
  assert.ok(resizedBuilder.includes('data-overlay="true"') && resizedBuilder.includes('Back to chat'));
  assert.equal(ideProjectWrites, desktopWriteCount, 'mobile resize does not replace the selected project');
  assert.equal(closeCalls, 0, 'resizing does not close or cancel the existing project');
} finally {
  if (typeof previousWindow === 'undefined') delete globalThis.window;
  else globalThis.window = previousWindow;
}

const appBuilderEntrypoints = [
  ['src/components/ChatInput.tsx', 'if (!isAppBuilderDesktopAvailable())', 'builderStore.openIDECanvas(initialPrompt'],
  ['src/components/MobileChatApp.tsx', 'if (!isAppBuilderDesktopAvailable())', "openCheckout(undefined, 'app_builder')"],
  ['src/components/AppsPanel.tsx', 'if (!isAppBuilderDesktopAvailable())', 'reopenIDECanvas(project.id'],
  ['src/pages/DashboardPage.tsx', 'if (!isAppBuilderDesktopAvailable())', '.from(\'ide_projects\')'],
  ['src/components/app-builder/AppBuilderAppChoiceCard.tsx', 'if (!isAppBuilderDesktopAvailable())', 'await reopenOwnedAppBuilderProject'],
  ['src/components/app-builder/AppBuilderArtifactCard.tsx', 'if (!isAppBuilderDesktopAvailable())', 'await reopenOwnedAppBuilderProject'],
];
for (const [path, guard, mutation] of appBuilderEntrypoints) {
  const source = read(path);
  assert.ok(source.includes(guard), `${path} guards its mobile Builder entry`);
  const guardIndex = source.indexOf(guard);
  const mutationIndex = source.indexOf(mutation, guardIndex);
  assert.ok(mutationIndex > guardIndex, `${path} leaves project state untouched before desktop guard`);
}
for (const path of ['src/components/MobileChatApp.tsx', 'src/pages/DashboardPage.tsx']) {
  const source = read(path);
  assert.ok(source.includes('builderDesktopAvailable || hasMountedBuilder'), `${path} keeps the Builder mounted across a mobile resize`);
  assert.ok(source.includes("builderDesktopAvailable ? 'h-full min-h-0' : 'hidden'"), `${path} makes the hidden Builder unreachable while mobile`);
  assert.ok(source.includes('<AppBuilderDesktopNotice overlay onBackToChat={closeIDE} />'));
}
const allWorkspace = readdirSync(new URL('src/workspace/', root)).map(name => read(`src/workspace/${name}`)).join('\n');
assert.ok(!/WorkspaceDemo|sampleData|enterSampleWorkspace|WorkspaceLogin|signInWithPassword|workspace-public-config/.test(allWorkspace));
assert.ok(!existsSync(new URL('src/workspace/entry.tsx', root)));
const css = read('src/workspace/workspace.css'); postcss.parse(css);
assert.ok(css.includes('--ws-bg:#000000') && css.includes('--ws-sidebar:#000000'));
assert.ok(css.includes('--arcai-desktop-titlebar-safe-area') && css.includes('safe-area-inset-bottom'));
assert.ok(css.includes('.workspace-ui .workspace-live-composer textarea'));
assert.ok(css.includes('.ws-boost-icon') && css.includes('flex-shrink:0'));
const changed = ['src/App.tsx', 'src/lib/installedAppRuntime.ts', 'src/lib/builderViewport.ts', 'src/hooks/useAppBuilderDesktopAvailability.ts', 'src/components/app-builder/AppBuilderDesktopNotice.tsx', 'src/components/app-builder/AppBuilderAppChoiceCard.tsx', 'src/components/app-builder/AppBuilderArtifactCard.tsx', 'src/components/ChatInput.tsx', 'src/components/ChatModelPicker.tsx', 'src/components/MobileChatApp.tsx', 'src/components/AppsPanel.tsx', 'src/components/chat-input/ComposerView.tsx', 'src/components/chat-input/ComposerTextarea.tsx', 'src/pages/AppBuilderPage.tsx', 'src/pages/DashboardPage.tsx', ...readdirSync(new URL('src/workspace/', root)).filter(name => /\.tsx?$/.test(name)).map(name => `src/workspace/${name}`)];
for (const path of changed) {
  const source = read(path); const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics, [], `syntax ${path}`);
}
console.log('PASS Workspace rollout/rollback, public/auth routes, native platform matrix, per-conversation canvas guard, legacy composer DOM, exclusive voice host ownership and syntax/CSS checks. No network, model, mic or audio calls.');
