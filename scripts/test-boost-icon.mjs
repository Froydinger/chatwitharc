import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync('src/components/BoostIcon.tsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const output = { exports: {} };
new Function('module', 'exports', 'require', code)(output, output.exports, createRequire(import.meta.url));
const { BoostIcon } = output.exports;
for (const hasBoost of [false, true]) {
  const html = renderToStaticMarkup(createElement(BoostIcon, { hasBoost, className: 'h-3.5 w-3.5 shrink-0' }));
  assert.ok(html.includes(hasBoost ? 'lucide-circle-arrow-up' : 'lucide-circle-fading-arrow-up'));
  assert.ok(html.includes(`aria-label="${hasBoost ? 'Boost active' : 'Get Boost'}"`));
  assert.ok(html.includes('shrink-0'));
}
const custom = renderToStaticMarkup(createElement(BoostIcon, { hasBoost: true, 'aria-label': 'Work includes Boost' }));
assert.ok(custom.includes('aria-label="Work includes Boost"'));
console.log('PASS BoostIcon: exact entitlement-state icons, accessible labels, optional label override and preserved size classes.');
