import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

// Offline rendering of the production picker and persisted store. This checks
// model labels, selection/tier behavior and edit shape controls, not browser layout.
const built = await build({
  stdin: {
    contents: `import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server.browser';
      import { ImageOptionsContent } from './src/components/ImageOptionsDock';
      export const render = editMode => renderToStaticMarkup(React.createElement(ImageOptionsContent, {showUsage:false, editMode}));`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'image-ui-fixtures', setup(b) {
    b.onResolve({ filter: /^@\/hooks\/useSubscription$/ }, () => ({ path: 'subscription', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/store\/useImageGenStore$/ }, () => ({ path: 'hydrated-store', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/components\/ImageCreditSummary$/ }, () => ({ path: 'summary', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ resolveDir: process.cwd(), contents: path === 'hydrated-store'
      // One-shot rendering reads the real hydrated store, not SSR's pre-hydration defaults.
      ? `export * from ${JSON.stringify(process.cwd()+'/src/store/useImageGenStore.ts')}; import {useImageGenStore as store} from ${JSON.stringify(process.cwd()+'/src/store/useImageGenStore.ts')}; export const useImageGenStore = (selector = x => x) => selector(store.getState());`
      : path === 'subscription'
      ? 'export const useSubscription = () => globalThis.__imageUITest.subscription;'
      : 'export const ImageCreditSummary = () => null;' }));
  } }],
});
const originalStorage = globalThis.localStorage;
try {
  let index = 0;
  for (const tier of ['free', 'boost', 'admin']) {
    for (const mode of ['low', 'image', 'pro', 'flash', 'lite']) {
      let stored = JSON.stringify({ version: 6, state: { imageMode: mode, aspectRatio: '2:3', editAspectRatio: 'source', count: 2 } });
      globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem() {} };
      globalThis.__imageUITest = { subscription: { hasBoost: tier === 'boost', isAdmin: tier === 'admin', openCheckout() {} } };
      const { render } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}#${index++}`);
      for (const editMode of [false, true]) {
        const html = render(editMode);
        const group = html.match(/aria-label="Image mode">(.*?)<\/div>/)?.[1];
        assert(group, 'Image picker renders its accessible model group');
        const labels = [...group.matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)].map(x => x[1]);
        assert.deepEqual(labels, ['GPT 2.5 Flare', 'GPT 2.5 Flare HQ', 'GPT 2.5 Sunburst']);
        const selected = group.match(/<button\b[^>]*aria-pressed="true"[^>]*>([^<]+)<\/button>/)?.[1];
        const expected = tier === 'free' || ['low', 'flash', 'lite'].includes(mode) ? labels[0] : mode === 'image' ? labels[1] : labels[2];
        assert.equal(selected, expected, `${tier}/${mode} displays its effective GPT choice`);
        assert(!/Nano Banana|Gemini|Native 1K/i.test(html));
        assert(html.includes(editMode ? '>Original<' : '>2:3<'));
        assert(html.includes('>2x<'));
      }
    }
  }
  console.log('PASS: 30 production picker renders cover Free/Boost/admin, all GPT modes, retired saved modes, generation/edit shapes and count; no Google options. Browser layout is not covered.');
} finally {
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  delete globalThis.__imageUITest;
}
