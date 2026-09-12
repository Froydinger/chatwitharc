import * as esbuild from 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.27.1/esm/browser.min.js';
import type { AppFiles } from './cloudAppCore.ts';
import { zipEntries } from './cloudZip.ts';

const encoder = new TextEncoder();
let esbuildReady: Promise<void> | null = null;

async function initializeEsbuild(): Promise<void> {
  if (esbuildReady) return esbuildReady;
  esbuildReady = (async () => {
    const response = await fetch('https://cdn.jsdelivr.net/npm/esbuild-wasm@0.27.1/esbuild.wasm', {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('The cloud publisher could not load its compiler.');
    const wasm = await WebAssembly.compile(await response.arrayBuffer());
    await esbuild.initialize({ wasmModule: wasm, worker: false });
  })();
  try {
    await esbuildReady;
  } catch (error) {
    esbuildReady = null;
    throw error;
  }
}

export type CloudPublishPlan = {
  projectId: string;
  runId: string;
  siteId: string | null;
  subdomain: string;
  title: string;
  description: string;
};
export type CloudPublishedSite = CloudPublishPlan & {
  siteId: string;
  url: string;
  netlifyUrl?: string;
  deployId: string;
};
export type CloudPublisherConfig = {
  netlifyAccessToken: string;
  supabaseUrl?: string;
  domain?: string;
  fetcher?: typeof fetch;
};

const DOMAIN = 'askarc.chat';
const RESERVED = new Set(['www', 'app', 'api', 'mail', 'email', 'admin', 'blog', 'docs', 'status', 'support', 'help', 'dashboard', 'chat', 'cdn', 'static', 'assets', 'dev', 'staging', 'test', 'arc', 'arcai', 'askarc']);
const safeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function normalizeSubdomain(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  if (!normalized || RESERVED.has(normalized)) throw new Error('That publish address is reserved or invalid.');
  return normalized;
}

function languageFor(path: string): 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json' {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  return 'js';
}

function sanitizeCss(content: string): string {
  return content.split('\n').filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith('@tailwind') && !trimmed.startsWith('@import') && !trimmed.startsWith('@apply');
  }).join('\n');
}

