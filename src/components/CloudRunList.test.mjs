import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const compile = async name => ts.transpileModule(await readFile(new URL(name, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const status = {}, list = {};
new Function('require', 'exports', await compile('./CloudRunStatus.tsx'))(require, status);
new Function('require', 'exports', await compile('./CloudRunList.tsx'))(
  name => name === './CloudRunStatus' ? status : require(name), list);
const noCalls = () => { throw Error('Rendering must not trigger network actions'); };
const render = overrides => renderToStaticMarkup(React.createElement(list.CloudRunList, {
  sessionId: 'selected', cloud: { entries: [], error: null, restoring: false, activeCursor: null,
    restore: noCalls, respond: noCalls, cancel: noCalls, reconnect: noCalls, loadMore: noCalls, ...overrides },
}));
test('inactive list is inert and completed replies are not duplicated', () => {
  assert.equal(render({}), '');
  const html = render({ entries: [{ id: 'done', sessionId: 'selected', run: { id: 'done', status: 'completed', result: 'secret duplicate reply' } }] });
  assert.doesNotMatch(html, /secret duplicate reply|Cancel run/);
});
test('completed-reply reload errors retain a visible recovery action', () => {
  const html = render({ error: '<script>reload failed</script>', entries: [
    { id: 'done', sessionId: 'selected', run: { id: 'done', status: 'completed' } },
  ] });
  assert.match(html, /Reconnect and reload replies/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(render({ error: 'failed', restoring: true }), /disabled=""/);
});
test('uncertain submission is not described as accepted or complete', () => {
  const html = render({ entries: [{ id: 'uncertain', sessionId: 'selected', connection: 'uncertain' }] });
  assert.match(html, /Submission not confirmed/); assert.match(html, /Check status/);
  assert.doesNotMatch(html, /Submitting to the cloud|Cancel run/);
});
test('other-session requests are excluded and active discovery exposes pagination', () => {
  const html = render({ activeCursor: 'more', entries: [{ id: 'other', sessionId: 'other', connection: 'uncertain', error: 'other private request' }] });
  assert.match(html, /Load more active requests/);
  assert.doesNotMatch(html, /other private request/);
  const withLocal = render({ activeCursor: 'more', entries: [{ id: 'local', sessionId: 'selected', connection: 'uncertain' }] });
  assert.match(withLocal, /Load more active requests/);
});
test('completed history is recoverable even without active requests', () => {
  const html = render({ historyCursor: 'older', activeCursor: null });
  assert.match(html, /Recover older cloud replies/);
  assert.doesNotMatch(html, /Load more active requests/);
});
