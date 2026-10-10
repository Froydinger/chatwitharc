import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
const require=createRequire(import.meta.url);
const load=(file,aliases={})=>{const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',code)(exports,name=>aliases[name]??require(name));return exports;};
const boost=load('src/components/BoostIcon.tsx');
const {WorkspaceChatWorkToggle}=load('src/components/chat-input/WorkspaceChatWorkToggle.tsx',{'@/components/BoostIcon':boost});
for(const mode of ['ask','auto'])for(const hasBoost of [false,true]){
  let calls=0;
  const element=WorkspaceChatWorkToggle({mode,hasBoost,onToggle:()=>calls++});
  const buttons=React.Children.toArray(element.props.children);
  assert.equal(element.props['aria-label'],'Chat or Work');
  assert.equal(buttons[0].props['aria-pressed'],mode==='ask');
  assert.equal(buttons[1].props['aria-pressed'],mode==='auto');
  assert.equal(buttons[1].props['aria-label'],'Work (Boost)');
  buttons[mode==='ask'?0:1].props.onClick();assert.equal(calls,0,'selected segment is a no-op');
  buttons[mode==='ask'?1:0].props.onClick();assert.equal(calls,1,'changing segment invokes the original owner once');
  const html=renderToStaticMarkup(element);
  assert.ok(html.includes(`aria-label="${hasBoost?'Boost active':'Get Boost'}"`));
}
const input=readFileSync('src/components/ChatInput.tsx','utf8');
assert.ok(input.includes('onWorkModeToggle && <WorkspaceChatWorkToggle mode={cloudExecutionMode} onToggle={onWorkModeToggle} hasBoost={hasBoost || isAdmin} />'));
console.log('PASS real Chat/Work pill: exact selected state, no-op repeat, original toggle callback, unchanged caller entitlement/admin state and Boost icon labels.');

// Resolve the relevant real CSS cascade against the emitted control. JSDOM is
// only a selector matcher here: these are geometry contracts, not browser QA.
const { JSDOM } = require(process.env.QA_JSDOM_PATH || '/tmp/arc-create-modes-test-deps/node_modules/jsdom/lib/api.js');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const css = ['src/index.css', 'src/workspace/workspace.css'].map(file => postcss.parse(readFileSync(file, 'utf8')));
const builtHtml = readFileSync('dist/index.html', 'utf8');
const builtCss = [...builtHtml.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)]
  .map(match => postcss.parse(readFileSync(`dist/${match[1].replace(/^\//, '')}`, 'utf8')));
