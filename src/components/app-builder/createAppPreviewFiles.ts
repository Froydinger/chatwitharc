import type { VirtualFileSystem } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';

/** Adapts Arc's saved file map to the browser-only Sandpack runtime. */
export function createAppPreviewFiles(
  sourceFiles: VirtualFileSystem,
  projectId: string,
  supabaseUrl: string,
): Record<string, { code: string }> {
  const files: Record<string, string> = Object.fromEntries(
    Object.entries(sourceFiles).map(([path, file]) => [path.startsWith('/') ? path : `/${path}`, file.content]),
  );

  if (!files['/tsconfig.json']) {
    files['/tsconfig.json'] = JSON.stringify({
      compilerOptions: {
        strict: true,
        esModuleInterop: true,
        lib: ['dom', 'es2015'],
        jsx: 'react-jsx',
        baseUrl: '.',
        paths: { '@/*': ['src/*', '*'] },
      },
    }, null, 2);
  }

  if (!files['/src/lib/netlifyDb.ts']?.includes('syncCloud') || !files['/src/lib/netlifyDb.ts']?.includes('getAllStoredUsers')) {
    files['/src/lib/netlifyDb.ts'] = DEFAULT_FILES['src/lib/netlifyDb.ts'].content;
  }
  if (!files['/src/components/NetlifyAuthModal.tsx']?.includes('export function NetlifyAuthModal')) {
    files['/src/components/NetlifyAuthModal.tsx'] = DEFAULT_FILES['src/components/NetlifyAuthModal.tsx'].content;
  }

  const hasSourceApp = Boolean(files['/src/App.tsx'] || files['/src/App.jsx'] || files['/src/App.js']);
  const safeProjectId = JSON.stringify(projectId);
  const safeSupabaseUrl = JSON.stringify(supabaseUrl);
  const systemGlobals = `window.__ARC_APP_ID__ = ${safeProjectId};\nwindow.__ARC_PROJECT_ID__ = ${safeProjectId};\nwindow.__ARC_SUPABASE_URL__ = ${safeSupabaseUrl};`;
  const cssPath = files['/src/index.css'] ? '/src/index.css' : files['/index.css'] ? '/index.css' : '/src/index.css';
  const previewCssImport = cssPath === '/src/index.css' ? './index.css' : '../index.css';

  // Sandpack's react-ts template boots from /src/index.tsx. A root /index.tsx
  // can sit beside the template entry without ever being executed, leaving
  // Tailwind unimported and the preview looking like unstyled browser HTML.
  if (!files['/src/index.tsx'] && !files['/src/index.js']) {
    if (files['/src/main.tsx'] || files['/src/main.jsx'] || files['/src/main.js']) {
      files['/src/index.tsx'] = `import '${previewCssImport}';
import './main';
`;
    } else if (files['/index.tsx'] || files['/index.jsx'] || files['/index.js']) {
      const rootEntryPath = files['/index.tsx'] ? '../index' : files['/index.jsx'] ? '../index' : '../index.js';
      files['/src/index.tsx'] = `import '${previewCssImport}';
import '${rootEntryPath}';
`;
    } else {
      const srcAppImport = hasSourceApp ? './App' : '../App';
      files['/src/index.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import '${previewCssImport}';

if (typeof window !== 'undefined') { ${systemGlobals} }
import App from '${srcAppImport}';

const rootEl = document.getElementById('root');
if (rootEl) ReactDOM.createRoot(rootEl).render(<React.StrictMode><App /></React.StrictMode>);
`;
    }
  }

  if (files['/src/main.tsx'] && !files['/src/main.tsx'].includes('__ARC_APP_ID__')) {
    files['/src/main.tsx'] = `${systemGlobals}\n${files['/src/main.tsx']}`;
  }
  if (files['/src/App.tsx'] && !files['/App.tsx']) {
    files['/App.tsx'] = `export { default } from './src/App';\nexport * from './src/App';`;
  }

  if (!files['/styles.css']) {
    files['/styles.css'] = `*, ::before, ::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #090a0f; color: #f8fafc; font-family: Inter, system-ui, sans-serif; }
`;
  }

  const baseStylesImport = cssPath === '/src/index.css' ? '../styles.css' : './styles.css';
  if (!files[cssPath]) files[cssPath] = `@import url('${baseStylesImport}');\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
  else if (!/@tailwind\s+(base|components|utilities)/.test(files[cssPath])) {
    const imports = files[cssPath].match(/^(?:\s*@import[^;]+;\s*)+/)?.[0] ?? '';
    files[cssPath] = `${imports}@tailwind base;\n@tailwind components;\n@tailwind utilities;\n${files[cssPath].slice(imports.length)}`;
  }
  const previewEntryPath = ['/src/index.tsx', '/src/index.js']
    .find(path => files[path]);
  if (previewEntryPath && !files[previewEntryPath].includes(previewCssImport)) {
    files[previewEntryPath] = `import '${previewCssImport}';\n${files[previewEntryPath]}`;
  }
  if (!files['/src/App.css'] && !files['/App.css']) files['/src/App.css'] = '';
  if (!files['/tailwind.config.cjs']) files['/tailwind.config.cjs'] = `module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}', './*.{js,ts,jsx,tsx}', './public/index.html'],
  theme: { extend: { colors: {
    border: 'rgba(255,255,255,0.1)', background: '#090a0f', foreground: '#f8fafc',
    primary: { DEFAULT: '#6366f1', foreground: '#ffffff' },
    muted: { DEFAULT: '#1e293b', foreground: '#94a3b8' },
    card: { DEFAULT: '#0f1117', foreground: '#f8fafc' },
  } } },
};`;
  if (!files['/postcss.config.cjs']) files['/postcss.config.cjs'] = `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`;

  const html = `<!doctype html>
<html lang="en" class="dark"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<script>${systemGlobals}</script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>*,::before,::after{box-sizing:border-box}html,body{margin:0;padding:0;background:#090a0f;color:#f8fafc;font-family:Inter,system-ui,sans-serif;min-height:100%}#root{min-height:100vh}</style>
</head><body><div id="root"></div></body></html>`;
  files['/index.html'] = html;
  files['/public/index.html'] = html;

  return Object.fromEntries(Object.entries(files).map(([path, code]) => [path, { code }]));
}
