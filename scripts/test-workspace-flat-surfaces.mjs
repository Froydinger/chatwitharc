// Offline presentation/cascade checks. Physical layout remains Safari QA.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
const require = createRequire(import.meta.url);
const { JSDOM } = await import(process.env.ARC_JSDOM_MODULE || 'jsdom');
const read = file => readFileSync(file, 'utf8');
const flat = postcss.parse(read('src/workspace/workspace-flat-surfaces.css'));
const source = [postcss.parse(read('src/index.css')), postcss.parse(read('src/workspace/workspace.css')), flat];
const main = [...read('dist/index.html').matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match => match[1].replace(/^\//, ''));
assert(main.length, 'Run the production build first');
// Include lazy CSS too: flat overrides must survive every active-page import order.
const paths = [...main, ...readdirSync('dist/assets').filter(file => file.endsWith('.css') && !main.includes('assets/' + file)).map(file => 'assets/' + file)];
const production = paths.map(file => postcss.parse(read('dist/' + file)));
const specificity = selector => {
  const sum = nodes => nodes.reduce((score, node) => {
    if (node.type === 'id') return score + 10000;
    if (node.type === 'class' || node.type === 'attribute') return score + 100;
    if (node.type === 'tag') return score + 1;
    if (node.type === 'pseudo') {
      if (node.value === ':where') return score;
      if ([':is', ':not', ':has'].includes(node.value)) return score + Math.max(0, ...node.nodes.map(part => sum(part.nodes)));
      return score + (/^::?(before|after)$/.test(node.value) ? 1 : 100);
    }
    return score;
  }, 0);
  return sum(selectorParser().astSync(selector).first.nodes);
};
const cascade = (element, sheets, state = '') => {
  const winners = {};
  for (const sheet of sheets) sheet.walkRules(rule => {
    for (const selector of rule.selectors) {
      const pseudo = selector.match(/:{1,2}(before|after)/)?.[1];
      if ((pseudo || '') !== (['before', 'after'].includes(state) ? state : '')) continue;
      const match = selector.replace(/:{1,2}(?:before|after)/g, '')
        .replace(/:focus-visible|:focus-within|:focus|:hover/g, value => {
          const active = value === ':hover' ? state === 'hover' : state === 'focus';
          return active ? ':is(*)' : ':not(*)';
        });
      try { if (!element.matches(match)) continue; } catch { continue; }
      const rank = specificity(selector);
      for (const decl of rule.nodes) {
        if (decl.type !== 'decl') continue;
        const key = decl.prop === 'background-color' ? 'background' : decl.prop === '-webkit-backdrop-filter' ? 'backdrop-filter' : decl.prop;
        const importance = Number(!!decl.important), previous = winners[key];
        if (!previous || importance > previous.importance || importance === previous.importance && rank >= previous.rank) winners[key] = { value: decl.value, rank, importance };
      }
    }
  });
  return Object.fromEntries(Object.entries(winners).map(([key, item]) => [key, item.value]));
};
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const document = dom.window.document;
try {
  for (const theme of ['dark', 'light']) {
    document.documentElement.className = theme;
    document.documentElement.dataset.workspaceTheme = theme;
    document.documentElement.dataset.accent = 'noir';
    document.body.innerHTML = `<div class="workspace-ui"><button class="glass-btn ws-model-trigger">Model</button><div class="glass-card">Settings card</div><div role="dialog" class="glass-card shadow-2xl" data-work-summary>Work summary</div><div class="glass-dock">Composer</div><button aria-pressed="true">Selected</button><div class="backdrop-blur-xl">Panel</div></div><div class="workspace-ui ws-model-menu"><button aria-pressed="true">Auto</button><button class="text-[10px]">Usage details</button></div><div class="workspace-ui ws-flat-dialog ws-model-voice-dialog"><input class="md:text-sm"/><textarea class="md:text-sm"></textarea><div class="t-tabs"><button class="t-tabs-pill t-tab" aria-pressed="true">Model</button></div></div><div class="workspace-ui ws-flat-portal glass-panel"><button data-plain-action>Nested action</button></div><div class="ws-flat-overlay backdrop-blur-sm"></div><div class="ws-drawer-overlay"></div><div class="ws-prompt-overlay"></div><div class="workspace-mode-dialog-overlay"></div><div class="arc-overlay"></div><div class="workspace-ui ws-chat-actions-dialog glass-panel"></div>`;
    for (const [name, sheets] of [['source', source], ['global-last', [...source].reverse()], ['production', production]]) {
      const context = `${theme}/${name}`;
      for (const selector of ['.glass-btn', '.glass-card', '.ws-model-menu', '.ws-flat-dialog']) {
        const value = cascade(document.querySelector(selector), sheets);
        assert.equal(value.background, 'var(--ws-canvas)', context + selector + ' opaque fill');
        assert.equal(value['background-image'], 'none', context + selector + ' no sheen');
        assert.equal(value['backdrop-filter'], 'none', context + selector + ' no frost');
      }
      const button = document.querySelector('.glass-btn');
      for (const pseudo of ['before', 'after']) assert.equal(cascade(button, sheets, pseudo).display, 'none', context + ' no glass pseudo-element');
      assert.equal(cascade(button, sheets, 'hover').background, 'var(--ws-hover)');
      for (const state of ['hover','focus']) {
        const value = cascade(button, sheets, state);
        const nested = cascade(document.querySelector('[data-plain-action]'), sheets, state);
        assert.equal(nested.animation, 'none', context + ' no pulse on a root glass-panel child');
        assert.equal(nested.filter, 'none', context + ' no filter on a root glass-panel child');
        assert.equal(value.animation, 'none', context + ' no liquid-glass pulse');
        assert.equal(value.filter, 'none', context + ' no animated drop-shadow');
      }
      assert.equal(cascade(button, sheets, 'focus').outline, '2px solid var(--ws-text)', context + ' keyboard focus retained');
      assert.equal(cascade(document.querySelector('.glass-dock'), sheets)['backdrop-filter'], 'none');
      for (const selector of ['.ws-flat-overlay', '.ws-drawer-overlay', '.ws-prompt-overlay', '.workspace-mode-dialog-overlay', '.arc-overlay', '.backdrop-blur-xl']) assert.equal(cascade(document.querySelector(selector), sheets)['backdrop-filter'], 'none', context + selector);
      for (const selected of document.querySelectorAll('[aria-pressed=true]')) {
        const value = cascade(selected, sheets);
        assert.equal(value.background, 'var(--ws-hover)');
        assert.equal(value.color, 'var(--ws-text)');
        assert.equal(value['box-shadow'], 'none', context + ' no selected blue halo');
      }
      assert.equal(cascade(document.querySelector('.t-tabs-pill'), sheets)['background-image'], 'none');
      assert.equal(cascade(document.querySelector('.t-tab'), sheets)['text-shadow'], 'none');
      assert.notEqual(cascade(document.querySelector('.ws-model-menu'), sheets)['box-shadow'], 'none', 'structural popup separation remains');
      assert.equal(cascade(document.querySelector('.ws-chat-actions-dialog'), sheets)['box-shadow'], '0 24px 90px #0005', 'real glass-panel alert dialog retains its structural shadow');
      assert.equal(cascade(document.querySelector('[data-work-summary]'), sheets)['box-shadow'], '0 24px 90px #0005', 'custom inline Work dialog retains neutral structural separation');
      const reset = source[1].nodes.find(rule=>rule.type==='rule' && rule.selector.includes('.workspace-ui:not(:where('));
      assert(reset);
      for (const control of document.querySelectorAll('.ws-model-menu button,.ws-flat-dialog input,.ws-flat-dialog textarea')) assert(!control.matches(reset.selectors[0]), 'new portal scope does not change legacy control font sizing');
      assert(document.querySelector('.glass-btn').matches(reset.selectors[0]), 'existing Workspace font reset keeps its behavior and specificity');
    }
    // The same old classes outside the opted-in Workspace must not match a new rule.
    document.body.innerHTML = '<button class="glass-btn">Legacy</button><div class="glass-card"></div><div class="arc-overlay"></div>';
    for (const element of document.body.children) assert.deepEqual(cascade(element, [flat]), {});
    delete document.documentElement.dataset.workspaceTheme;
    document.body.innerHTML = '<div class="workspace-ui"><button class="glass-btn"></button></div>';
    assert.deepEqual(cascade(document.querySelector('button'), [flat]), {});
  }
  // Actual FreeUsageButton keeps account visibility and only adds portal opt-in classes.
  for (const workspaceUI of [false, true]) for (const hasBoost of [false, true]) {
    const Wrapper = ({ children, className }) => React.createElement('div', { className }, children);
    const deps = { React, useWorkspaceUI: () => workspaceUI, useAuth: () => ({ user: { id: 'offline' }, loading: false }), useSubscription: () => ({ hasBoost, isAdmin: false, loading: false }),
      Dialog: Object.fromEntries(['Root','Trigger','Portal','Overlay','Content','Title','Description','Close'].map(key => [key, Wrapper])), cn: (...values) => values.filter(Boolean).join(' '),
      CircleGauge: () => null, X: () => null, PlanUsageBreakdown: () => React.createElement('div', { 'aria-label': 'Usage breakdown' }, 'Inert real-client boundary') };
    const api = {};
    const code = ts.transpileModule(read('src/components/FreeUsageButton.tsx').replace(/^import .*;\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('exports', 'require', ...Object.keys(deps), code)(api, require, ...Object.values(deps));
    const html = renderToStaticMarkup(React.createElement(api.FreeUsageButton));
    assert.equal(html === '', hasBoost);
    if (!hasBoost) { assert.equal(html.includes('ws-usage-dialog'), workspaceUI); assert.equal(html.includes('ws-flat-overlay'), workspaceUI); }
  }
  console.log('PASS Workspace flat surfaces: opaque neutral fill, no gradients/frost/glass pseudo-elements/pressed glow in both themes and final production cascade; focus outlines and structural popup shadow remain. Real usage/picker legacy opt-in isolation is covered; no network or browser was used.');
} finally { dom.window.close(); }
