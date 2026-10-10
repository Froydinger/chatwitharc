import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(source, aliases = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return exports;
}

const sectionHelpers = load(read('../src/workspace/settingsSections.ts'));
for (const id of ['account', 'appearance', 'ai', 'connectors', 'privacy', 'plan']) {
  assert.equal(sectionHelpers.resolveSettingsSectionQuery(id), id);
}
for (const [alias, id] of [['billing', 'plan'], ['subscription', 'plan'], ['profile', 'account'], ['general', 'account'], ['models', 'ai'], ['voice', 'ai']]) {
  assert.equal(sectionHelpers.resolveSettingsSectionQuery(alias), id, `${alias} remains a settings query alias`);
}
assert.equal(sectionHelpers.resolveSettingsSectionQuery(null), null);
assert.equal(sectionHelpers.resolveSettingsSectionQuery('unknown'), null);
const planQuery = sectionHelpers.searchParamsForSettingsSection(new URLSearchParams('source=usage&section=voice'), 'plan');
assert.equal(planQuery.toString(), 'source=usage&section=plan');
const accountQuery = sectionHelpers.searchParamsForSettingsSection(planQuery, 'account');
assert.equal(accountQuery.toString(), 'source=usage');
assert.equal(sectionHelpers.resolveSettingsSectionQuery(planQuery.get('section')), 'plan', 'Back returns to the previous section query');
assert.equal(sectionHelpers.resolveSettingsSectionQuery(accountQuery.get('section')) ?? 'account', 'account', 'Forward restores the default Account section');

const iconExports = new Proxy({}, { get: (target, name) => target[name] ?? (target[name] = props => React.createElement('svg', props)) });
const pageSource = read('../src/workspace/WorkspaceSettingsPage.tsx').replace("import './workspace-settings.css';", '');
const page = load(pageSource, { 'lucide-react': iconExports });
const sections = [
  ['account', 'Account', 'Identity & login'], ['appearance', 'Appearance', 'Look & feel'],
  ['ai', 'AI & Models', 'Models, voice, images'], ['connectors', 'Connectors', 'GitHub & external services'],
  ['privacy', 'Privacy, Sharing, & Data', 'Memory, sharing, exports'], ['plan', 'Plan & Billing', 'Subscription details'],
].map(([id, label, subtitle]) => ({ id, label, subtitle, icon: iconExports.Settings }));
const markup = renderToStaticMarkup(React.createElement(page.WorkspaceSettingsPage, {
  sections, activeSection: 'plan', onSectionChange() {},
  children: React.createElement('section', { className: 'workspace-settings-group' }, React.createElement('h3', null, 'Your Subscription')),
}));
assert.equal((markup.match(/workspace-settings-section-button/g) ?? []).length, 6, 'all six sections have real page navigation');
assert.ok(markup.includes('aria-pressed="true"') && markup.includes('Plan &amp; Billing'));
assert.ok(markup.includes('workspace-settings-group') && markup.includes('Your Subscription'));

const settingsPanel = read('../src/components/SettingsPanel.tsx');
assert.ok(settingsPanel.includes('workspacePresentation = false'), 'the old presentation remains the default outside Workspace');
assert.ok(settingsPanel.includes('<VoiceSelector />'), 'the existing voice selector stays in AI & Models');
assert.ok(settingsPanel.includes('handleSaveDisplayName') && settingsPanel.includes('handleSavePersonaPrompt'), 'dirty save/reset handlers remain connected');
assert.ok(settingsPanel.includes('openCustomerPortal') && settingsPanel.includes('openCheckout'), 'existing subscription actions remain connected');
assert.ok(settingsPanel.includes('<DeleteDataModal'), 'the existing account deletion confirmation stays connected');
assert.ok(settingsPanel.includes('searchParamsForSettingsSection') && settingsPanel.includes('setSearchParams(next)'), 'section navigation writes browser history');
assert.ok(read('../src/pages/DashboardSettingsPage.tsx').includes('<SettingsPanel workspacePresentation />'));

console.log('Workspace settings checks passed: six sections, alias/query navigation, history targets and preserved account, AI, billing and deletion handlers.');
