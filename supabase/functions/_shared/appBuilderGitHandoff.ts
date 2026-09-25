export type BuilderGitHandoffUser = { id: string; email: string; is_anonymous?: boolean };
export type BuilderGitHandoffConnection = { access_token_ciphertext: string; repo_access_mode: string; allowed_repos: unknown };
export type BuilderGitHandoffProject = { id: string; user_id: string; title: string; files: unknown };
export type BuilderGitHandoffRepo = { full_name: string; default_branch: string; html_url: string };

export type BuilderGitHandoffPorts = {
  authenticate(request: Request): Promise<BuilderGitHandoffUser | null>;
  gitEnabled(email: string): Promise<boolean>;
  hasBoost(userId: string): Promise<boolean>;
  loadProject(projectId: string, userId: string): Promise<BuilderGitHandoffProject | null>;
  loadConnection(userId: string): Promise<BuilderGitHandoffConnection | null>;
  decryptToken(ciphertext: string): Promise<string>;
  listRepositories(token: string): Promise<BuilderGitHandoffRepo[]>;
  createDraftPullRequest(token: string, input: {
    repo: string; baseBranch: string; files: Array<{ path: string; content: string }>;
    commitMessage: string; pullRequestTitle: string; pullRequestBody: string;
    maxFiles: number; draft: true;
  }): Promise<{ branch: string; commitSha: string; pullRequestUrl: string }>;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_FILES = 120;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 8_000_000;
const PLATFORMS = new Set(['Netlify', 'Vercel', 'Cloudflare Pages', 'Other']);
const DATABASES = new Set(['Arc app database', 'Supabase', 'Netlify DB', 'None']);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function cleanText(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHandoffPath(value: string): string {
  const path = value.replace(/^\/+/, '');
  if (!path || path.length > 300 || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('The saved app contains an invalid file path. Download the ZIP and review it before continuing.');
  }
  if (/(^|\/)\.env(?:$|\.)|(^|\/)[^/]*\.(?:pem|key|p12|pfx)$/i.test(path)) {
    throw new Error('The saved app contains a secret or certificate file that cannot be sent to Git.');
  }
  if (/^\.github\/workflows\//i.test(path) || /^\.git(?:\/|$)/i.test(path)) {
    throw new Error('The saved app cannot add or change GitHub workflows or Git metadata.');
  }
  return path;
}

function generatedExportFiles(title: string, platform: string, database: string): Record<string, string> {
  const safeTitle = escapeHtml(title);
  const slug = title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'arc-app';
  const packageJson = JSON.stringify({
    name: slug, private: true, version: '0.1.0', type: 'module',
    scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
    dependencies: {
      react: '^18.3.1', 'react-dom': '^18.3.1', 'lucide-react': '^0.453.0',
      'react-router-dom': '^6.28.0', 'framer-motion': '^11.11.9',
      'react-icons': '^5.3.0', 'canvas-confetti': '^1.9.4',
      clsx: '^2.1.1', 'tailwind-merge': '^2.6.0',
    },
    devDependencies: {
      '@types/react': '^18.3.23', '@types/react-dom': '^18.3.7',
      '@vitejs/plugin-react-swc': '^4.3.3', autoprefixer: '^10.4.21',
      postcss: '^8.5.6', tailwindcss: '^3.4.17', typescript: '^5.8.3', vite: '^8.2.2',
    },
  }, null, 2);
  const readme = [
    '# ' + title, '', 'Exported from ArcAI App Builder.', '',
    '## Run locally', '', 'Run npm install and then npm run dev.', '',
    '## Hosting and data handoff', '',
    'This repository is separate from the Arc App Builder publication. Any existing askarc.chat URL remains the App Builder version and does not host this Git version.',
    'Configure deployment in your own ' + platform + ' account. Review and replace Arc App Builder database or sign-in helpers as needed for ' + database + '.',
    '',
    'The draft pull request adds or updates project files in a new branch. Files with matching paths in the selected repository may be replaced in that branch, so review each overlap before merging.',
    'It does not configure a hosting provider, database, or production deployment.',
  ].join('\n');
  return {
    'package.json': packageJson,
    'vite.config.ts': 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react-swc";\nimport { fileURLToPath } from "node:url";\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },\n});\n',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: false,
        resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true,
        noUnusedLocals: false, noUnusedParameters: false, noFallthroughCasesInSwitch: true,
        baseUrl: '.', paths: { '@/*': ['./src/*'] },
      },
      include: ['src'],
    }, null, 2),
    'tailwind.config.js': 'export default { darkMode: ["class"], content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };\n',
    'postcss.config.js': 'export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n',
    'index.html': '<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><title>' + safeTitle + '</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n',
    '.gitignore': 'node_modules\ndist\ndist-ssr\n*.local\n.env\n.env.*\n!.env.example\n.DS_Store\n',
    'README.md': readme,
  };
}

