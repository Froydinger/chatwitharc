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
      var React = window.React;
      var h = React.createElement;

      // --- Contexts ---
      var RouterContext = React.createContext({ path: '/', navigate: function(){}, params: {}, outlet: null, state: null });
      var ParamsContext = React.createContext({});
      var OutletContext = React.createContext(null);

      // --- Route matching ---
      function matchRoute(pattern, pathname) {
        if (pattern === '*') return { match: true, params: {}, exact: false };
        var paramNames = [];
        var regexStr = '^' + pattern.replace(/:([^/]+)/g, function(_, name) {
          paramNames.push(name);
          return '([^/]+)';
        });
        // Exact match (no trailing segments unless pattern ends with /*)
        regexStr += '$';
        var regex = new RegExp(regexStr);
        var m = pathname.match(regex);
        if (!m) return null;
        var params = {};
        paramNames.forEach(function(name, i) { params[name] = decodeURIComponent(m[i + 1]); });
        return { match: true, params: params, exact: true };
      }

      function findMatch(children, pathname) {
        var kids = React.Children.toArray(children);
        var wildcard = null;
        for (var i = 0; i < kids.length; i++) {
          var child = kids[i];
          if (!child || !child.props) continue;
          var routePath = child.props.path;
          if (routePath === '*') { wildcard = { child: child, params: {} }; continue; }
          if (routePath == null) routePath = '/';
          var result = matchRoute(routePath, pathname);
          if (result) return { child: child, params: result.params };
        }
        return wildcard;
      }

      // --- Hash Router ---
      function HashRouter(props) {
        var _s = React.useState(window.location.hash.slice(1) || '/');
        var path = _s[0], setPath = _s[1];
        var _st = React.useState(null);
        var navState = _st[0], setNavState = _st[1];

        var navigate = React.useCallback(function(to, opts) {
          if (typeof to === 'number') { window.history.go(to); return; }
          if (opts && opts.state) setNavState(opts.state);
          if (opts && opts.replace) {
            window.location.replace('#' + to);
          } else {
            window.location.hash = '#' + to;
          }
        }, []);

        React.useEffect(function() {
          function onHash() {
            var p = window.location.hash.slice(1) || '/';
            setPath(p);
            try { window.parent.postMessage({ type: 'route-change', path: p }, '*'); } catch(e) {}
          }
          window.addEventListener('hashchange', onHash);
          if (!window.location.hash) window.location.hash = '#/';
          return function() { window.removeEventListener('hashchange', onHash); };
        }, []);

        return h(RouterContext.Provider, { value: { path: path, navigate: navigate, params: {}, outlet: null, state: navState } }, props.children);
      }
      function BrowserRouter(props) { return HashRouter(props); }

      // --- Routes ---
      function Routes(props) {
        var ctx = React.useContext(RouterContext);
        var pathname = ctx.path.split('?')[0];
        var matched = findMatch(props.children, pathname);
        if (!matched) return null;
        var child = matched.child;
        var params = matched.params;
        var element = child.props.element || null;

        // Check for nested routes (children of Route)
        var nestedChildren = child.props.children;
        var outletElement = null;
        if (nestedChildren) {
          var nestedMatch = findMatch(
            typeof nestedChildren === 'function' ? null : nestedChildren,
            pathname
          );
          if (nestedMatch) {
            outletElement = h(ParamsContext.Provider, { value: nestedMatch.params },
              nestedMatch.child.props.element || null
            );
          }
        }

        return h(ParamsContext.Provider, { value: params },
          h(OutletContext.Provider, { value: outletElement }, element)
        );
      }

      function Route() { return null; }

      // --- Navigation components ---
      function Link(props) {
        var ctx = React.useContext(RouterContext);
        return h('a', Object.assign({}, props, {
          href: '#' + (props.to || '/'),
          onClick: function(e) { e.preventDefault(); ctx.navigate(props.to || '/'); if (props.onClick) props.onClick(e); }
        }), props.children);
      }
      function NavLink(props) {
        var ctx = React.useContext(RouterContext);
        var pathname = ctx.path.split('?')[0];
        var isActive = pathname === props.to;
        var cn = typeof props.className === 'function' ? props.className({ isActive: isActive }) : props.className;
        return h('a', Object.assign({}, props, {
          href: '#' + (props.to || '/'),
          className: cn,
          onClick: function(e) { e.preventDefault(); ctx.navigate(props.to || '/'); }
        }), props.children);
      }

      // --- Hooks ---
      function useNavigate() { var ctx = React.useContext(RouterContext); return ctx.navigate; }
      function useLocation() {
        var ctx = React.useContext(RouterContext);
        var parts = ctx.path.split('?');
        return { pathname: parts[0], search: parts[1] ? '?' + parts[1] : '', hash: '', state: ctx.state || null };
      }
      function useParams() { return React.useContext(ParamsContext); }
      function useSearchParams() {
        var ctx = React.useContext(RouterContext);
        var parts = ctx.path.split('?');
        var sp = new URLSearchParams(parts[1] || '');
        var setSearchParams = function(next) {
          var s = typeof next === 'function' ? next(sp) : next;
          ctx.navigate(parts[0] + '?' + s.toString());
        };
        return [sp, setSearchParams];
      }
      function Outlet() {
        var outlet = React.useContext(OutletContext);
        return outlet || null;
      }
      function Navigate(props) {
        var nav = useNavigate();
        React.useEffect(function() { nav(props.to || '/', { replace: props.replace }); }, []);
        return null;
      }

      module.exports = { BrowserRouter: BrowserRouter, HashRouter: HashRouter, Routes: Routes, Route: Route, Link: Link, NavLink: NavLink, useNavigate: useNavigate, useLocation: useLocation, useParams: useParams, useSearchParams: useSearchParams, Outlet: Outlet, Navigate: Navigate };
    `,
  };

  return {
    name: 'virtual-fs',
    setup(build) {
      build.onResolve({ filter: /^(react-dom\/client|react-dom|react|framer-motion|react-router-dom)$/ }, (args) => {
        return { path: args.path, namespace: 'shim' };
      });
      build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => {
        return { contents: shims[args.path] || 'module.exports = {};', loader: 'js' };
      });
      build.onResolve({ filter: /^\./ }, (args) => {
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
        const fullPath = normalized.join('/');
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
    window.onerror = function(msg, url, line, col, err) {
      var errMsg = (err && err.message) ? err.message : String(msg);
      var root = document.getElementById('root');
      if (root && !root.innerHTML.trim()) {
        root.innerHTML = '<div style="padding:20px;color:#ef4444;font-family:monospace;"><h2>Runtime Error</h2><pre>' + errMsg + '</pre></div>';
      }
      try { window.parent.postMessage({ type: 'preview-error', error: errMsg }, '*'); } catch(e) {}
    };
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
      document.getElementById('root').innerHTML =
        '<div style="padding:20px;color:#ef4444;font-family:monospace;"><h2>Runtime Error</h2><pre>' + errMsg + '</pre></div>';
      try { window.parent.postMessage({ type: 'preview-error', error: errMsg }, '*'); } catch(e) {}
    }
  <\/script>
</body>
</html>`;
}
