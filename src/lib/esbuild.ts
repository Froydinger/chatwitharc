import * as esbuild from 'esbuild-wasm';
import type { VirtualFileSystem } from '@/types/ide';

const g = globalThis as any;
const HOST_VERSION = (esbuild as any).version || '0.27.1';

function getWasmUrls(version: string): string[] {
  return [
    `https://cdn.jsdelivr.net/npm/esbuild-wasm@${version}/esbuild.wasm`,
    `https://unpkg.com/esbuild-wasm@${version}/esbuild.wasm`,
    `https://esm.sh/esbuild-wasm@${version}/esbuild.wasm`,
  ];
}

async function fetchWasm(urls: string[]): Promise<WebAssembly.Module> {
  for (let i = 0; i < urls.length; i++) {
    try {
      console.log(`[esbuild] Fetching WASM from ${urls[i]}…`);
      const resp = await fetch(urls[i]);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = await resp.arrayBuffer();
      return await WebAssembly.compile(bytes);
    } catch (err) {
      console.error(`[esbuild] WASM fetch failed (${urls[i]}). Error:`, err);
      if (i === urls.length - 1) throw err;
    }
  }
  throw new Error('All WASM CDNs failed');
}

export async function initializeEsbuild(): Promise<void> {
  if (g.__esbuild_ready) return;
  if (g.__esbuild_promise) return g.__esbuild_promise;

  g.__esbuild_promise = (async () => {
    try {
      console.log(`[esbuild] Host JS version: ${HOST_VERSION}`);
      const wasmUrls = getWasmUrls(HOST_VERSION);
      const wasmModule = await fetchWasm(wasmUrls);
      await esbuild.initialize({ wasmModule, worker: false });
      g.__esbuild_ready = true;
      console.log(`[esbuild] Initialized v${HOST_VERSION}`);
    } catch (err: any) {
      if (err?.message?.includes('more than once')) {
        g.__esbuild_ready = true;
        return;
      }
      g.__esbuild_promise = null;
      throw err;
    }
  })();

  return g.__esbuild_promise;
}

function sanitizeCss(content: string): string {
  return content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('@tailwind') && !trimmed.startsWith('@import') && !trimmed.startsWith('@apply');
    })
    .join('\n');
}

