import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild-wasm';

// Core checks need only existing dependencies. For real React commit/unmount
// tests, add --lifecycle and point METAL_FX_TEST_TOOLS at an isolated npm prefix
// containing react-test-renderer@18.3.1. No app/auth/provider code is imported.
const temporary = await mkdtemp(path.resolve('.metal-fx-test-'));
const originals = new Map(['document', 'OffscreenCanvas', 'requestAnimationFrame', 'cancelAnimationFrame', '__metalFxFixture'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
let sequence = 0;

function environment({ offscreen = false, dom = true, twoD = true, lost = false, throws = false, extensionThrows = false } = {}) {
  const calls = [], canvases = [];
  let released = 0;
  const context = {
    isContextLost: () => lost,
    getExtension(name) {
      assert.equal(name, 'WEBGL_lose_context');
      if (extensionThrows) throw new Error('Extension unavailable');
      return { loseContext() { released += 1; } };
    },
  };
  const create = kind => {
    const canvas = { width: 1, height: 1, getContext(type, attributes) {
      calls.push({ kind, type, attributes });
      if (throws) throw new Error('Canvas policy denied');
      if (type === '2d') return twoD ? {} : null;
      if (kind === 'offscreen') return offscreen === 'supported' ? context : null;
      return dom === 'experimental' ? (type === 'experimental-webgl' ? context : null) : dom ? context : null;
    } };
    canvases.push(canvas);
    return canvas;
  };
  setGlobal('document', { createElement(name) { assert.equal(name, 'canvas'); return create('dom'); } });
  setGlobal('OffscreenCanvas', offscreen ? class {
    constructor(width, height) {
      assert.equal(width, 1); assert.equal(height, 1);
      if (offscreen === 'throws') throw new Error('Canvas constructor denied');
      return create('offscreen');
    }
  } : undefined);
  return { calls, canvases, get released() { return released; } };
}

try {
  const output = path.join(temporary, 'fallback.mjs');
  await build({
    entryPoints: ['src/components/ui/safe-metal-fx.tsx'],
    bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: output,
    alias: { '@': path.resolve('src') }, jsx: 'automatic',
    plugins: [{ name: 'isolated-metal-fx', setup(builder) {
      builder.onResolve({ filter: /^metal-fx$/ }, () => ({ path: 'metal-fx', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: `import React from 'react';
          export const MetalFx = React.forwardRef((props, ref) => {
            const fixture = globalThis.__metalFxFixture;
            const fail = phase => {
              if (fixture?.phase === phase && (!fixture.target || fixture.target === props.id)) throw fixture.error;
            };
            fail('render');
            React.useLayoutEffect(() => {
              fail('layout');
              if (fixture) fixture.mounted++;
              return () => { if (fixture) fixture.cleaned++; };
            }, []);
            React.useEffect(() => { fail('effect'); }, []);
            return React.createElement('div', { ref, id: props.id, 'data-live-metal-fx': true,
              'data-strength': props.strength, 'data-paused': props.paused, className: props.className,
              style: props.style, onClick: props.onClick }, props.children);
          });`,
        loader: 'js', resolveDir: process.cwd(),
      }));
      builder.onLoad({ filter: /safe-metal-fx\.tsx$/ }, async ({ path: file }) => ({
        contents: `${await readFile(file, 'utf8')}\nexport { MetalFxBoundary as TestBoundary };\nexport * from '@/lib/metalFxSupport';`,
        loader: 'tsx', resolveDir: path.dirname(file),
      }));
      builder.onLoad({ filter: /metalFxSupport\.ts$/ }, async ({ path: file }) => ({
        contents: `${await readFile(file, 'utf8')}\nexport const testListenerCount = () => listeners.size;`,
        loader: 'ts', resolveDir: path.dirname(file),
      }));
    } }],
  });
  const fresh = () => import(`${pathToFileURL(output).href}?case=${sequence++}`);
  const probe = await fresh();

  setGlobal('document', undefined);
  setGlobal('OffscreenCanvas', undefined);
  assert.equal(probe.detectMetalFxSupport(), false);
  probe.checkMetalFxSupport();
  assert.equal(probe.getMetalFxSupport(), false, 'SSR does not attempt GPU initialization');

  let browser = environment();
  assert.equal(probe.detectMetalFxSupport(), true);
  assert.deepEqual(browser.calls, [
    { kind: 'dom', type: '2d', attributes: { alpha: true } },
    { kind: 'dom', type: 'webgl', attributes: { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true } },
  ]);
  assert.equal(browser.released, 1);
  assert.ok(browser.canvases.every(canvas => canvas.width === 0 && canvas.height === 0), 'Detached probe buffers are released');

  browser = environment({ offscreen: 'supported' });
  assert.equal(probe.detectMetalFxSupport(), true);
  assert.deepEqual(browser.calls[1], { kind: 'offscreen', type: 'webgl', attributes: { alpha: true, premultipliedAlpha: false, antialias: false } });
  assert.equal(browser.released, 1);
  for (const options of [
    { offscreen: 'unsupported', dom: true }, { offscreen: 'throws' }, { dom: false },
    { throws: true }, { twoD: false }, { lost: true }, { offscreen: 'supported', lost: true },
  ]) {
    browser = environment(options);
    assert.equal(probe.detectMetalFxSupport(), false, JSON.stringify(options));
    assert.ok(browser.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
    if (options.offscreen) assert.ok(!browser.calls.some(call => call.kind === 'dom' && call.type === 'webgl'), 'Never use a different renderer than the package');
  }
  browser = environment({ dom: 'experimental' });
  assert.equal(probe.detectMetalFxSupport(), true);
  assert.equal(browser.calls.at(-1).type, 'experimental-webgl');
  browser = environment({ extensionThrows: true });
  assert.equal(probe.detectMetalFxSupport(), true, 'Best-effort cleanup must not mask a supported context');
  assert.ok(browser.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));

  browser = environment();
  let notifications = 0;
  const unsubscribe = probe.subscribeMetalFxSupport(() => notifications++);
  probe.checkMetalFxSupport();
  assert.equal(probe.getMetalFxSupport(), true, 'An SSR check never poisons browser support');
  const count = browser.canvases.length;
  for (let i = 0; i < 10; i++) probe.checkMetalFxSupport();
  assert.equal(browser.canvases.length, count, 'All consumers share one probe');
  assert.equal(notifications, 1);
  unsubscribe();
  assert.equal(probe.testListenerCount(), 0);

  const props = {
    id: 'offline-decoration', className: 'liquid-metal-overlay', preset: 'silver', strength: 0.28,
    paused: true, normalizeHostStyles: false, borderRadius: 9999, theme: 'light',
    style: { width: '100%', height: '100%', position: 'absolute', inset: 0 },
    children: React.createElement('button', { type: 'button' }, 'Content remains'),
  };
  // Even if another render populated the cache, SSR uses the hydration-safe snapshot.
  const fallback = renderToStaticMarkup(React.createElement(probe.SafeMetalFx, props));
  assert.match(fallback, /data-metal-fx-fallback="true"/);
  assert.match(fallback, /id="offline-decoration"/);
  assert.match(fallback, /class="metal-fx-fallback liquid-metal-overlay"/);
  assert.match(fallback, /border-radius:9999px/);
  assert.match(fallback, /width:100%;height:100%;/);
  assert.match(fallback, /class="metal-fx-content"/);
  assert.match(fallback, /<button type="button">Content remains<\/button>/);
  assert.match(fallback, /pointer-events:none/);
  assert.doesNotMatch(fallback, /<canvas|data-live-metal-fx|preset=|strength=|paused=|normalizeHostStyles=/);

  const known = [
    'metal-fx: WebGL not supported', 'metal-fx: canvas 2D context unavailable',
    'metal-fx: shader compile failed: fixture', 'metal-fx: program link failed: fixture',
    'metal-fx: gl.createShader returned null', 'metal-fx: gl.createProgram returned null',
    'metal-fx: gl.createBuffer returned null',
  ];
  for (const message of known) {
    const error = new Error(message);
    assert.equal(probe.isMetalFxInitializationError(error), true);
    assert.deepEqual(probe.TestBoundary.getDerivedStateFromError(error), { failed: true });
  }
  for (const error of [new Error('Application bug'), new Error('metal-fx: unrelated bug'), new Error('metal-fx: WebGL not supported by this application'), 'metal-fx: WebGL not supported', null]) {
    assert.equal(probe.isMetalFxInitializationError(error), false);
    assert.throws(() => probe.TestBoundary.getDerivedStateFromError(error), actual => actual === error);
  }
  probe.disableMetalFx();
  probe.checkMetalFxSupport();
  assert.equal(probe.getMetalFxSupport(), false);
  assert.equal(browser.canvases.length, count, 'Failed initialization is not retried by later consumers');
  assert.equal(notifications, 1, 'Unsubscribed listeners are released');

  for (const file of ['src/components/MobileChatApp.tsx', 'src/components/VoiceModeOverlay.tsx', 'src/components/ui/liquid-metal-overlay.tsx', 'src/pages/DashboardPage.tsx']) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /import \{ SafeMetalFx as MetalFx \} from "@\/components\/ui\/safe-metal-fx";/, file);
    assert.doesNotMatch(source, /import \{[^}]*\bMetalFx\b[^}]*\} from "metal-fx"/, file);
  }
  console.log('PASS core: Offscreen/DOM/2D parity, lost/blocked contexts, probe cleanup/cache, SSR markup, exact error classification, imports.');

  // Characterize the real installed library's shared renderer and loss/restore
  // lifecycle using fake canvas APIs. This performs no GPU or browser work.
  setGlobal('document', undefined);
  setGlobal('OffscreenCanvas', undefined);
  const actual = await import('metal-fx');
  const frames = new Map(), sharedCanvases = [];
  let frameId = 0, draws = 0, copies = 0, releases = 0, bitmapCloses = 0, deletedPrograms = 0, deletedBuffers = 0;
  setGlobal('requestAnimationFrame', callback => { frames.set(++frameId, callback); return frameId; });
  setGlobal('cancelAnimationFrame', id => frames.delete(id));
  const gl = new Proxy({
    createShader: () => ({}), getShaderParameter: () => true,
    createProgram: () => ({}), getProgramParameter: () => true,
    createBuffer: () => ({}), getAttribLocation: () => 0, getUniformLocation: () => null,
    drawArrays: () => draws++, deleteProgram: () => deletedPrograms++, deleteBuffer: () => deletedBuffers++,
    getExtension: () => ({ loseContext() { releases++; } }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  setGlobal('OffscreenCanvas', class {
    constructor(width, height) { this.width = width; this.height = height; this.events = new Map(); sharedCanvases.push(this); }
    getContext() { return gl; }
    addEventListener(name, callback) { this.events.set(name, callback); }
    transferToImageBitmap() { return { close() { bitmapCloses++; } }; }
  });
  const makeInstance = () => actual.createInstance({
    hostCanvas: { width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) },
    cssWidth: 100, cssHeight: 40, cornerRadius: 20, kind: 'pill', onFirstCopy: () => copies++,
  });
  const first = makeInstance(), second = makeInstance();
  assert.equal(sharedCanvases.length, 1, 'Real library shares one renderer across instances');
  const tick = () => {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id); callback(performance.now() + 1000);
  };
  tick();
  assert.equal(copies, 2);
  let prevented = false;
  sharedCanvases[0].events.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  const beforeLoss = draws;
  tick();
  assert.equal(prevented, true);
  assert.equal(draws, beforeLoss, 'Live loss pauses the upstream renderer');
  assert.equal(frames.size, 0);
  sharedCanvases[0].events.get('webglcontextrestored')();
  assert.equal(frames.size, 1, 'Successful native restoration resumes the renderer');
  actual.destroyInstance(first);
  assert.equal(releases, 0, 'Other live instances retain the shared renderer');
  actual.destroyInstance(second);
  assert.equal(frames.size, 0);
  assert.equal(releases, 1);
  assert.equal(bitmapCloses, 1);
  assert.equal(deletedPrograms, 1);
  assert.equal(deletedBuffers, 1);
  console.log('PASS installed metal-fx: shared context, first copy, live loss/restore, last-instance RAF/bitmap/GL cleanup.');

  if (process.argv.includes('--lifecycle')) {
    const require = createRequire(import.meta.url);
    const testRequire = process.env.METAL_FX_TEST_TOOLS
      ? createRequire(path.resolve(process.env.METAL_FX_TEST_TOOLS, 'package.json')) : require;
    // An isolated test prefix must share the app's React singleton with the renderer.
    const isolatedReact = testRequire.resolve('react');
    const savedReact = testRequire.cache[isolatedReact];
    testRequire.cache[isolatedReact] = require.cache[require.resolve('react')];
    const { act, create } = testRequire('react-test-renderer');
    const originalConsoleError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    const roots = new Set();
    const mount = element => {
      let root;
      act(() => { root = create(element, { createNodeMock: element => ({ id: element.props.id, type: element.type }) }); });
      roots.add(root);
      return root;
    };
    const unmount = root => { act(() => root.unmount()); roots.delete(root); };
    const fixtures = [];
    const fixture = (phase, error, target) => {
      const state = { phase, error, target, mounted: 0, cleaned: 0 };
      fixtures.push(state); setGlobal('__metalFxFixture', state); return state;
    };
    class ApplicationBoundary extends React.Component {
      state = { error: null };
      static getDerivedStateFromError(error) { return { error }; }
      render() { return this.state.error ? React.createElement('output', { 'data-app-error': true }, this.state.error.message) : this.props.children; }
    }
    const countNodes = (root, property) => root.root.findAll(node => node.props[property] === true || node.props[property] === 'true').length;
    try {
      browser = environment({ offscreen: 'unsupported' });
      let module = await fresh();
      let state = fixture();
      let root = mount(React.createElement(module.SafeMetalFx, props));
      assert.equal(countNodes(root, 'data-metal-fx-fallback'), 1);
      assert.equal(state.mounted, 0, 'Unsupported mode never mounts the GPU library');
      unmount(root);
      assert.equal(module.testListenerCount(), 0);

      browser = environment(); module = await fresh(); state = fixture();
      const ref = React.createRef();
      const onClick = () => {};
      root = mount(React.createElement(React.StrictMode, null, React.createElement(module.SafeMetalFx, { ...props, ref, onClick })));
      assert.equal(countNodes(root, 'data-live-metal-fx'), 1);
      assert.equal(root.root.findByProps({ 'data-live-metal-fx': true }).props['data-strength'], 0.28);
      assert.equal(root.root.findByProps({ 'data-live-metal-fx': true }).props['data-paused'], true);
      assert.equal(root.root.findByProps({ 'data-live-metal-fx': true }).props.onClick, onClick);
      assert.equal(ref.current.id, props.id);
      assert.equal(browser.canvases.length, 2);
      unmount(root);
      assert.equal(ref.current, null);
      assert.equal(state.mounted, state.cleaned);
      assert.equal(module.testListenerCount(), 0);
      root = mount(React.createElement(module.SafeMetalFx, props));
      assert.equal(browser.canvases.length, 2, 'Remount does not allocate another probe');
      unmount(root);
      assert.equal(state.mounted, state.cleaned);

      // Real React commit errors, not direct calls to the boundary's class methods.
      for (const phase of ['render', 'layout', 'effect']) {
        for (const message of known) {
          environment(); module = await fresh(); state = fixture(phase, new Error(message));
          root = mount(React.createElement(ApplicationBoundary, null, React.createElement(module.SafeMetalFx, props)));
          assert.equal(countNodes(root, 'data-metal-fx-fallback'), 1, `${phase}: ${message}`);
          assert.equal(countNodes(root, 'data-app-error'), 0);
          assert.equal(module.getMetalFxSupport(), false);
          unmount(root);
          assert.equal(state.mounted, state.cleaned, `${phase}: cleanup`);
          assert.equal(module.testListenerCount(), 0);
        }
      }

      environment(); module = await fresh(); state = fixture('layout', new Error(known[0]), 'inner');
      root = mount(React.createElement(ApplicationBoundary, null,
        React.createElement(module.SafeMetalFx, { ...props, id: 'outer' },
          React.createElement(module.SafeMetalFx, { ...props, id: 'inner' }))));
      assert.equal(countNodes(root, 'data-metal-fx-fallback'), 2, 'Nested boundaries settle to static without a recovery loop');
      assert.equal(countNodes(root, 'data-app-error'), 0);
      assert.equal(countNodes(root, 'data-live-metal-fx'), 0);
      assert.equal(state.mounted, state.cleaned, 'A shared failure tears down healthy sibling/parent effects too');
      unmount(root);
      assert.equal(module.testListenerCount(), 0);

      for (const phase of ['render', 'layout', 'effect']) {
        environment(); module = await fresh(); fixture(phase, new Error('Application bug'));
        root = mount(React.createElement(ApplicationBoundary, null, React.createElement(module.SafeMetalFx, props)));
        assert.equal(countNodes(root, 'data-app-error'), 1, `Unrelated ${phase} errors reach the application boundary`);
        assert.equal(module.getMetalFxSupport(), true, 'Unrelated failures do not disable decoration support');
        unmount(root);
      }
      assert.ok(fixtures.every(item => item.mounted === item.cleaned));
      console.log('PASS React lifecycle: supported pass-through/ref/events, unsupported zero mounts, all known render/layout/effect failures, nested boundaries, unrelated propagation, remount cache and subscription/resource cleanup.');
    } finally {
      for (const root of roots) act(() => root.unmount());
      console.error = originalConsoleError;
      if (savedReact) testRequire.cache[isolatedReact] = savedReact; else delete testRequire.cache[isolatedReact];
    }
  } else {
    console.log('Lifecycle checks not requested; run with --lifecycle and react-test-renderer@18.3.1 for real React mount/unmount coverage.');
  }
} finally {
  for (const [key, original] of originals) {
    if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key];
  }
  await rm(temporary, { recursive: true, force: true });
}
