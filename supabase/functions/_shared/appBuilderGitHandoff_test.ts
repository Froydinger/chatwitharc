import {
  buildAppBuilderGitFiles,
  createAppBuilderGitHandoffHandler,
  type BuilderGitHandoffConnection,
  type BuilderGitHandoffPorts,
  type BuilderGitHandoffProject,
} from './appBuilderGitHandoff.ts';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function fixture(overrides: Partial<BuilderGitHandoffPorts> = {}) {
  let projectsRead = 0;
  let tokenDecrypts = 0;
  let repoReads = 0;
  let draftCreates = 0;
  let submitted: Parameters<BuilderGitHandoffPorts['createDraftPullRequest']>[1] | null = null;
  const project: BuilderGitHandoffProject = {
    id: PROJECT_ID,
    user_id: 'owner-1',
    title: 'Shopping List',
    files: { 'src/App.tsx': { content: 'export default function App(){return <main>saved</main>}' } },
  };
  const connection: BuilderGitHandoffConnection = {
    access_token_ciphertext: 'ciphertext-from-db',
    repo_access_mode: 'selected',
    allowed_repos: ['owner/shop'],
  };
  const defaults: BuilderGitHandoffPorts = {
    authenticate: async () => ({ id: 'owner-1', email: 'owner@example.com' }),
    gitEnabled: async () => true,
    hasBoost: async () => true,
    loadProject: async (id, owner) => {
      projectsRead++;
      return id === PROJECT_ID && owner === project.user_id ? project : null;
    },
    loadConnection: async () => connection,
    decryptToken: async value => {
      tokenDecrypts++;
      assert(value === 'ciphertext-from-db', 'Token must come from encrypted Git connection storage.');
      return 'decrypted-mock-token';
    },
    listRepositories: async token => {
      repoReads++;
      assert(token === 'decrypted-mock-token', 'Repository lookup uses the decrypted token only inside server code.');
      return [{ full_name: 'owner/shop', default_branch: 'main', html_url: 'https://github.com/owner/shop' }];
    },
    createDraftPullRequest: async (token, args) => {
      draftCreates++;
      submitted = args;
      assert(token === 'decrypted-mock-token', 'Draft creation receives server-side decrypted token.');
      return { branch: 'arc/mock-handoff', commitSha: 'a'.repeat(40), pullRequestUrl: 'https://github.com/owner/shop/pull/12' };
    },
  };
  return {
    handler: createAppBuilderGitHandoffHandler({ ...defaults, ...overrides }),
    project, connection,
    counters: () => ({ projectsRead, tokenDecrypts, repoReads, draftCreates, submitted }),
  };
}

function request(input: Record<string, unknown> = {}) {
  return new Request('https://arc.test/functions/v1/app-builder-git-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      repo: 'owner/shop',
      targetPlatform: 'Netlify',
      targetDatabase: 'Supabase',
      ...input,
    }),
  });
}

Deno.test('builder Git handoff requires signed-in, Boost, Git rollout, and owner project before any PR call', async () => {
  const anonymous = fixture({ authenticate: async () => ({ id: 'owner-1', email: 'owner@example.com', is_anonymous: true }) });
  assert((await anonymous.handler(request())).status === 401, 'Anonymous account must be denied.');
  assert(anonymous.counters().draftCreates === 0, 'Anonymous account cannot create a PR.');

  const noRollout = fixture({ gitEnabled: async () => false });
  assert((await noRollout.handler(request())).status === 403, 'Git rollout denial must be enforced.');
  assert(noRollout.counters().draftCreates === 0, 'Rollout denial cannot create a PR.');

  const noBoost = fixture({ hasBoost: async () => false });
  assert((await noBoost.handler(request())).status === 403, 'Boost denial must be enforced.');
  assert(noBoost.counters().projectsRead === 0 && noBoost.counters().draftCreates === 0, 'Entitlement denial stops before project and Git work.');

  const notOwner = fixture({ loadProject: async () => ({ id: PROJECT_ID, user_id: 'someone-else', title: 'private', files: {} }) });
  assert((await notOwner.handler(request())).status === 404, 'A foreign app project must be indistinguishable from missing.');
  assert(notOwner.counters().draftCreates === 0, 'Foreign project cannot create a PR.');
});