function createVirtualFsPlugin(files: VirtualFileSystem): esbuild.Plugin {
  const shims: Record<string, string> = {
    'react': 'module.exports = window.React;',
    'react-dom': 'module.exports = window.ReactDOM;',
    'react-dom/client': 'module.exports = window.ReactDOM;',
    'framer-motion': 'module.exports = window.Motion || {};',
    'react-router-dom': `
      var RouterDOM = window.ReactRouterDOM || {};
      var BrowserRouterOverride = RouterDOM.HashRouter || function(props) { return null; };
      module.exports = Object.assign({}, RouterDOM, {
        BrowserRouter: BrowserRouterOverride
      });
    `,
  };

  return {
    name: 'virtual-fs',
    setup(build) {
      build.onResolve({ filter: /^(react-dom\/client|react-dom|react|framer-motion|react-router-dom|lucide-react|react-icons.*|.*icons.*)$/ }, (args) => {
        return { path: args.path, namespace: 'shim' };
      });
      build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => {
        if (shims[args.path]) {
          return { contents: shims[args.path], loader: 'js' };
        }
        if (args.path.includes('icons') || args.path.includes('lucide')) {
          const contents = `
            var React = window.React;
            var h = React.createElement;
            var IconProxy = new Proxy({}, {
              get: function(target, prop) {
                return function(props) {
                  return h('span', Object.assign({}, props, {
                    style: Object.assign({
                      display: 'inline-block',
                      width: '1em',
                      height: '1em',
                      borderRadius: '0.25em',
                      border: '1px solid currentColor',
                      verticalAlign: 'middle',
                      opacity: 0.7
                    }, props.style)
                  }));
                };
              }
            });
            module.exports = IconProxy;
          `;
          return { contents, loader: 'js' };
        }
        return { contents: 'module.exports = {};', loader: 'js' };
      });
      build.onResolve({ filter: /^(@\/|\.)/ }, (args) => {
        let fullPath = '';
        if (args.path.startsWith('@/')) {
          fullPath = 'src/' + args.path.slice(2);
        } else {
          const importer = args.importer || 'src/main.tsx';
          const importerDir = importer.split('/').slice(0, -1).join('/');
          let resolvedPath = args.path.startsWith('./') ? args.path.slice(2) : args.path;
          const joined = importerDir ? `${importerDir}/${resolvedPath}` : resolvedPath;
          const parts = joined.split('/');
          const normalized: string[] = [];
          for (const part of parts) {
            if (part === '..') normalized.pop();
            else if (part !== '.') normalized.push(part);
          }
          fullPath = normalized.join('/');
        }

        const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '.css'];
        for (const ext of extensions) {
          if (files[fullPath + ext]) return { path: fullPath + ext, namespace: 'virtual-fs' };
        }
        for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
          const indexPath = `${fullPath}/index${ext}`;
          if (files[indexPath]) return { path: indexPath, namespace: 'virtual-fs' };
        }
        return { path: fullPath, namespace: 'virtual-fs' };
      });
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return { path: args.path, namespace: 'virtual-fs' };
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) return { path: args.path, namespace: 'stub' };
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => {
        return { contents: 'module.exports = {};', loader: 'js' };
      });
      build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, (args) => {
        const file = files[args.path];
        if (!file) return { contents: '', loader: 'tsx' };
        if (args.path.endsWith('.css')) {
          const sanitized = sanitizeCss(file.content);
          const js = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(sanitized)};document.head.appendChild(s);})()`;
          return { contents: js, loader: 'js' };
        }
        return { contents: file.content, loader: 'tsx' };
      });
    },
  };
}

export async function bundleProject(files: VirtualFileSystem): Promise<string> {
  await initializeEsbuild();
  if (!files['src/main.tsx']) throw new Error('Entry point src/main.tsx not found');

  const result = await esbuild.build({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'App',
    target: 'es2020',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js' },
    plugins: [createVirtualFsPlugin(files)],
    define: { 'process.env.NODE_ENV': '"development"' },
  });

  if (result.outputFiles?.[0]) return result.outputFiles[0].text;
  throw new Error('No output generated');
}

export function generatePreviewHtml(bundledCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/@remix-run/router@1.21.0/dist/router.umd.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-router@6.28.0/dist/umd/react-router.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-router-dom@6.28.0/dist/umd/react-router-dom.production.min.js" crossorigin><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/framer-motion@11/dist/framer-motion.js" crossorigin><\/script>
  <script>
    (function() {
      try { window.localStorage; } catch(e) {
        var store = {};
        var fakeStorage = {
          getItem: function(k) { return store[k] || null; },
          setItem: function(k,v) { store[k] = String(v); },
          removeItem: function(k) { delete store[k]; },
          clear: function() { store = {}; },
          get length() { return Object.keys(store).length; },
          key: function(i) { return Object.keys(store)[i] || null; }
        };
        Object.defineProperty(window, 'localStorage', { value: fakeStorage, writable: false });
        Object.defineProperty(window, 'sessionStorage', { value: fakeStorage, writable: false });
      }
    })();
  <\/script>
  <style>* { margin: 0; padding: 0; box-sizing: border-box; } html, body, #root { height: 100%; width: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script>
    var lastError = '';
    var _error = console.error;
    console.error = function() {
      _error.apply(console, arguments);
      var args = Array.prototype.slice.call(arguments);
      var msg = args.map(function(arg) {
        if (arg && arg.message) return arg.message + (arg.stack ? '\n' + arg.stack : '');
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      }).join(' ');
      
      if (msg.indexOf('Warning:') !== 0 && msg.indexOf('info') !== 0) {
        lastError = msg;
        reportError(msg);
      }
    };

    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason;
      var msg = reason && reason.message ? reason.message + (reason.stack ? '\n' + reason.stack : '') : String(reason);
      reportError('Unhandled Promise Rejection: ' + msg);
    });

    window.onerror = function(msg, url, line, col, err) {
      var errMsg = (err && err.message) ? err.message : String(msg);
      if (errMsg === 'Script error.' && lastError) {
        errMsg = lastError;
      }
      reportError(errMsg);
    };

    function reportError(errMsg) {
      var root = document.getElementById('root');
      if (root && (!root.innerHTML || root.innerHTML.indexOf('Runtime Error') !== -1 || root.innerHTML.indexOf('No Render') !== -1)) {
        root.innerHTML = '<div style="padding:20px;color:#ef4444;font-family:monospace;white-space:pre-wrap;word-break:break-all;"><h2>Runtime Error</h2><pre>' + errMsg + '</pre></div>';
      }
      try { window.parent.postMessage({ type: 'preview-error', error: errMsg }, '*'); } catch(e) {}
    }

    try {
      ${bundledCode}
      setTimeout(function() {
        var root = document.getElementById('root');
        if (root && !root.innerHTML.trim()) {
          root.innerHTML = '<div style="padding:20px;color:#f59e0b;font-family:monospace;"><h2>No Render</h2><p>The app executed but nothing was rendered.</p></div>';
        }
      }, 1000);
    } catch (error) {
      var errMsg = error.message || String(error);
      reportError(errMsg);
    }
  <\/script>
</body>
</html>`;
}
