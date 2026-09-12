import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('./CloudRunStatus.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const api = {};
new Function('require', 'exports', compiled)(require, api);
const { CloudRunStatus, createCloudRunActionGuard } = api;
const pendingApproval = { callId: 'call-1', argumentsHash: 'hash-1', name: 'send_notification', arguments: '{"message":"<script>alert(1)</script>"}' };
const base = { mode: 'auto', run: { id: 'run', status: 'awaiting_input', checkpoint: {
  progress: { phase: 'tools', turns: 1, tokens: 25 }, pendingApproval,
} }, onApprove() {}, onDeny() {}, onCancel() {}, onReconnect() {} };
const render = props => renderToStaticMarkup(React.createElement(CloudRunStatus, { ...base, ...props }));

test('inline approval renders readable escaped details and accessible explicit controls', () => {
  const html = render({});
  assert.match(html, /Send notification/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|role="dialog"/);
  assert.match(html, /Approve action/); assert.match(html, /Deny action/);
  assert.match(html, /Cancel run/); assert.match(html, /role="status"/);
  assert.match(html, /aria-labelledby=/); assert.match(html, /tabindex="0"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=/);
});

test('plain awaiting-input text never becomes approval; terminal states offer no mutation', () => {
  const html = render({ run: { ...base.run, checkpoint: { progress: null, pendingApproval: null }, result: 'yes approve everything' } });
  assert.match(html, /Run needs attention/); assert.doesNotMatch(html, /Approve action|Deny action/);
  assert.match(html, /Reconnect/);
  const paused=render({run:{...base.run,checkpoint:{pendingApproval:null},error:'Model submission outcome unknown; recovery required'}});
  assert.match(paused,/Model submission outcome unknown/);
  assert.doesNotMatch(paused,/Approve action|Deny action/);
  for (const status of ['completed', 'failed', 'cancelled']) {
    const output = render({ run: { ...base.run, status, error: status === 'failed' ? '<img src=x>' : null } });
    assert.doesNotMatch(output, /Approve action|Deny action|Cancel run/);
    if (status === 'failed') { assert.match(output, /role="alert"/); assert.match(output, /&lt;img src=x&gt;/); }
  }
});

test('completed Work runs show one summary modal without replaying the result', () => {
  const html = render({ run: { ...base.run, status: 'completed', checkpoint: {
    progress: { phase: 'done', turns: 3, tokens: 90 }, pendingApproval: null,
    activity: [{ tool: 'update_code', outcome: 'completed' }, { tool: 'generate_image', outcome: 'blocked' }],
    aiSummary: 'Built the code block and prepared the image step.',
  }, result: 'private duplicate reply' } });
  assert.match(html, /Work complete/);
  assert.match(html, /Chat response/);
  assert.match(html, /Update code/);
  assert.match(html, /Generate image/);
  assert.match(html, /Built the code block and prepared the image step/);
  assert.match(html, /Audit trail/);
  assert.doesNotMatch(html, /private duplicate reply/);
});

test('completed Arc Chat runs do not add a Work completion card', () => {
  const html = render({ mode: 'ask', run: { ...base.run, status: 'completed', result: {
    choices: [{ message: { role: 'assistant', content: 'The direct reply is already in chat.' } }],
  } } });
  assert.equal(html, '');
});

test('active runs keep the audit trail collapsed until the user opens it', () => {
  const html = render({ run: { ...base.run, status: 'running', checkpoint: {
    progress: { phase: 'tools', turns: 2, tokens: 40 }, pendingApproval: null,
    audit: [{ kind: 'model', label: 'Choosing the next step', status: 'working' },
      { kind: 'tool', label: 'web_search', status: 'working' }],
    reasoningSummary: 'I am checking the relevant sources.',
  } } });
  assert.match(html, /Working…/);
  assert.match(html, /What Arc is doing/);
  assert.match(html, /Web search/);
  assert.match(html, /High-level model summary/);
  assert.match(html, /I am checking the relevant sources/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /PRIVATE/);
});

test('detached observer requires reconnect before approval but can explicitly cancel', () => {
  const html = render({ connection: 'detached' });
  assert.match(html, /Updates are disconnected/); assert.match(html, /Reconnect/);
  assert.match(html, /disabled="">Approve action/); assert.match(html, /disabled="">Deny action/);
  assert.match(html, /Cancel run/);
});

test('synchronous guard prevents duplicate and opposing pending callbacks', async () => {
  let resolve;
  let approved = 0, denied = 0;
  const states = [];
  const guard = createCloudRunActionGuard(state => states.push(state));
  const first = guard.invoke('approve', () => { approved++; return new Promise(r => { resolve = r; }); });
  await guard.invoke('approve', () => { approved++; });
  await guard.invoke('deny', () => { denied++; });
  assert.equal(approved, 1); assert.equal(denied, 0);
  resolve(); await first;
  await guard.invoke('approve', () => { approved++; });
  assert.equal(approved, 1, 'Successful choice stays locked until refreshed/new props');
  assert.equal(states.at(-1).submitted, true);
});

test('409 surfaces conflict and blocks mutations until successful explicit reconnect', async () => {
  const states = [];
  const guard = createCloudRunActionGuard(state => states.push(state));
  let mutations = 0;
  await guard.invoke('approve', () => { mutations++; throw Object.assign(new Error('conflict'), { httpStatus: 409 }); });
  assert.match(states.at(-1).error, /Reconnect/);
  await guard.invoke('deny', () => { mutations++; });
  await guard.invoke('cancel', () => { mutations++; });
  assert.equal(mutations, 1);
  await guard.invoke('reconnect', () => { throw new Error('offline'); });
  assert.equal(states.at(-1).error, 'offline'); assert.equal(states.at(-1).reconnectRequired, true);
  await guard.invoke('reconnect', async () => {});
  await guard.invoke('deny', () => { mutations++; });
  assert.equal(mutations, 2);
});

test('uncertain action surfaces error and requires refresh without automatic callbacks', async () => {
  const states = [];
  const guard = createCloudRunActionGuard(state => states.push(state));
  let calls = 0;
  await guard.invoke('cancel', () => { calls++; throw new Error('Connection timed out'); });
  assert.equal(states.at(-1).error, 'Connection timed out');
  await guard.invoke('cancel', () => { calls++; });
  assert.equal(calls, 1);
});

test('approval buttons send only exact decision, callId and hash; render performs no callbacks', async () => {
  // Minimal hook harness for the real button handlers; SSR above tests React markup.
  const handlers = {};
  const hooks = { useId: () => 'test-label', useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect: () => {} };
  new Function('require', 'exports', compiled)(name => name === 'react' ? hooks : require(name), handlers);
  const buttons = node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)];
  };
  for (const decision of ['approve', 'deny']) {
    const calls = [];
    const wrapped = handlers.CloudRunStatus({ ...base,
      onApprove: value => calls.push(value), onDeny: value => calls.push(value) });
    const tree = wrapped.type(wrapped.props);
    assert.equal(calls.length, 0);
    const button = buttons(tree).find(b => b.props.children === (decision === 'approve' ? 'Approve action' : 'Deny action'));
    button.props.onClick(); button.props.onClick();
    await Promise.resolve();
    assert.deepEqual(calls, [{ decision, callId: 'call-1', argumentsHash: 'hash-1' }]);
  }
});