function virtualPlugin(files: AppFiles) {
  const normalized: AppFiles = { ...files };
  if (!normalized['src/main.tsx'] && !normalized['src/main.jsx'] && !normalized['src/main.js']) {
    normalized['src/main.tsx'] = { language: 'tsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nconst root = document.getElementById('root');\nif (root) ReactDOM.createRoot(root).render(React.createElement(App));` };
  }
  const shims: Record<string, string> = {
    react: 'module.exports = window.React;',
    'react-dom': 'module.exports = window.ReactDOM;',
    'react-dom/client': 'module.exports = window.ReactDOM;',
    'framer-motion': 'module.exports = window.Motion || window.FramerMotion || {};',
    'react-router-dom': 'var r=window.ReactRouterDOM||{}; module.exports=Object.assign({},r,{BrowserRouter:r.HashRouter||function(p){return p.children;}});',
    'canvas-confetti': 'module.exports = window.confetti || function() {};',
  };
  const resolveLocal = (request: string, importer: string) => {
    const root = request.startsWith('@/') ? `src/${request.slice(2)}` : request.startsWith('./') || request.startsWith('../') ? `${importer.split('/').slice(0, -1).join('/')}/${request}` : request;
    const parts: string[] = [];
    for (const part of root.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
    const candidate = parts.join('/');
    for (const ext of ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json']) if (normalized[candidate + ext]) return candidate + ext;
    return candidate;
  };
  return {
    name: 'arc-cloud-virtual-fs',
    setup(build: { onResolve(options: { filter: RegExp }, callback: (args: { path: string; importer: string; kind: string }) => unknown): void; onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => unknown): void }) {
      build.onResolve({ filter: /^(react|react-dom|react-dom\/client|framer-motion|react-router-dom|canvas-confetti)$/ }, args => ({ path: args.path, namespace: 'arc-shim' }));
      build.onResolve({ filter: /^(lucide-react|react-icons.*|.*icons.*)$/ }, args => ({ path: args.path, namespace: 'arc-icons' }));
      build.onLoad({ filter: /.*/, namespace: 'arc-shim' }, args => ({ contents: shims[args.path] || 'module.exports = {};', loader: 'js' }));
      build.onLoad({ filter: /.*/, namespace: 'arc-icons' }, () => ({ contents: `var R=window.React;var h=R.createElement;var C=function(p){return h('span',Object.assign({style:{display:'inline-block',width:'1em',height:'1em',verticalAlign:'middle'}},p));};module.exports=new Proxy({__esModule:true,default:C},{get:function(t,p){return p==='__esModule'?true:p==='default'?C:C;}});`, loader: 'js' }));
      build.onResolve({ filter: /^(@\/|\.|\.\.)/ }, args => ({ path: resolveLocal(args.path, args.importer || 'src/main.tsx'), namespace: 'arc-files' }));
      build.onResolve({ filter: /.*/ }, args => args.kind === 'entry-point' ? ({ path: resolveLocal(args.path, 'src/main.tsx'), namespace: 'arc-files' }) : ({ path: args.path, namespace: 'arc-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'arc-stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
      build.onLoad({ filter: /.*/, namespace: 'arc-files' }, args => {
        const file = normalized[args.path];
        if (!file) return { contents: '', loader: 'tsx' };
        if (args.path.endsWith('.css')) return { contents: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(sanitizeCss(file.content))};document.head.appendChild(s);})()`, loader: 'js' };
        return { contents: file.content, loader: languageFor(args.path) };
      });
    },
  };
}

async function bundle(files: AppFiles): Promise<string> {
  await initializeEsbuild();
  const result = await esbuild.build({ entryPoints: ['src/main.tsx'], bundle: true, write: false, format: 'iife', globalName: 'App', target: 'es2020', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [virtualPlugin(files)] });
  const output = result.outputFiles?.[0]?.text;
  if (!output || output.length > 8_000_000) throw new Error('The app bundle is too large to publish.');
  return output;
}

function html(bundleCode: string, plan: CloudPublishPlan, supabaseUrl: string): string {
  const title = safeAttr(plan.title);
  const description = safeAttr(plan.description || `${plan.title} — built with Arc`);
  const bundleSafe = bundleCode.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="en" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23090d0b'/%3E%3Cpath d='M72.8 33.6A29 29 0 1 0 71.2 68.8M64 41A20 20 0 1 1 59.2 67.3' fill='none' stroke='%23fff' stroke-width='8' stroke-linecap='round'/%3E%3C/svg%3E"><script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js" crossorigin></script><script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script><script src="https://cdn.jsdelivr.net/npm/@remix-run/router@1.21.0/dist/router.umd.min.js" crossorigin></script><script src="https://cdn.jsdelivr.net/npm/react-router@6.28.0/dist/umd/react-router.production.min.js" crossorigin></script><script src="https://cdn.jsdelivr.net/npm/react-router-dom@6.28.0/dist/umd/react-router-dom.production.min.js" crossorigin></script><script src="https://cdn.tailwindcss.com"></script><script>window.__ARC_SUPABASE_URL__=${JSON.stringify(supabaseUrl)};window.__ARC_PROJECT_ID__=${JSON.stringify(plan.projectId)};window.__ARC_SUBDOMAIN__=${JSON.stringify(plan.subdomain)};window.__ARC_APP_ID__=${JSON.stringify(plan.projectId)};</script><style>html,body,#root{min-height:100%;margin:0}body{background:#090a0f;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head><body><div id="root"></div><script>${bundleSafe}</script></body></html>`;
}

async function json(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  let value: unknown = {};
  try { value = JSON.parse(body); } catch { /* handled below */ }
  if (!response.ok) throw new Error(`Netlify request failed (${response.status}).`);
  return value;
}

export async function publishCloudApp(files: AppFiles, plan: CloudPublishPlan, config: CloudPublisherConfig): Promise<CloudPublishedSite> {
  if (!config.netlifyAccessToken) throw new Error('Live publishing is not configured.');
  const fetcher = config.fetcher ?? fetch;
  const domain = config.domain ?? DOMAIN;
  const subdomain = normalizeSubdomain(plan.subdomain);
  const fullDomain = `${subdomain}.${domain}`;
  const headers = { Authorization: `Bearer ${config.netlifyAccessToken}` };
  let targetSiteId = plan.siteId;
  if (!targetSiteId) {
    const sites = await json(fetcher, 'https://api.netlify.com/api/v1/sites?per_page=100', { headers });
    const match = (Array.isArray(sites) ? sites : []).find((site: unknown) => {
      const item = site as Record<string, unknown>;
      const aliases = Array.isArray(item.domain_aliases) ? item.domain_aliases : [];
      return String(item.custom_domain || '').toLowerCase() === fullDomain || aliases.some(alias => String(alias).toLowerCase() === fullDomain);
    }) as Record<string, unknown> | undefined;
    targetSiteId = match ? String(match.site_id || match.id) : null;
  }
  const siteName = `arc-${subdomain.slice(0, 30)}-${plan.projectId.slice(0, 8)}`;
  if (!targetSiteId) {
    const created = await json(fetcher, 'https://api.netlify.com/api/v1/sites', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: siteName }) });
    const createdRecord = created && typeof created === 'object' ? created as Record<string, unknown> : {};
    targetSiteId = String(createdRecord.site_id || createdRecord.id || '');
    if (!targetSiteId) throw new Error('Netlify did not return a site id.');
    const attached = await fetcher(`https://api.netlify.com/api/v1/sites/${targetSiteId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_domain: fullDomain }), signal: AbortSignal.timeout(30_000) });
    if (!attached.ok) throw new Error('Netlify could not attach the publish address.');
  }
  const bundled = await bundle(files);
  const entries = [{ name: 'index.html', data: encoder.encode(html(bundled, { ...plan, siteId: targetSiteId, subdomain }, config.supabaseUrl ?? '')) }, { name: '_redirects', data: encoder.encode('/*    /index.html   200') }];
  for (const [path, file] of Object.entries(files)) if (path.startsWith('public/')) entries.push({ name: path.slice('public/'.length), data: encoder.encode(file.content) });
  const archive = zipEntries(entries);
  if (archive.length > 12_000_000) throw new Error('The publish archive is too large.');
  const deployed = await json(fetcher, `https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: archive as unknown as BodyInit });
  const deployedRecord = deployed && typeof deployed === 'object' ? deployed as Record<string, unknown> : {};
  const deployId = String(deployedRecord.id || '');
  if (!deployId) throw new Error('Netlify did not return a deploy id.');
  return { ...plan, siteId: targetSiteId, subdomain, url: `https://${fullDomain}`, netlifyUrl: typeof deployedRecord.ssl_url === 'string' ? deployedRecord.ssl_url : undefined, deployId };
}
