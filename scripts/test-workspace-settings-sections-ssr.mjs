import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
let actionCalls = null;
const action = (...args) => {
  if (actionCalls) { actionCalls.push(args); return Promise.resolve({ error: null }); }
  throw new Error('Settings SSR must never execute account, network, storage, notification, billing, or voice actions.');
};
let eventCaptures = [];
const jsxRuntime = require('react/jsx-runtime');
let fixture;
let stateCalls;
const store = key => Object.assign(selector => selector ? selector(fixture[key]) : fixture[key], { getState: () => fixture[key] });
const accentStore = store('accent');
const staticSourceFiles = new Set();
function sourceLiteral(filename, name) {
  const source = ts.createSourceFile(filename, readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .find(item => item.name.getText(source) === name);
  assert.ok(declaration?.initializer, `${filename}: ${name} is a source constant`);
  staticSourceFiles.add(filename);
  const compiled = ts.transpileModule(`exports.value = ${declaration.initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', compiled)(exports);
  return exports.value;
}
const actualFonts = sourceLiteral('src/hooks/useCustomFont.tsx', 'AVAILABLE_FONTS');
const actualAspects = sourceLiteral('src/store/useImageGenStore.ts', 'IMAGE_ASPECT_OPTIONS');
const actualVoiceIds = sourceLiteral('src/store/useVoiceModeStore.ts', 'REALTIME_SUPPORTED_VOICES');
assert.deepEqual(sourceLiteral('src/components/VoiceSelector.tsx', 'SETTINGS_VOICE_IDS'),
  sourceLiteral('src/components/VoiceMagneticPicker.tsx', 'voiceIds'), 'Workspace and legacy voice choices keep identical IDs and ordering');
const baseFixture = () => ({
  section: 'account', states: {}, mobile: false,
  user: { id: 'fixture-owner', email: 'fixture@example.test', app_metadata: { providers: ['email'] } },
  profile: { display_name: 'Fixture Owner', context_info: 'Be direct.', avatar_url: null },
  accent: { themeMode: 'system', accentColor: 'noir', cycleThemeMode: action, setThemeMode: action, setAccentColorLocal: action },
  starfield: { showStarfield: false, setShowStarfield: action },
  arc: { clearAllSessions: action, lastSyncAt: new Date(), createNewSession: action, setRightPanelTab: action },
  subscription: { hasBoost: false, hasVerifiedBoost: false, isVerifiedModelAdmin: false, isAdmin: false, loading: false,
    dailyVoiceSessionsUsed: 1, FREE_DAILY_VOICE_LIMIT: 3, checkSubscription: action, openCheckout: action, openCustomerPortal: action,
    cancelAtPeriodEnd: false, currentPeriodEnd: null },
  images: { remainingCredits: 25, baseRemaining: 25, creditLimit: 30, bonusRemaining: 0, unitCost: 1, usagePercent: 17,
    resetAt: '2026-11-01T00:00:00Z', loading: false, showRefill: true, refillEnabled: true, canRefill: true, refillOffers: [],
    refreshQuota: action, claimRefill: action },
  imageSettings: { aspectRatio: '1:1', setAspectRatio: action },
  push: { supported: true, permission: 'default', subscribed: false, loading: false, availabilityReason: null,
    needsIOSInstall: false, needsMacInstall: false, subscribe: action, unsubscribe: action, sendTest: action },
  local: { enabled: false, setEnabled: action, preferCloud: false, setPreferCloud: action,
    status: 'idle', progress: 0, progressText: '', errorMessage: null, webgpuSupported: true, selectedModelId: '',
    setSelectedModelId: action, setStatus: action, setProgress: action, setError: action, setWebgpuSupported: action, reset: action },
  corporate: { enabled: false, setEnabled: action, memoriesEnabled: false, setMemoriesEnabled: action, memorySnapshot: null, setMemorySnapshot: action },
  voice: { selectedVoice: 'marin', voiceSpeed: 1, setSelectedVoice: action, setVoiceSpeed: action },
  github: { connected: false, providerLogin: 'fixture', repoAccessMode: 'all', allowedRepos: [], repositories: [], loading: false,
    loadStatus: action, connect: action, loadRepositories: action, updateRepoSettings: action, disconnect: action },
  textLoading: false,
  textSnapshot: pool => ({ pool, tier: 'free', enforcementEnabled: true, configured: true, adminUncapped: false,
    daily: { usagePercent: 23, resetsAt: '2026-10-11T00:00:00Z' }, monthly: { usagePercent: 12, resetsAt: '2026-11-01T00:00:00Z' } }),
});

// Services and hooks are explicit read-only fixtures. Named Settings descendants and UI primitives
// are the real source modules. Effects do not run during SSR; unexpected imports fail closed.
const mocks = {
  'react-router-dom': {
    Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
    useNavigate: () => action, useSearchParams: () => [new URLSearchParams(`section=${fixture.section}`), action],
  },
  'sonner': { toast: { success: action, error: action } },
  '@/components/transitions/SequencedTransition': { SequencedTransition: ({ children, className }) => React.createElement('div', { className }, children) },
  '@/components/ui/liquid-metal-overlay': { LiquidMetalOverlay: () => null },
  '@/components/HapticOverlay': { HapticOverlay: () => null },
  '@/lib/haptics': { triggerHaptic: action },
  '@/components/DeleteDataModal': { DeleteDataModal: () => null },
  '@/components/CorporateMemoryConsentModal': { CorporateMemoryConsentModal: () => null },
  '@/components/GitModeDock': { GitHubMark: props => React.createElement('svg', props) },
  '@/store/useAccentStore': { useAccentStore: accentStore },
  '@/store/useStarfieldStore': { useStarfieldStore: store('starfield') },
  '@/hooks/useCustomFont': {
    AVAILABLE_FONTS: actualFonts,
    getStoredCustomFont: () => 'Inter', setStoredCustomFont: action,
  },
  '@/integrations/auth': { getAuthRedirectUrl: () => '/', signInWithGoogle: action, signOutCurrentSession: action },
  '@/hooks/useProfile': { useProfile: () => ({ profile: fixture.profile, updateProfile: action, updating: false, refetch: action }) },
  '@/store/useArcStore': { useArcStore: store('arc') },
  '@/hooks/useAuth': { useAuth: () => ({ user: fixture.user }) },
  '@/integrations/supabase/client': { supabase: { from: action, rpc: action, auth: new Proxy({}, { get: () => action }) }, isSupabaseConfigured: false },
  '@/hooks/use-toast': { useToast: () => ({ toast: action }) },
  '@/lib/uploadAvatar': { uploadAvatar: action },
  '@/hooks/useAdminSettings': { useAdminSettings: () => ({ isAdmin: fixture.subscription.isAdmin }) },
  '@/store/useImageGenStore': { useImageGenStore: store('imageSettings'), IMAGE_MODEL_OPTIONS: [],
    IMAGE_ASPECT_OPTIONS: actualAspects,
    useResolvedImageModel: () => 'gpt-image-2' },
  '@/hooks/useSubscription': { useSubscription: () => fixture.subscription },
  '@/hooks/useImageQuota': { useImageQuota: () => fixture.images },
  '@/hooks/useTextUsage': { useTextUsage: pool => ({ snapshot: fixture.textSnapshot(pool), loading: fixture.textLoading, refresh: action }) },
  '@/hooks/usePushNotifications': { usePushNotifications: () => fixture.push },
  '@/store/useLocalAIStore': { useLocalAIStore: store('local') },
  '@/store/useCorporateModeStore': { useCorporateModeStore: store('corporate') },
  '@/store/useVoiceModeStore': { useVoiceModeStore: store('voice'), REALTIME_SUPPORTED_VOICES: actualVoiceIds },
  '@/store/useGitStore': { useGitStore: store('github') },
  '@/services/localAI': { FAST_MODEL: 'fixture-fast', QUALITY_MODEL: 'fixture-quality', isWebGPUSupported: action,
    loadLocalModel: action, unloadLocalModel: action, getCachedLocalModels: action, deleteCachedLocalModel: action },
  '@/utils/corporateMemorySnapshot': { fetchCorporateMemorySnapshot: action },
  '@/utils/mobileLocal': { isMobileLocalDevice: () => fixture.mobile },
  '@/hooks/useReducedMotionPreference': { useReducedMotionPreference: () => true },
  '@/hooks/useNativeListLayout': { useNativeListLayout: () => null },
};
const sourceModules = new Set([
  'components/SettingsPanel', 'components/PushNotificationsCard', 'components/CloudRunNotificationsCard',
  'components/LocalAIPanel', 'components/CorporateModePanel', 'components/SharedLinksCard', 'components/GitHubIntegrationCard',
  'components/VoiceSelector', 'components/VoiceMagneticPicker', 'components/PlanUsageBreakdown',
  'components/TextUsageMeters', 'components/ImageCreditSummary', 'components/BoostIcon',
  'workspace/WorkspaceSettingsPage', 'workspace/settingsSections', 'workspace/settingsPresentation', 'workspace/SettingsSurface',
  'constants/voices', 'services/arcTextUsage', 'lib/utils', 'lib/chatModelIcons', 'lib/planCopy', 'lib/boostPricing', '../supabase/functions/_shared/boostCatalog',
]);
const moduleCache = new Map();
const loadedSources = new Set();
function loadSource(id) {
  if (moduleCache.has(id)) return moduleCache.get(id);
  assert.ok(sourceModules.has(id) || id.startsWith('components/ui/') || id.startsWith('components/icons/'), `Unexpected source module: ${id}`);
  const filename = ['.tsx', '.ts'].map(extension => path.join(root, 'src', id + extension)).find(existsSync);
  assert.ok(filename, `Missing fixture source: ${id}`);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, `${id}: syntax is valid`);
  const exports = {};
  moduleCache.set(id, exports);
  loadedSources.add(id);
  const fixtureReact = {
    ...React,
    // Seed states reached after mocked reads without firing effects or changing production controllers.
    useState(initial) {
      const index = stateCalls.get(id) ?? 0;
      stateCalls.set(id, index + 1);
      const override = fixture.states[id]?.[index];
      const seeded = id === 'components/SettingsPanel' && index === 1 ? fixture.section
        : override === undefined ? initial : override;
      return React.useState(seeded);
    },
    useLayoutEffect: React.useEffect,
  };
  new Function('exports', 'require', compiled.outputText)(exports, specifier => {
    if (specifier === 'react') return fixtureReact;
    if (specifier === 'react/jsx-runtime') return { ...jsxRuntime, ...Object.fromEntries(['jsx', 'jsxs'].map(key => [key, (type, props, ...rest) => {
      if (props && Object.keys(props).some(name => /^on[A-Z]/.test(name))) eventCaptures.push({ source: id, type, props });
      return jsxRuntime[key](type, props, ...rest);
    }])) };
    if (mocks[specifier]) return mocks[specifier];
    if (/\.(css|png|svg)$/.test(specifier)) return specifier.endsWith('.css') ? {} : { default: '/fixture-assets/' + path.basename(specifier) };
    if (specifier.startsWith('@/')) return loadSource(specifier.slice(2));
    if (specifier.startsWith('.')) return loadSource(path.posix.normalize(path.posix.join(path.posix.dirname(id), specifier)));
    return require(specifier);
  });
  return exports;
}
globalThis.navigator ??= { onLine: true, userAgent: 'SSR fixture', platform: 'Linux' };
globalThis.fetch = () => { throw new Error('Network is disabled in Settings fixtures.'); };
fixture = baseFixture();
stateCalls = new Map();
const { SettingsPanel } = loadSource('components/SettingsPanel');
const { WorkspaceSettingsRowsContext } = loadSource('workspace/settingsPresentation');
let cases = 0;
const rendered = [];
function render(section, patch = {}, workspace = true) {
  fixture = { ...baseFixture(), ...patch, section };
  stateCalls = new Map();
  eventCaptures = [];
  const markup = renderToStaticMarkup(React.createElement(SettingsPanel, { workspacePresentation: workspace }));
  cases++;
  rendered.push({ section, workspace, scenario: patch.scenario ?? 'default', markup });
  return markup;
}
function includesAll(markup, markers, label) {
  for (const marker of markers) assert.ok(markup.includes(marker), `${label}: ${marker}`);
}
const expectedBody = new Map([
  ['account', ['Profile', 'Email', 'Push Notifications', 'Cloud run notifications', 'Connected Accounts', 'Sign Out &amp; Delete']],
  ['appearance', ['Theme', 'Dark', 'Light', 'System', 'Custom Font', 'App font']],
  ['ai', ['Voice Mode', 'Choose a voice', 'Speaking Speed Slider', 'Persona', 'Images', 'Arc Local', 'System Status']],
  ['connectors', ['GitHub Integration', 'Supabase', 'Netlify', 'workspace-github-group']],
  ['privacy', ['Privacy / Corporate Mode', 'Use my memories on-device', 'Shared chat links', 'Export', 'Sync Status']],
  ['plan', ['Your Subscription', 'GPT 6 Luna', 'GPT 6.1 Sol', 'GPT 6 Astra', 'Image allowance', 'Refill monthly allowance']],
]);
for (const [section, markers] of expectedBody) {
  const markup = render(section);
  includesAll(markup, markers, section);
  assert.ok(markup.includes('workspace-settings-group'), `${section}: flat groups render`);
  assert.ok(markup.includes('<h2>Settings</h2>'), `${section}: in-page Settings title remains`);
  assert.ok(!markup.includes('liquid-metal-surface'), `${section}: no legacy card surface is hidden inside Workspace`);
  assert.ok(!markup.includes('rounded-[28px]'), `${section}: no legacy outer subscription/section card`);
  const legacy = render(section, {}, false);
  assert.ok(legacy.includes('liquid-metal-surface'), `${section}: legacy card surfaces remain the default`);
  assert.ok(!legacy.includes('workspace-settings-group'), `${section}: page context does not leak into legacy Settings`);
}
const appearance = render('appearance');
assert.equal((appearance.match(/class="workspace-settings-choice" aria-pressed=/g) ?? []).length, 3, 'three explicit theme choices');
assert.ok(appearance.includes('aria-label="App font"') && !appearance.includes('The quick brown fox'), 'font selection is compact in Workspace');
assert.ok(render('appearance', {}, false).includes('The quick brown fox'), 'legacy font preview grid is retained');
const ai = render('ai');
assert.equal((ai.match(/<option value="(?:marin|cedar|ripple|quartz)"/g) ?? []).length, 4, 'same four actual voices render');
assert.ok(!ai.includes('arc-voice-magnetic'), 'Workspace voice selector uses an understated control');
assert.ok(render('ai', {}, false).includes('arc-voice-magnetic'), 'legacy magnetic voice picker remains');
includesAll(ai, ['Aspect ratio', 'Square', 'Landscape', 'Portrait', '16:9 (YouTube)', '25 remaining'], 'actual image defaults');

const notificationFixture = baseFixture();
const account = render('account', {
  scenario: 'connected-notifications',
  user: { ...notificationFixture.user, app_metadata: { providers: ['google', 'email'] } },
  push: { ...notificationFixture.push, subscribed: true },
  states: { 'components/CloudRunNotificationsCard': { 0: false, 1: false }, 'components/SettingsPanel': { 6: 'Fixture Owner' } },
});
includesAll(account, ['Send test notification', 'Disable on this device', 'Disable push notifications', 'data-state="unchecked"', 'Connected'], 'populated account');
assert.ok(!account.includes('>Connect</button>'), 'connected Google account retains its connected state');
const blockedPush = render('account', { scenario: 'notifications-denied', push: { ...notificationFixture.push, permission: 'denied' } });
includesAll(blockedPush, ['Notifications are blocked for this site', 'workspace-settings-note--warning'], 'denied permission');
assert.ok(!blockedPush.includes('data-push-toggle'), 'denied notifications cannot be toggled');
const busyPush = render('account', { scenario: 'notifications-loading', push: { ...notificationFixture.push, loading: true } });
assert.ok(busyPush.includes('aria-busy="true"'), 'notification loading remains visible');
for (const [flag, copy] of [['needsIOSInstall', 'Home Screen'], ['needsMacInstall', 'Dock']]) {
  const markup = render('account', { push: { ...notificationFixture.push, [flag]: true } });
  assert.ok(markup.includes(copy) && !markup.includes('data-push-toggle'), `${flag}: install requirement retained`);
}
for (const [availabilityReason, copy] of [['unsupported-browser', 'supported in this browser'], ['push-service-unavailable', 'push service is still waking up']]) {
  assert.ok(render('account', { push: { ...notificationFixture.push, supported: false, availabilityReason } }).includes(copy));
}

const localFixture = baseFixture();
const localReady = render('ai', {
  scenario: 'local-models-ready',
  local: { ...localFixture.local, status: 'ready', selectedModelId: 'fixture-fast', enabled: true },
  states: { 'components/LocalAIPanel': { 0: { 'fixture-fast': true, 'fixture-quality': true }, 1: true } },
});
includesAll(localReady, ['Use local model when possible', 'Always use cloud models', 'Use this model', 'Remove', 'workspace-local-model-actions'], 'cached local models');
const localLoading = render('ai', {
  scenario: 'local-model-loading',
  local: { ...localFixture.local, status: 'loading', progress: .42, progressText: 'Downloading fixture model' },
  states: { 'components/LocalAIPanel': { 1: true, 2: 'fixture-fast' } },
});
includesAll(localLoading, ['Downloading fixture model', '42%', 'Downloading…'], 'local download progress');
const localError = render('ai', { scenario: 'local-model-error', local: { ...localFixture.local, status: 'error', errorMessage: 'Fixture model failed' } });
includesAll(localError, ['Fixture model failed', 'workspace-settings-note--warning'], 'local error');
assert.ok(render('ai', { local: { ...localFixture.local, webgpuSupported: false } }).includes('WebGPU not available here'));
assert.ok(render('ai', { mobile: true }).includes('Open Arc on desktop'), 'mobile desktop-only fallback remains');

const privacyFixture = baseFixture();
const privacy = render('privacy', {
  scenario: 'shared-links-and-cached-memory',
  corporate: { ...privacyFixture.corporate, enabled: true, memoriesEnabled: true,
    memorySnapshot: { memory_info: 'Fixture memory', cached_at: '2026-10-10T12:00:00Z' } },
  states: { 'components/SharedLinksCard': { 0: [{ id: 'shared-1', title: 'A shared fixture chat', updated_at: '2026-10-09T00:00:00Z' }], 1: false } },
});
includesAll(privacy, ['Living memory summary cached', 'Last synced:', 'Refresh', 'No on-device model is loaded yet',
  'A shared fixture chat', 'Copy link', 'Open link', 'Revoke link', 'workspace-shared-link-actions'], 'populated privacy');
assert.ok(render('privacy', { scenario: 'shared-links-loading' }).includes('Loading…'), 'shared links loading renders the real component');
assert.ok(render('privacy', { states: { 'components/SharedLinksCard': { 1: false } } }).includes('shared any chats yet'), 'shared links empty state');
assert.ok(!render('privacy', { mobile: true }).includes('Privacy / Corporate Mode'), 'existing mobile privacy gate is unchanged');

const planFixture = baseFixture();
const boost = render('plan', {
  scenario: 'boost-with-bonus-and-refill',
  subscription: { ...planFixture.subscription, hasBoost: true, hasVerifiedBoost: true, currentPeriodEnd: '2026-11-10T00:00:00Z' },
  images: { ...planFixture.images, creditLimit: 250, remainingCredits: 85, baseRemaining: 80, bonusRemaining: 5, unitCost: 4,
    refillOffers: [{ id: 'bonus-refill', title: 'Fixture offer' }] },
});
includesAll(boost, ['Billing Portal', 'Next renewal on', '80 of 250 base credits remaining', 'Plus 5 bonus credits', '4 credits per image', 'Fixture offer: refill'], 'Boost usage and billing');
assert.ok(!boost.includes('Get Boost</button>'), 'Boost retains billing portal rather than checkout');
const planLoading = render('plan', { scenario: 'usage-loading', images: { ...planFixture.images, loading: true }, textLoading: true, textSnapshot: () => null,
  subscription: { ...planFixture.subscription, loading: true } });
includesAll(planLoading, ['Loading image allowance', 'Loading…', 'aria-busy="true"'], 'usage loading');
const planUnavailable = render('plan', { scenario: 'usage-unavailable', images: { ...planFixture.images, resetAt: null }, textSnapshot: () => null });
includesAll(planUnavailable, ['Image allowance unavailable', 'Unavailable'], 'unavailable usage never becomes zero');
const admin = render('plan', { scenario: 'admin-uncapped', subscription: { ...planFixture.subscription, isAdmin: true, isVerifiedModelAdmin: true },
  images: { ...planFixture.images, remainingCredits: Infinity }, textSnapshot: pool => ({ ...planFixture.textSnapshot(pool), adminUncapped: true }) });
includesAll(admin, ['ArcAI Admin', 'Unlimited images for admins', 'Uncapped'], 'admin usage');
assert.ok(!admin.includes('Billing Portal</button>') && !admin.includes('Get Boost</button>'), 'admin billing controls remain absent');

const gitFixture = baseFixture();
const connected = render('connectors', { scenario: 'github-connected', github: { ...gitFixture.github, connected: true } });
includesAll(connected, ['Repository Access', 'All Repositories', 'Specific Repositories', 'Disconnect', 'Authorized'], 'connected GitHub');
const selectedRepos = render('connectors', { scenario: 'github-selected-repositories', github: { ...gitFixture.github, connected: true, repoAccessMode: 'selected',
  allowedRepos: ['fixture/project'], repositories: [{ full_name: 'fixture/project', name: 'project', private: true }] } });
includesAll(selectedRepos, ['fixture/project', '1 of 1 repositories selected'], 'selected repositories');
const repositoriesLoading = render('connectors', { scenario: 'github-repositories-loading', github: { ...gitFixture.github, connected: true, repoAccessMode: 'selected', loading: true } });
assert.ok(repositoriesLoading.includes('Loading repositories'), 'real repository loading state');

const refillError = render('plan', { scenario: 'refill-error', states: { 'components/ImageCreditSummary': { 2: 'Fixture refill unavailable' } } });
assert.ok(refillError.includes('role="alert">Fixture refill unavailable'), 'real image refill error remains visible');
for (const [section, patch, markers] of [
  ['account', { push: { ...baseFixture().push, subscribed: true }, states: { 'components/CloudRunNotificationsCard': { 1: false } } }, ['Send test notification']],
  ['ai', { local: { ...baseFixture().local, status: 'error', errorMessage: 'Legacy fixture error' } }, ['Legacy fixture error']],
  ['privacy', { states: { 'components/SharedLinksCard': { 0: [{ id: 'legacy-shared', title: 'Legacy shared chat', updated_at: '2026-10-10T00:00:00Z' }], 1: false } } }, ['Legacy shared chat', 'Revoke link']],
  ['plan', { subscription: { ...baseFixture().subscription, hasBoost: true }, images: { ...baseFixture().images, bonusRemaining: 7 } }, ['Billing Portal', 'Plus 7 bonus credits']],
]) {
  const legacy = render(section, { ...patch, scenario: 'populated-legacy' }, false);
  includesAll(legacy, markers, `${section} populated legacy`);
  assert.ok(legacy.includes('liquid-metal-surface'), 'legacy populated cards remain');
}

// Shared descendants rendered on their own also keep legacy defaults outside Settings.
for (const id of ['PushNotificationsCard', 'CloudRunNotificationsCard', 'LocalAIPanel', 'CorporateModePanel', 'SharedLinksCard', 'PlanUsageBreakdown', 'VoiceSelector']) {
  fixture = baseFixture(); stateCalls = new Map();
  const Component = loadSource(`components/${id}`)[id];
  const legacy = renderToStaticMarkup(React.createElement(Component));
  assert.ok(!legacy.includes('workspace-settings-group') && !legacy.includes('workspace-settings-select'), `${id}: default stays legacy`);
  stateCalls = new Map();
  const workspace = renderToStaticMarkup(React.createElement(WorkspaceSettingsRowsContext.Provider, { value: true }, React.createElement(Component)));
  assert.ok(workspace.includes('workspace-settings-'), `${id}: context reaches the actual descendant`);
  cases += 2;
}
for (const name of ['PushNotificationsCard', 'CloudRunNotificationsCard', 'LocalAIPanel', 'CorporateModePanel', 'SharedLinksCard',
  'PlanUsageBreakdown', 'ImageCreditSummary', 'TextUsageMeters', 'VoiceSelector', 'VoiceMagneticPicker']) {
  assert.ok(loadedSources.has(`components/${name}`), `${name} is real source, never an empty mock`);
}

// Invoke actual presentation callbacks with service/store spies only. No event reaches a provider.
let callbackCases = 0;
const invoke = async (section, source, match, event, expected) => {
  render(section);
  const captured = eventCaptures.find(item => item.source === source && match(item.props));
  assert.ok(captured, `actual callback exists in ${source}`);
  actionCalls = [];
  try {
    await event(captured.props);
    assert.ok(actionCalls.some(args => JSON.stringify(args) === JSON.stringify(expected)), `callback preserves ${JSON.stringify(expected)}`);
    callbackCases++;
  } finally { actionCalls = null; }
};
for (const mode of ['Dark', 'Light', 'System']) await invoke('appearance', 'components/SettingsPanel', props => props.children === mode,
  props => props.onClick(), [mode.toLowerCase()]);
await invoke('ai', 'components/SettingsPanel', props => props.children === 'Landscape', props => props.onClick(), ['3:2']);
await invoke('ai', 'components/VoiceSelector', props => props['aria-label'] === 'Choose a voice',
  props => props.onChange({ target: { value: 'cedar' } }), ['cedar']);
await invoke('ai', 'components/VoiceSelector', props => props['aria-label'] === 'Speaking Speed Slider',
  props => props.onValueChange([125]), [1.25]);
await invoke('privacy', 'components/CorporateModePanel', props => props.id === 'corp-mem-toggle',
  props => props.onCheckedChange(false), [false]);

// Optional, local-only fixtures for browser layout review. No accounts or runnable actions.
if (process.env.WORKSPACE_SETTINGS_SSR_OUTPUT) {
  const output = path.resolve(process.env.WORKSPACE_SETTINGS_SSR_OUTPUT);
  mkdirSync(output, { recursive: true });
  const hash = text => createHash('sha256').update(text).digest('hex');
  const sourceHashes = {};
  for (const id of loadedSources) {
    const filename = ['.tsx', '.ts'].map(extension => path.join(root, 'src', id + extension)).find(existsSync);
    sourceHashes[path.relative(root, filename)] = hash(readFileSync(filename));
  }
  for (const name of [...staticSourceFiles, 'src/workspace/workspace-settings.css', 'scripts/test-workspace-settings-sections-ssr.mjs']) {
    sourceHashes[name] = hash(readFileSync(path.join(root, name)));
  }
  const sections = rendered.map(({ section, workspace, scenario, markup }, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${section}-${workspace ? 'workspace' : 'legacy'}-${scenario}.html`;
    writeFileSync(path.join(output, filename), markup);
    return { section, presentation: workspace ? 'workspace' : 'legacy', scenario, filename, sha256: hash(markup) };
  });
  const aliasStates = {
    account: { populated: 'connected-notifications', loading: 'notifications-loading', error: 'notifications-denied' },
    appearance: { populated: 'default' },
    ai: { populated: 'local-models-ready', loading: 'local-model-loading', error: 'local-model-error' },
    connectors: { populated: 'github-selected-repositories', loading: 'github-repositories-loading' },
    privacy: { populated: 'shared-links-and-cached-memory', loading: 'shared-links-loading' },
    plan: { populated: 'boost-with-bonus-and-refill', loading: 'usage-loading', error: 'refill-error' },
  };
  const fixtures = Object.entries(aliasStates).flatMap(([section, states]) => Object.entries(states).map(([state, scenario]) => {
    const source = rendered.find(item => item.section === section && item.workspace && item.scenario === scenario);
    assert.ok(source, `${section}/${scenario}: export fixture exists`);
    const filename = `${section}-${state}.html`;
    writeFileSync(path.join(output, filename), source.markup);
    return { section, state, scenario, filename, sha256: hash(source.markup) };
  }));
  writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
    description: 'Real SettingsPanel and descendants rendered to inert HTML. Hooks/services are deterministic fixtures. No effects, mutations, or external actions ran.',
    generatedAt: new Date().toISOString(), sourceHashes, fixtures, sections,
  }, null, 2) + '\n');
}
console.log(`Workspace Settings SSR passed: ${cases} real-tree renders; six sections, legacy defaults, populated/loading/unavailable/error states, and nested voice/image/usage controls. ${callbackCases} actual callbacks verified with inert spies. No effects or external actions executed.`);
