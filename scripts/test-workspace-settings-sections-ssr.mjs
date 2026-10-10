import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const activeSection = () => globalThis.__workspaceSettingsFixtureSection ?? 'account';
const ReactForFixture = {
  ...React,
  useState(initial) {
    const [state, setState] = React.useState(initial);
    return [initial === 'account' ? activeSection() : state, setState];
  },
};
const jsx = require('react/jsx-runtime');
const icon = name => function FixtureIcon(props) { return React.createElement('svg', { 'data-fixture-icon': name, ...props }); };
const icons = new Proxy({}, { get: (_target, name) => icon(String(name)) });
const html = (tag, fixtureName = tag) => function FixtureComponent({ children, ...props }) {
  return React.createElement(tag, { 'data-fixture-component': fixtureName, ...props }, children);
};
const passthrough = () => function FixturePassthrough({ children }) {
  return React.createElement(React.Fragment, null, children);
};
const reactComponent = (name, tag = 'div') => html(tag, name);
const accent = {
  themeMode: 'system', cycleThemeMode() {}, setThemeMode() {}, setAccentColorLocal() {},
};
const starfield = { showStarfield: false, setShowStarfield() {} };
const githubState = () => ({
  connected: Boolean(globalThis.__workspaceGithubConnected), providerLogin: 'fixture', repoAccessMode: 'all',
  allowedRepos: [], repositories: [], loading: false, loadStatus() {}, connect() {}, loadRepositories() {},
  updateRepoSettings() {}, disconnect() {},
});
const useGitStore = () => githubState();
const useAccentStore = selector => selector ? selector(accent) : accent;
useAccentStore.getState = () => accent;
const useStarfieldStore = selector => selector(starfield);

const genericExports = names => Object.fromEntries(names.map(name => [name, reactComponent(name)]));
const gitExports = {};
function load(source, modules) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === 'react') return ReactForFixture;
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'lucide-react') return icons;
    return modules[name] ?? {};
  });
  return exports;
}

const github = load(read('../src/components/GitHubIntegrationCard.tsx'), {
  '@/components/GitModeDock': { GitHubMark: icon('GitHubMark') },
  '@/components/ui/glass-card': { GlassCard: reactComponent('GlassCard') },
  '@/components/ui/glass-button': { GlassButton: reactComponent('GlassButton', 'button') },
  '@/components/ui/input': { Input: reactComponent('Input', 'input') },
  '@/store/useGitStore': { useGitStore },
  '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
});
gitExports.GitHubIntegrationCard = github.GitHubIntegrationCard;

const settingsPage = load(read('../src/workspace/WorkspaceSettingsPage.tsx').replace("import './workspace-settings.css';", ''), {});
const sectionHelpers = load(read('../src/workspace/settingsSections.ts'), {});
const toggle = reactComponent('Switch', 'button');
const button = reactComponent('GlassButton', 'button');
const passthroughExports = names => genericExports(names.map(name => name));
const settingsModules = {
  '@/components/BoostIcon': { BoostIcon: icon('BoostIcon') },
  '@/hooks/useImageQuota': { useImageQuota: () => ({ remainingCredits: 5 }) },
  '@/components/PlanUsageBreakdown': { PlanUsageBreakdown: reactComponent('PlanUsageBreakdown') },
  '@/components/transitions/SequencedTransition': { SequencedTransition: passthrough('SequencedTransition') },
  'react-router-dom': {
    Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
    useNavigate: () => () => {},
    useSearchParams: () => [new URLSearchParams(`section=${activeSection()}`), () => {}],
  },
  '@/store/useAccentStore': { useAccentStore },
  '@/hooks/useCustomFont': {
    AVAILABLE_FONTS: [{ id: 'inter', label: 'Inter' }, { id: 'system', label: 'System' }],
    getStoredCustomFont: () => 'inter', setStoredCustomFont() {},
  },
  '@/integrations/auth': { getAuthRedirectUrl: () => '/', signInWithGoogle: async () => {}, signOutCurrentSession: async () => {} },
  '@/components/DeleteDataModal': { DeleteDataModal: () => null },
  '@/hooks/useProfile': { useProfile: () => ({ profile: { display_name: 'Fixture', context_info: '' }, updateProfile: async () => {}, updating: false, refetch: async () => {} }) },
  '@/store/useArcStore': { useArcStore: () => ({ clearAllSessions() {}, lastSyncAt: new Date(), createNewSession() {}, setRightPanelTab() {} }) },
  '@/hooks/useAuth': { useAuth: () => ({ user: { id: 'fixture-owner', email: 'fixture@example.test' } }) },
  '@/components/ui/glass-card': { GlassCard: reactComponent('GlassCard') },
  '@/components/ui/glass-button': { GlassButton: button },
  '@/components/ui/input': { Input: reactComponent('Input', 'input') },
  '@/components/ui/textarea': { Textarea: reactComponent('Textarea', 'textarea') },
  '@/components/ui/switch': { Switch: toggle },
  '@/components/ui/label': { Label: reactComponent('Label', 'label') },
  '@/integrations/supabase/client': { supabase: { auth: { resetPasswordForEmail: async () => ({ error: null }) } }, isSupabaseConfigured: false },
  '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
  '@/lib/uploadAvatar': { uploadAvatar: async () => {} },
  '@/hooks/useAdminSettings': { useAdminSettings: () => ({ isAdmin: false }) },
  '@/components/VoiceSelector': { VoiceSelector: reactComponent('VoiceSelector') },
  '@/store/useImageGenStore': {
    useImageGenStore: () => ({ aspectRatio: '1:1', setAspectRatio() {} }),
    IMAGE_MODEL_OPTIONS: [], IMAGE_ASPECT_OPTIONS: [{ id: '1:1', label: 'Square' }],
    useResolvedImageModel: () => 'fixture-image-model',
  },
  '@/components/ui/alert-dialog': Object.fromEntries([
    'AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription',
    'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle', 'AlertDialogTrigger',
  ].map(name => [name, passthrough(name)])),
  '@/components/ui/dialog': Object.fromEntries([
    'Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle', 'DialogTrigger',
  ].map(name => [name, passthrough(name)])),
  '@/components/ui/dropdown-menu': Object.fromEntries([
    'DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger',
  ].map(name => [name, passthrough(name)])),
  '@/hooks/useSubscription': { useSubscription: () => ({ hasBoost: false, isAdmin: false, openCheckout() {}, openCustomerPortal() {}, cancelAtPeriodEnd: false, currentPeriodEnd: null }) },
  '@/components/LocalAIPanel': { LocalAIPanel: reactComponent('LocalAIPanel') },
  '@/components/CorporateModePanel': { CorporateModePanel: reactComponent('CorporateModePanel') },
  '@/components/SharedLinksCard': { SharedLinksCard: reactComponent('SharedLinksCard') },
  '@/components/PushNotificationsCard': { PushNotificationsCard: reactComponent('PushNotificationsCard') },
  '@/components/CloudRunNotificationsCard': { CloudRunNotificationsCard: reactComponent('CloudRunNotificationsCard') },
  '@/components/GitHubIntegrationCard': gitExports,
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  '@/utils/mobileLocal': { isMobileLocalDevice: () => false },
  '@/store/useStarfieldStore': { useStarfieldStore },
  '@/lib/planCopy': { BOOST_PLAN_SUMMARY: 'Boost plan fixture.', FREE_PLAN_SUMMARY: 'Free plan fixture.' },
  '@/lib/boostPricing': { BOOST_NEW_SUBSCRIBER_PRICE_COPY: 'Price fixture.' },
  '@/workspace/WorkspaceSettingsPage': settingsPage,
  '@/workspace/settingsSections': sectionHelpers,
};
globalThis.navigator ??= { onLine: true };