Deno.test('builder Git handoff enforces selected repository allowlist and connected account repo access', async () => {
  const denied = fixture({
    loadConnection: async () => ({ access_token_ciphertext: 'ciphertext', repo_access_mode: 'selected', allowed_repos: ['owner/other'] }),
  });
  assert((await denied.handler(request())).status === 403, 'Selected-repository mode rejects an unlisted repository.');
  assert(denied.counters().tokenDecrypts === 0 && denied.counters().draftCreates === 0, 'Allowlist denial happens before token use or Git writes.');

  const inaccessible = fixture({
    listRepositories: async () => [],
  });
  assert((await inaccessible.handler(request())).status === 403, 'Repository must be visible to the connected GitHub token.');
  assert(inaccessible.counters().draftCreates === 0, 'Unavailable repository cannot produce a PR.');
});

Deno.test('builder Git handoff submits saved files in a draft PR and never sends user-supplied file content', async () => {
  const f = fixture();
  const response = await f.handler(request({ files: { 'src/App.tsx': { content: 'forged-from-browser' } } }));
  const result = await body(response);
  const submitted = f.counters().submitted;
  assert(response.status === 200 && result.success === true, 'Authorized handoff returns a success receipt.');
  assert(result.pullRequestUrl === 'https://github.com/owner/shop/pull/12', 'The mock returns its pull request URL.');
  assert(submitted?.draft === true, 'Only a draft pull request is requested.');
  assert(submitted?.baseBranch === 'main', 'The repository default branch is the PR base.');
  assert(submitted?.files.some(file => file.path === 'src/App.tsx' && file.content.includes('saved')), 'PR uses server-saved project files.');
  assert(!submitted?.files.some(file => file.content.includes('forged-from-browser')), 'Client-provided project files are ignored.');
  assert(submitted?.files.some(file => file.path === 'package.json'), 'An empty repository gets build scaffolding.');
  assert(submitted?.files.some(file => file.path === 'README.md' && file.content.includes('does not host this Git version')), 'Generated readme explains hosting ownership.');
  assert(submitted?.files.some(file => file.path === 'vite.config.ts' && file.content.includes('fileURLToPath(new URL("./src", import.meta.url))')), 'Generated Vite config resolves aliases in ESM.');
  assert(submitted?.files.some(file => file.path === 'index.html' && file.content.includes('viewport-fit=cover')), 'Generated HTML supports device safe areas.');
  assert(submitted?.files.some(file => file.path === 'README.md' && file.content.includes('may be replaced')), 'Generated readme warns that matching repo paths may be replaced.');
  assert(submitted?.pullRequestBody.includes('does not publish to askarc.chat'), 'PR body makes the hosting separation explicit.');
  assert(submitted?.pullRequestBody.includes('may be replaced in this draft branch'), 'PR body warns about file path collisions.');
  assert(f.counters().draftCreates === 1, 'Test mock is the only PR creation port; no external GitHub call occurs.');
});

Deno.test('builder Git export blocks secrets, workflows, unsafe paths, and oversize files', () => {
  for (const path of ['../outside.ts', '.env', '.env.production', 'config/.env.local', 'server/token.pem', '.github/workflows/deploy.yml', '.git/config', '.GIT/config']) {
    let failed = false;
    try { buildAppBuilderGitFiles({ [path]: { content: 'x' } }, 'App', 'Netlify', 'None'); }
    catch { failed = true; }
    assert(failed, 'Unsafe project path should be rejected: ' + path);
  }
  let oversized = false;
  try { buildAppBuilderGitFiles({ 'src/large.ts': { content: 'x'.repeat(500_001) } }, 'App', 'Netlify', 'None'); }
  catch { oversized = true; }
  assert(oversized, 'Oversized source file must fall back to ZIP handoff.');
});
