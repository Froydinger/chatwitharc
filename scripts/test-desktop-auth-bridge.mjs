import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const routing = require('../desktop/arcai/auth-routing.js');
const path = new URL('../desktop/arcai/main.js', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const ast = ts.createSourceFile('main.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['startDesktopAuthBridge', 'openGoogleOAuthInSafari'];
const functions = names.map(name => {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, `Production function ${name} exists`);
  return node.getText(ast);
}).join('\n');
let now = 1_000_000;
let handler;
const forwarded = [];
const launches = [];
const pending = new Map();
const context = vm.createContext({
  ...routing, crypto, URL, Date: { now: () => now },
  pendingAuthBridgeNonces: pending, authServer: null,
  ARC_URL: 'https://askarc.chat', DESKTOP_AUTH_PORT: 48879,
  console: { log() {}, error() {} },
  loadAuthCallbackInApp: href => forwarded.push(href),
  http: { createServer(fn) {
    handler = fn;
    return { listen(port, host) { assert.equal(port, 48879); assert.equal(host, '127.0.0.1'); }, on() {} };
  } },
  spawn(command, args, options) {
    assert.equal(command, '/usr/bin/open');
    assert.deepEqual(Array.from(args).slice(0, 3), ['-a', 'Safari', '--']);
    assert.equal(options.detached, true);
    assert.equal(options.stdio, 'ignore');
    const launch = { url: args[3], error: null };
    launches.push(launch);
    return { once(event, fn) { assert.equal(event, 'error'); launch.error = fn; }, unref() {} };
  },
});
vm.runInContext(functions, context);
context.startDesktopAuthBridge();
const oauth = new URL('https://auth.askarc.chat/auth/v1/authorize');
oauth.searchParams.set('provider', 'google');
oauth.searchParams.set('redirect_to', 'https://askarc.chat/desktop-auth-callback?port=48879');
function start() {
  context.openGoogleOAuthInSafari(oauth.toString());
  const launch = launches.at(-1);
  const callback = new URL(new URL(launch.url).searchParams.get('redirect_to'));
  const nonce = callback.searchParams.get('bridge_nonce');
  assert.ok(pending.has(nonce), 'Actual OAuth start stores pending nonce');
  assert.equal(callback.searchParams.get('transport'), 'loopback-get');
  return { callback, nonce, launch };
}
function request(callback, nonce, host = '127.0.0.1:48879') {
  const query = new URLSearchParams({ href: callback.toString(), nonce });
  const response = { status: null, headers: {}, body: '' };
  handler({ method: 'GET', url: '/auth-callback?' + query, headers: { host } }, {
    writeHead(status, headers) { response.status = status; response.headers = headers; },
    end(body) { response.body = body; },
  });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Referrer-Policy'], 'no-referrer');
  return response;
}
for (const result of [{ code: 'dummy-test-code' }, { error: 'access_denied' }]) {
  const { callback, nonce } = start();
  Object.entries(result).forEach(([key, value]) => callback.searchParams.set(key, value));
  const count = forwarded.length;
  assert.equal(request(callback, nonce).status, 200);
  assert.equal(forwarded.length, count + 1, 'Valid callback forwarded once');
  assert.equal(forwarded.at(-1), callback.toString());
  assert.equal(pending.has(nonce), false, 'Nonce consumed before callback is forwarded');
  assert.equal(request(callback, nonce).status, 400, 'Replay rejected');
  assert.equal(forwarded.length, count + 1);
}
{
  const { callback, nonce } = start();
  callback.searchParams.set('code', 'dummy-test-code');
  const count = forwarded.length;
  assert.equal(request(callback, nonce, 'localhost:48879').status, 400, 'Host must be exact loopback host');
  assert.equal(pending.has(nonce), true, 'Wrong host cannot consume valid nonce');
  const unknown = crypto.randomBytes(32).toString('base64url');
  assert.equal(request(callback, unknown).status, 400, 'Mismatched nonce rejected');
  assert.equal(pending.has(nonce), true);
  const unknownCallback = new URL(callback); unknownCallback.searchParams.set('bridge_nonce', unknown);
  assert.equal(request(unknownCallback, unknown).status, 400, 'Unknown matching nonce rejected');
  assert.equal(pending.has(nonce), true);
  assert.equal(forwarded.length, count, 'Invalid requests never forwarded');
  now += 10 * 60 * 1000 + 1;
  assert.equal(request(callback, nonce).status, 400, 'Expired nonce rejected');
  assert.equal(pending.has(nonce), false, 'Expired nonce removed');
  assert.equal(forwarded.length, count);
}
{
  const { nonce, launch } = start();
  launch.error(new Error('Mock Safari launch failure'));
  assert.equal(pending.has(nonce), false, 'Failed Safari launch removes pending nonce');
}
console.log('PASS: actual desktop bridge OAuth start, code/error return, single use, replay, expiry, host/nonce guards, safe headers and launch failure');
