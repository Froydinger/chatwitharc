// Resolve the real notification presentation against source and production CSS.
// This checks cascade contracts only; physical viewport layout belongs to Safari QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
const require = createRequire(import.meta.url);
const { JSDOM } = await import(process.env.ARC_JSDOM_MODULE || 'jsdom');
const load = (file, aliases = {}) => {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', compiled)(exports, name => aliases[name] ?? require(name));
  return exports;
};
const { DashboardNotificationTray } = load('src/components/dashboard/DashboardNotificationTray.tsx', { '@/lib/utils': load('src/lib/utils.ts') });
const styles = ['src/index.css', 'src/workspace/workspace.css'].map(file => postcss.parse(readFileSync(file, 'utf8')));
const builtHtml = readFileSync('dist/index.html', 'utf8');
const builtStyles = [...builtHtml.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match => postcss.parse(readFileSync(`dist/${match[1].replace(/^\//, '')}`, 'utf8')));
assert.ok(builtStyles.length, 'Build the final production app before testing its actual CSS');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const specificity = selector => {
  const sum = nodes => nodes.reduce((score, node) => {
    if (node.type === 'id') return score + 10000;
    if (node.type === 'class' || node.type === 'attribute') return score + 100;
    if (node.type === 'tag') return score + 1;
    if (node.type === 'pseudo') {
      if (node.value === ':where') return score;
      if ([':is', ':not', ':has'].includes(node.value)) return score + Math.max(...node.nodes.map(part => sum(part.nodes)));
      return score + (node.value.startsWith('::') ? 1 : 100);
    }
    return score;
  }, 0);
  return sum(selectorParser().astSync(selector).first.nodes);
};
const cascade = (element, sheets) => {
  const winners = {};
  for (const sheet of sheets) sheet.walkRules(rule => {
    if (!/ws-dashboard-notification|dashboard-preview-notification|\.workspace-ui/.test(rule.selector)) return;
    for (const selector of rule.selectors) {
      try { if (!element.matches(selector)) continue; } catch { continue; }
      const rank = specificity(selector);
      for (const decl of rule.nodes) {
        if (decl.type !== 'decl') continue;
        // Vite can retain only the WebKit alias when both declarations agree.
        const key = decl.prop === 'background-color' ? 'background' : decl.prop === '-webkit-backdrop-filter' ? 'backdrop-filter' : decl.prop;
        const importance = Number(!!decl.important), previous = winners[key];
        if (!previous || importance > previous.importance || (importance === previous.importance && rank >= previous.rank)) winners[key] = { value: decl.value, rank, importance };
      }
    }
  });
  return Object.fromEntries(Object.entries(winners).map(([key, entry]) => [key, entry.value]));
};
try {
  for (const theme of ['light', 'dark']) for (const notifications of [[], [{ id: 'note', title: 'Saved work', detail: 'Your result is ready.', time: '2 min ago', unread: true, channel: 'push' }]]) {
    dom.window.document.documentElement.className = theme;
    dom.window.document.documentElement.dataset.workspaceTheme = theme;
    dom.window.document.documentElement.dataset.accent = 'noir';
    const tray = renderToStaticMarkup(React.createElement(DashboardNotificationTray, { workspace: true, notifications, onClear() {}, onOpen() {} }));
    dom.window.document.body.innerHTML = `<div class="workspace-ui ws-dashboard-notification-popover">${tray}</div>`;
    const outer = dom.window.document.querySelector('.ws-dashboard-notification-popover');
    for (const [name, sheets] of [['source order', styles], ['global last', [...styles].reverse()], ['production', builtStyles]]) {
      const context = `${theme}/${notifications.length ? 'populated' : 'empty'}/${name}`;
      for (const element of [outer, outer.firstElementChild]) {
        const value = cascade(element, sheets);
        assert.equal(value.background, 'var(--ws-elevated)', `${context}: opaque theme surface`);
        for (const prop of ['background-image', 'backdrop-filter', 'box-shadow']) assert.equal(value[prop], 'none', `${context}: no ${prop}`);
      }
      const value = cascade(outer, sheets);
      assert.equal(value['overflow-y'], 'auto', `${context}: long histories scroll within available height`);
      assert.ok(value['max-height'].includes('--radix-popover-content-available-height'));
      assert.ok(value.width.includes('100vw'));
      assert.ok(Number(value['z-index']) < 12000 && Number(value['z-index']) > 9999, `${context}: below Workspace drawers/modals and above page chrome`);
      const clear = cascade(outer.querySelector('.ws-notification-tray>button'), sheets);
      assert.equal(clear['min-height'], '44px');
      if (notifications.length) {
        const row = cascade(outer.querySelector('.dashboard-preview-notification-row'), sheets);
        assert.equal(row.background, 'var(--ws-surface)');
        assert.equal(row['min-height'], '44px');
        const badge = cascade(outer.querySelector('.dashboard-preview-notification-count'), sheets);
        assert.equal(badge.color, 'var(--ws-text)');
        assert.equal(badge.background, 'var(--ws-hover)');
        const dot = cascade(outer.querySelector('.dashboard-preview-notification-unread-dot'), sheets);
        assert.equal(dot.background, 'var(--ws-text)');
        assert.equal(dot['box-shadow'], 'none');
      } else {
        assert.equal(cascade(outer.querySelector('.dashboard-preview-notification-empty'), sheets).background, 'var(--ws-surface)');
      }
    }
    // The new overrides cannot match the same tray outside Workspace.
    dom.window.document.body.innerHTML = renderToStaticMarkup(React.createElement(DashboardNotificationTray, { notifications, onClear() {}, onOpen() {} }));
    assert.ok(!cascade(dom.window.document.querySelector('.dashboard-preview-notification-tray'), styles).background.includes('--ws-'));
  }
  console.log('PASS real extracted tray cascade in light/dark, populated/empty, both source orders and production CSS: flat neutral surfaces, no blur/image/shine, 44px controls, viewport-size scroll contract, isolated legacy styles, layer below Workspace drawers/modals. Physical Safari geometry remains separate.');
} finally { dom.window.close(); }