assert.ok(builtCss.length, 'Build the actual production app before checking its CSS cascade');
const stylesheetCases = [['source order', css], ['global last', [...css].reverse()], ['production build', builtCss]];
const specificity = selector => {
  const score = nodes => nodes.reduce((total, node) => {
    if (node.type === 'id') return total + 10000;
    if (node.type === 'class' || node.type === 'attribute') return total + 100;
    if (node.type === 'tag') return total + 1;
    if (node.type === 'pseudo') {
      if (node.value === ':where') return total;
      if ([':is', ':not', ':has'].includes(node.value)) return total + Math.max(...node.nodes.map(part => score(part.nodes)));
      return total + (node.value.startsWith('::') ? 1 : 100);
    }
    return total;
  }, 0);
  return score(selectorParser().astSync(selector).first.nodes);
};
function mediaMatches(rule, width, coarse) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type !== 'atrule' || parent.name !== 'media') continue;
    const query = parent.params;
    for (const [, edge, limit] of query.matchAll(/(min|max)-width:\s*(\d+)px/g)) {
      if (edge === 'min' ? width < Number(limit) : width > Number(limit)) return false;
    }
    // Vite's production CSS optimizer rewrites max/min-width to range syntax.
    for (const [, comparison, limit] of query.matchAll(/\bwidth\s*(<=|>=|<|>)\s*(\d+)px/g)) {
      const bound = Number(limit);
      if (comparison === '<=' ? width > bound : comparison === '>=' ? width < bound : comparison === '<' ? width >= bound : width <= bound) return false;
    }
    if (/pointer:\s*coarse/.test(query) && !coarse) return false;
    if (/max-height:\s*760px|height\s*<=\s*760px|prefers-reduced-motion:\s*reduce/.test(query)) return false;
  }
  return true;
}
function declarationsFor(element, width, coarse, sheets) {
  const winners = {};
  for (const sheet of sheets) sheet.walkRules(rule => {
    // Include the legacy pressed cue and glass rules that can override this
    // control, as well as all its desktop/mobile/touch declarations.
    if (!/ws-mode-switch|aria-pressed|\.glass-dock button/.test(rule.selector) || !mediaMatches(rule, width, coarse)) return;
    for (const selector of rule.selectors) {
      let matches = false;
      try { matches = element.matches(selector); } catch { continue; }
      if (!matches) continue;
      const rank = specificity(selector);
      for (const declaration of rule.nodes) {
        if (declaration.type !== 'decl') continue;
        const property = declaration.prop === 'background-color' ? 'background' : declaration.prop;
        const importance = Number(Boolean(declaration.important));
        const previous = winners[property];
        if (!previous || importance > previous.importance || (importance === previous.importance && rank >= previous.rank)) {
          winners[property] = { value: declaration.value, importance, rank };
        }
      }
    }
  });
  return Object.fromEntries(Object.entries(winners).map(([property, { value }]) => [property, value]));
}
for (const theme of ['light', 'dark']) for (const mode of ['ask', 'auto']) for (const hasBoost of [false, true]) {
  dom.window.document.documentElement.className = theme;
  dom.window.document.documentElement.dataset.accent = 'noir';
  dom.window.document.documentElement.dataset.workspaceTheme = theme;
  dom.window.document.body.innerHTML = `<main class="workspace-ui"><div class="glass-dock"><div class="workspace-live-composer"><div class="ws-live-composer-bottom"><div class="ws-live-footer">${renderToStaticMarkup(WorkspaceChatWorkToggle({ mode, hasBoost, onToggle() {} }))}</div></div></div></div></main>`;
  const rail = dom.window.document.querySelector('.ws-mode-switch');
  for (const width of [320, 390, 768, 1024, 1440]) for (const coarse of [false, true]) for (const [order, sheets] of stylesheetCases) {
    const context = `${theme}/${mode}/Boost=${hasBoost}/${width}px/coarse=${coarse}/${order}`;
    const track = declarationsFor(rail, width, coarse, sheets);
    assert.equal(track['box-sizing'], 'border-box', context);
    assert.equal(track['border-radius'], '999px', `${context}: preserve the full outer pill`);
    assert.equal(track.padding, '3px', `${context}: equal inset on every side`);
    assert.equal(track.border, '1px solid var(--ws-line)', context);
    const height = Math.max(parseFloat(track.height), parseFloat(track['min-height']) || 0);
    const innerHeight = height - 2 * parseFloat(track.padding) - 2 * parseFloat(track.border);
    assert.equal(height, coarse ? 52 : 40, context);
    assert.equal(parseFloat(track['--ws-mode-edge-radius']), innerHeight / 2, `${context}: outside curves are concentric, not just rectangularly contained`);
    for (const button of rail.querySelectorAll('button')) {
      const segment = declarationsFor(button, width, coarse, sheets);
      assert.equal(segment['border-radius'], '12px', `${context}: center-facing corners are less round`);
      const outside = button === rail.firstElementChild ? 'left' : 'right';
      for (const edge of ['top', 'bottom']) assert.equal(segment[`border-${edge}-${outside}-radius`], 'var(--ws-mode-edge-radius)', `${context}: outside curve preserves the 4px rail inset`);
      assert.equal(segment.border, '0', context);
      assert.equal(segment.display, 'flex', context);
      assert.equal(segment['align-items'], 'center', `${context}: labels and Boost icon share the centerline`);
      assert.equal(segment['justify-content'], 'center', context);
      assert.ok(innerHeight >= (parseFloat(segment['min-height']) || 0), `${context}: segment fits without overflowing the track`);
      if (coarse) assert.ok(innerHeight >= 44, `${context}: preserve 44px touch targets`);
      if (button.getAttribute('aria-pressed') === 'true') {
        assert.equal(segment.background, 'var(--ws-hover)', `${context}: active selection follows the current theme`);
        assert.equal(segment['box-shadow'], 'none', `${context}: no legacy glow outside the inset`);
      }
    }
    const icon = declarationsFor(rail.querySelector('.ws-boost-icon'), width, coarse, sheets);
    assert.equal(icon.width, width <= 650 ? '15px' : '16px', context);
    assert.equal(icon.height, icon.width, context);
    assert.equal(icon.flex, 'none', `${context}: the Boost icon cannot shrink out of alignment`);
  }
}
dom.window.close();
console.log('PASS Chat/Work geometry/cascade contracts: light/dark, both modes and Boost states, 320–1440px, fine/coarse pointers, both source orders and actual production CSS order, centered content, preserved touch targets, and no overflow/glow. Safari visual verification remains separate.');
