// Compare the extracted presentation against an explicit pre-extraction revision.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const base = process.argv[2];
assert.ok(base, 'Explicit baseline required');
const previous = cp.execFileSync('git', ['show', `${base}:src/components/ChatInput.tsx`], { encoding: 'utf8' });
const block = previous.slice(previous.indexOf('      {/* Detailed Limits Modal */}'), previous.indexOf('\n      {canGenerateVideo', previous.indexOf('      {/* Detailed Limits Modal */}')));
const expression = block.slice(block.indexOf('      {createPortal(') + 7).trim().slice(0, -1);
function load(source) {
 const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
 const module = { exports: {} };
 new Function('require', 'module', 'exports', js)(name => name === 'react-dom' ? { createPortal: element => element } : require(name), module, module.exports);
 return module.exports;
}
global.document = { body: {} };
const { Before } = load(`import {createPortal} from 'react-dom'; import {motion,AnimatePresence} from 'framer-motion'; import {X,Sparkles} from 'lucide-react'; export function Before({showLimitsModal,isBoostTier,hasBoost,dailyImagesUsed,setShowLimitsModal,navigate,openCheckout}) { return ${expression}; }`);
const { ComposerOverlays } = load(fs.readFileSync('src/components/chat-input/ComposerOverlays.tsx', 'utf8'));
const noop = () => {};
for (const showLimitsModal of [false, true]) for (const [isBoostTier, hasBoost] of [[false,false],[true,true],[true,false]]) for (const dailyImagesUsed of [0,2,3]) {
 const props = { showLimitsModal, isBoostTier, hasBoost, dailyImagesUsed };
 assert.equal(renderToStaticMarkup(React.createElement(ComposerOverlays, {...props,onClose:noop,onSettings:noop,onUpgrade:noop})),renderToStaticMarkup(React.createElement(Before,{...props,setShowLimitsModal:noop,navigate:noop,openCheckout:noop})));
}
const composer = fs.readFileSync('src/components/ChatInput.tsx','utf8');
assert.ok(composer.includes('onClose={() => setShowLimitsModal(false)}'));
assert.ok(composer.includes('onSettings={() => navigate("/dashboard/settings")}'));
assert.ok(composer.includes('onUpgrade={() => openCheckout()}'));
console.log('Composer overlay parity passed: 18 identical rendered states, owner callbacks retained.');