const settingsPanelSource = read('../src/components/SettingsPanel.tsx');
const settingsPanel = load(settingsPanelSource, settingsModules);
const expectedBody = new Map([
  ['account', ['Profile', 'Email', 'Notifications']],
  ['appearance', ['Theme', 'Dark', 'Light', 'System', 'Custom Font']],
  ['ai', ['Voice Mode', 'Persona', 'Images', 'System Status']],
  ['connectors', ['GitHub Integration', 'Supabase', 'Netlify', 'workspace-github-group', 'workspace-coming-connector-status']],
  ['privacy', ['CorporateModePanel', 'SharedLinksCard', 'Export']],
  ['plan', ['Your Subscription', 'Free plan fixture.']],
]);
for (const [section, markers] of expectedBody) {
  globalThis.__workspaceSettingsFixtureSection = section;
  globalThis.__workspaceGithubConnected = false;
  const markup = renderToStaticMarkup(React.createElement(settingsPanel.SettingsPanel, { workspacePresentation: true }));
  assert.ok(markup.includes(`aria-label="${section === 'privacy' ? 'Privacy, Sharing, &amp; Data' : section === 'ai' ? 'AI &amp; Models' : section === 'plan' ? 'Plan &amp; Billing' : section[0].toUpperCase() + section.slice(1)}"`), `${section}: active page heading renders`);
  for (const marker of markers) assert.ok(markup.includes(marker), `${section}: ${marker} renders in the Workspace body`);
  assert.ok(markup.includes('workspace-settings-group'), `${section}: actual settings groups use the flat Workspace presentation`);
}

globalThis.__workspaceSettingsFixtureSection = 'appearance';
const appearance = renderToStaticMarkup(React.createElement(settingsPanel.SettingsPanel, { workspacePresentation: true }));
for (const mode of ['Dark', 'Light', 'System']) assert.ok(appearance.includes(`>${mode}</button>`), `${mode} is an explicit theme choice`);
assert.equal((appearance.match(/class="workspace-settings-choice" aria-pressed=/g) ?? []).length, 3, 'all three theme choices are visibly selected-state controls');

globalThis.__workspaceSettingsFixtureSection = 'connectors';
globalThis.__workspaceGithubConnected = true;
const connected = renderToStaticMarkup(React.createElement(settingsPanel.SettingsPanel, { workspacePresentation: true }));
assert.ok(connected.includes('Repository Access') && connected.includes('All Repositories') && connected.includes('Specific Repositories'));
assert.ok(connected.includes('Disconnect') && connected.includes('Authorized'), 'connected status and its real controls render');

console.log('Workspace Settings SSR passed: all six real SettingsPanel branches render, including the segmented theme and both connector states.');
