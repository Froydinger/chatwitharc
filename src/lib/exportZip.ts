import JSZip from 'jszip';
import type { VirtualFileSystem } from '@/types/ide';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'arc-app';
}

const DEFAULT_PACKAGE_JSON = (appName: string) => JSON.stringify(
  {
    name: slugify(appName),
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      'lucide-react': '^1.24.0',
      clsx: '^2.1.1',
      'tailwind-merge': '^2.6.0',
      'framer-motion': '^12.23.12',
    },
    devDependencies: {
      '@types/react': '^18.3.23',
      '@types/react-dom': '^18.3.7',
      '@vitejs/plugin-react-swc': '^4.3.3',
      autoprefixer: '^10.4.21',
      postcss: '^8.5.6',
      tailwindcss: '^3.4.17',
      typescript: '^5.8.3',
      vite: '^8.2.2',
    },
  },
  null,
  2
);

const DEFAULT_VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`;

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: false,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noFallthroughCasesInSwitch: true,
      baseUrl: '.',
      paths: {
        '@/*': ['./src/*'],
      },
    },
    include: ['src'],
    references: [{ path: './tsconfig.node.json' }],
  },
  null,
  2
);

const DEFAULT_TSCONFIG_NODE = JSON.stringify(
  {
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true,
    },
    include: ['vite.config.ts'],
  },
  null,
  2
);

const DEFAULT_TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border, 240 3.7% 15.9%))',
        background: 'hsl(var(--background, 240 10% 3.9%))',
        foreground: 'hsl(var(--foreground, 0 0% 98%))',
        primary: {
          DEFAULT: 'hsl(var(--primary, 263.4 70% 50.4%))',
          foreground: 'hsl(var(--primary-foreground, 210 40% 98%))',
        },
      },
    },
  },
  plugins: [],
};
`;

const DEFAULT_POSTCSS_CONFIG = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const DEFAULT_GITIGNORE = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment
.env
.env.*
!.env.example
`;

const DEFAULT_INDEX_HTML = (appName: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="min-h-screen bg-[#08090c] text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const DEFAULT_README = (appName: string) => `# ${appName}

Created with **ArcAI App Builder** powered by Luna (\`gpt-5.6-luna\`).

## 🚀 Getting Started

### 1. Install Dependencies
\`\`\`bash
npm install
# or
yarn install
# or
pnpm install
\`\`\`

### 2. Start Local Development
\`\`\`bash
npm run dev
\`\`\`
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
\`\`\`bash
npm run build
\`\`\`

---

## 📦 Push to Git / GitHub

This codebase is pre-configured and ready to be initialized as a Git repository:

\`\`\`bash
git init
git add .
git commit -m "Initial commit from ArcAI App Builder"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
\`\`\`

---

## ☁️ Deploying to Netlify / Vercel

### Option A: Netlify CLI
\`\`\`bash
npx netlify deploy --prod
\`\`\`

### Option B: GitHub Integration
Push this repository to GitHub and connect it directly in Netlify or Vercel for automatic CI/CD builds.
`;

export async function exportProjectAsZip(
  projectName: string,
  files: VirtualFileSystem
): Promise<{ success: boolean; filename: string }> {
  const zip = new JSZip();
  const slug = slugify(projectName);
  const appName = projectName.trim() || 'Arc App';

  // 1. Add all virtual files to the zip
  for (const [path, file] of Object.entries(files)) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    zip.file(cleanPath, file.content);
  }

  // 2. Supplement boilerplate files if not provided in virtual files
  if (!files['package.json']) {
    zip.file('package.json', DEFAULT_PACKAGE_JSON(appName));
  }
  if (!files['vite.config.ts'] && !files['vite.config.js']) {
    zip.file('vite.config.ts', DEFAULT_VITE_CONFIG);
  }
  if (!files['tsconfig.json']) {
    zip.file('tsconfig.json', DEFAULT_TSCONFIG);
  }
  if (!files['tsconfig.node.json']) {
    zip.file('tsconfig.node.json', DEFAULT_TSCONFIG_NODE);
  }
  if (!files['tailwind.config.js'] && !files['tailwind.config.ts']) {
    zip.file('tailwind.config.js', DEFAULT_TAILWIND_CONFIG);
  }
  if (!files['postcss.config.js'] && !files['postcss.config.mjs']) {
    zip.file('postcss.config.js', DEFAULT_POSTCSS_CONFIG);
  }
  if (!files['index.html']) {
    zip.file('index.html', DEFAULT_INDEX_HTML(appName));
  }
  if (!files['.gitignore']) {
    zip.file('.gitignore', DEFAULT_GITIGNORE);
  }
  if (!files['README.md']) {
    zip.file('README.md', DEFAULT_README(appName));
  }

  // 3. Generate zip blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 4. Trigger browser download
  const filename = `${slug}-codebase.zip`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { success: true, filename };
}
