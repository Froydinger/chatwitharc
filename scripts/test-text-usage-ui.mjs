import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const snapshot = (pool = 'sol', overrides = {}) => ({ pool, tier: 'free', enforcementEnabled: true, configured: true, adminUncapped: false,
  daily: { usagePercent: 37.8, spentNanos: 1230000, limitNanos: 9990000, resetsAt: '2026-10-11T00:00:00Z' },
  monthly: { usagePercent: 12, spentNanos: 4500000, limitNanos: 25000000, resetsAt: '2026-11-01T00:00:00Z' }, ...overrides });
let owner = 'alice', calls = [], rpcHandler = async (_name, { pool_name }) => ({ data: snapshot(pool_name), error: null });
const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
  rpc: async (...args) => { calls.push(args); return rpcHandler(...args); } };
const listeners = new Set();
const window = { dispatchEvent: event => { for (const listener of listeners) listener(event); } };
const service = {};
new Function('exports', 'supabase', 'window', compile(read('src/services/arcTextUsage.ts').replace(/^import .*;\n/gm, '')))(service, supabase, window);
const normalized = service.normalizeTextUsage(snapshot(), 'sol');
assert.deepEqual(Object.keys(normalized.daily).sort(), ['resetsAt', 'usagePercent']);
assert.equal(service.visibleTextUsageWindows(normalized).length, 2);
assert.deepEqual(service.visibleTextUsageWindows(service.normalizeTextUsage(snapshot('sol', { configured: false }), 'sol')), []);
assert.deepEqual(service.visibleTextUsageWindows(service.normalizeTextUsage(snapshot('sol', { enforcementEnabled: false }), 'sol')), []);
assert.deepEqual(service.visibleTextUsageWindows(service.normalizeTextUsage(snapshot('sol', { adminUncapped: true }), 'sol')), []);
assert.equal(service.normalizeTextUsage(snapshot('astra'), 'sol'), null);
const hidden = service.normalizeTextUsage(snapshot('sol', { daily: { usagePercent: null }, monthly: { usagePercent: Infinity } }), 'sol');
assert.equal(service.visibleTextUsageWindows(hidden).length, 0);

// Concurrent dashboard/picker consumers share one owner-scoped read.
const [first, second] = await Promise.all([service.readTextUsage('alice', 'sol'), service.readTextUsage('alice', 'sol')]);
assert.deepEqual(first, second); assert.equal(calls.length, 1);
await service.readTextUsage('alice', 'sol'); assert.equal(calls.length, 1);
let events = 0; listeners.add(event => { assert.equal(event.type, 'arc-text-usage-changed'); events++; });
service.notifyTextUsageChanged(); await service.readTextUsage('alice', 'sol');
assert.equal(events, 1); assert.equal(calls.length, 2);
await service.readTextUsage('alice', 'astra'); assert.equal(calls.at(-1)[1].pool_name, 'astra');

// An in-flight prior account read cannot populate the new account's cache.
let release;
rpcHandler = async (_name, { pool_name }) => new Promise(resolve => { release = () => resolve({ data: snapshot(pool_name), error: null }); });
const late = service.readTextUsage('alice', 'sol', true);
await new Promise(resolve => setTimeout(resolve, 0));
owner = 'bob'; service.setTextUsageOwner('bob'); release();
assert.equal(await late, null);
rpcHandler = async (_name, { pool_name }) => ({ data: snapshot(pool_name, { tier: 'boost', monthly: { usagePercent: 63 } }), error: null });
const next = await service.readTextUsage('bob', 'sol'); assert.equal(next.monthly.usagePercent, 63);
owner = null; service.setTextUsageOwner(null);
const beforeAnonymous = calls.length; assert.equal(await service.readTextUsage('bob', 'sol', true), null);
assert.equal(calls.length, beforeAnonymous, 'No RPC when the actual session belongs to another owner');

const meter = {};
new Function('exports', 'require', 'visibleTextUsageWindows', 'cn', compile(read('src/components/TextUsageMeters.tsx').replace(/^import .*;\n/gm, '')))(meter, require, service.visibleTextUsageWindows, (...v) => v.filter(Boolean).join(' '));
const render = data => renderToStaticMarkup(React.createElement(meter.TextUsageMeters, { name: 'GPT 6.1 Sol', snapshot: data }));
const html = render(normalized);
assert.ok(html.includes('38% used') && html.includes('12% used'));
assert.ok(html.includes('aria-valuenow="38"'));
assert.equal(html.includes('1230000') || html.includes('9990000') || html.includes('$'), false);
assert.equal(render(service.normalizeTextUsage(snapshot('sol', { enforcementEnabled: false }), 'sol')), '');
assert.equal(render(service.normalizeTextUsage(snapshot('sol', { configured: false }), 'sol')), '');
const uncapped = render(service.normalizeTextUsage(snapshot('sol', { tier: 'admin', adminUncapped: true }), 'sol'));
assert.ok(uncapped.includes('Uncapped')); assert.equal(uncapped.includes('progressbar'), false);

const pricing = read('src/pages/PricingPage.tsx');
const ast = ts.createSourceFile('PricingPage.tsx', pricing, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let tile;
const walk = node => {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === 'data-testid' && prop.initializer?.getText(ast) === '"boost-pro-preview"')) tile = node;
  ts.forEachChild(node, walk);
}; walk(ast); assert.ok(tile);
const Tile = new Function('exports', 'require', 'GlassCard', compile(`return () => (${tile.getText(ast)});`))({}, require, ({ children, ...props }) => React.createElement('div', props, children));
const tileHtml = renderToStaticMarkup(React.createElement(Tile));
assert.equal(tileHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 'Boost Pro Coming soon');
assert.equal(/\$|<button|<a\b|checkout/i.test(tileHtml), false);
assert.ok(tileHtml.includes('aspect-[2/1]') && tileHtml.includes('-rotate-[26.565deg]'), 'Banner follows the tile diagonal');
for (const file of ['src/components/PlanUsageBreakdown.tsx', 'src/components/dashboard/UsageSnapshotWidget.tsx', 'src/pages/DashboardPage.tsx']) {
  assert.ok(read(file).includes('TextUsageMeters'));
  assert.equal(/Arc Think|Arc Flash|flashUsagePercent/.test(read(file)), false);
}
console.log('PASS text usage UI: real percentage-only RPC, deduplicated reads, owner isolation, refresh events, off/unconfigured/admin meter guards, and name-only diagonal Boost Pro preview.');