export function buildAppBuilderGitFiles(
  rawFiles: unknown, rawTitle: unknown, platform: string, database: string,
): Array<{ path: string; content: string }> {
  if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) throw new Error('The saved app has no valid source files.');
  const files = new Map<string, string>();
  for (const [rawPath, rawFile] of Object.entries(rawFiles as Record<string, unknown>)) {
    const path = safeHandoffPath(rawPath);
    if (files.has(path)) throw new Error('The saved app contains duplicate file paths.');
    if (!rawFile || typeof rawFile !== 'object' || typeof (rawFile as { content?: unknown }).content !== 'string') {
      throw new Error('The saved app contains an invalid source file.');
    }
    files.set(path, (rawFile as { content: string }).content);
  }
  if (!files.size) throw new Error('The saved app has no source files to hand off.');

  const title = cleanText(rawTitle, 'Arc App');
  for (const [path, content] of Object.entries(generatedExportFiles(title, platform, database))) {
    if (!files.has(path)) files.set(path, content);
  }
  if (files.size > MAX_FILES) throw new Error('This app has too many files for a Git handoff. Download the code ZIP instead.');
  let totalBytes = 0;
  for (const content of files.values()) {
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_FILE_BYTES) throw new Error('A saved app file is too large for a Git handoff. Download the code ZIP instead.');
    totalBytes += bytes;
  }
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The saved app is too large for a Git handoff. Download the code ZIP instead.');
  return [...files].map(([path, content]) => ({ path, content }));
}

export function createAppBuilderGitHandoffHandler(ports: BuilderGitHandoffPorts) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return response({ error: 'Use POST.' }, 405);

    let body: Record<string, unknown>;
    try {
      const value = await request.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) return response({ error: 'Invalid request.' }, 400);
      body = value as Record<string, unknown>;
    } catch {
      return response({ error: 'Invalid JSON request.' }, 400);
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const repo = typeof body.repo === 'string' ? body.repo : '';
    const platform = typeof body.targetPlatform === 'string' ? body.targetPlatform : '';
    const database = typeof body.targetDatabase === 'string' ? body.targetDatabase : '';
    if (!UUID.test(projectId) || !REPO.test(repo) || !PLATFORMS.has(platform) || !DATABASES.has(database)) {
      return response({ error: 'Choose a valid app, repository, hosting platform, and database option.' }, 400);
    }

    try {
      const user = await ports.authenticate(request);
      if (!user?.id || !user.email || user.is_anonymous) return response({ error: 'Sign in to continue this app in Git.' }, 401);
      if (!await ports.gitEnabled(user.email)) return response({ error: 'Git integration is not enabled for this account.' }, 403);
      if (!await ports.hasBoost(user.id)) return response({ error: 'ArcAI Boost is required to hand off an app to Git.' }, 403);

      const project = await ports.loadProject(projectId, user.id);
      if (!project || project.id !== projectId || project.user_id !== user.id) return response({ error: 'App project not found.' }, 404);
      const connection = await ports.loadConnection(user.id);
      if (!connection?.access_token_ciphertext) return response({ error: 'Connect GitHub before creating a draft pull request.' }, 409);
      if (connection.repo_access_mode === 'selected') {
        const allowed = Array.isArray(connection.allowed_repos) ? connection.allowed_repos : [];
        if (!allowed.includes(repo)) return response({ error: 'That repository is outside your selected GitHub repository allowlist.' }, 403);
      } else if (connection.repo_access_mode !== 'all') {
        return response({ error: 'Your GitHub repository access settings could not be verified.' }, 403);
      }

      let token: string;
      try {
        token = await ports.decryptToken(connection.access_token_ciphertext);
      } catch {
        return response({ error: 'Your encrypted GitHub connection could not be opened. Reconnect GitHub.' }, 401);
      }
      const repositories = await ports.listRepositories(token);
      const selected = repositories.find(item => item.full_name === repo);
      if (!selected) return response({ error: 'That repository is not available to this GitHub connection.' }, 403);
      if (!selected.default_branch) return response({ error: 'GitHub did not return the repository default branch.' }, 400);

      const title = cleanText(project.title, 'Arc App');
      const files = buildAppBuilderGitFiles(project.files, title, platform, database);
      const pullRequest = await ports.createDraftPullRequest(token, {
        repo, baseBranch: selected.default_branch, files,
        commitMessage: 'Start ' + title + ' from Arc App Builder',
        pullRequestTitle: 'Start ' + title + ' from Arc App Builder',
        pullRequestBody: [
          'This draft PR starts from the saved Arc App Builder project files.',
          '',
          'Files with the same paths in the selected repository may be replaced in this draft branch. Review each overlap before merging.',
          'Configure deployment in your own ' + platform + ' account; this does not publish to askarc.chat or configure production hosting.',
          'Review and wire the app database/sign-in integration for ' + database + ' before using it with real users.',
          '',
          'The askarc.chat address, if one exists, remains the separately hosted App Builder version.',
        ].join('\n'),
        maxFiles: MAX_FILES, draft: true,
      });
      return response({ success: true, repo, baseBranch: selected.default_branch, ...pullRequest });
    } catch (error) {
      return response({ error: error instanceof Error ? error.message.slice(0, 300) : 'Git handoff failed.' }, 500);
    }
  };
}
