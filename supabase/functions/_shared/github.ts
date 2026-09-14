const GITHUB_API = 'https://api.github.com';
const JSON_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid GitHub response');
  return value as Row;
}

function safeRepo(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('Repository must be in owner/name format.');
  }
  return value;
}

function safeBranch(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('..') || /[\s~^:?*\\[\]]/.test(value)) {
    throw new Error('Invalid branch.');
  }
  return value;
}

function safePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 300 || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Invalid repository path.');
  }
  if (/(^|\/)(\.env(?:\.|$)|.*\.(pem|key|p12|pfx))$/i.test(value)) throw new Error('Secret files cannot be modified.');
  return value;
}

export async function githubRequest(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' && !Array.isArray(body) ? body as Row : {};
    const message = typeof errorBody.message === 'string' ? errorBody.message : `GitHub HTTP ${response.status}`;
    throw new Error(message.slice(0, 240));
  }
  return body;
}

export function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function keyBytes(secret: string): Uint8Array {
  const normalized = secret.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('GIT_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  return bytes;
}

export async function encryptToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes(secret) as unknown as BufferSource, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  const pack = new Uint8Array(iv.length + ciphertext.length);
  pack.set(iv); pack.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...pack));
}

export async function decryptToken(value: string, secret: string): Promise<string> {
  const packed = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (packed.length < 13) throw new Error('Stored Git token is invalid.');
  const key = await crypto.subtle.importKey('raw', keyBytes(secret) as unknown as BufferSource, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) }, key, packed.slice(12));
  return new TextDecoder().decode(plaintext);
}

export async function githubUser(token: string): Promise<Row> {
  return githubRequest(token, '/user');
}

export async function githubRepositories(token: string): Promise<Array<{ full_name: string; default_branch: string; private: boolean; html_url: string }>> {
  const result = await githubRequest(token, '/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&sort=updated&per_page=100');
  if (!Array.isArray(result)) throw new Error('GitHub repository list was invalid.');
  return (result as unknown[]).flatMap(value => {
    const item = row(value);
    return typeof item.full_name === 'string' && typeof item.default_branch === 'string' && typeof item.html_url === 'string'
      ? [{ full_name: item.full_name, default_branch: item.default_branch, private: item.private === true, html_url: item.html_url }]
      : [];
  });
}

export async function githubReadFiles(token: string, repoInput: string, branchInput: string, pathsInput: unknown[]): Promise<{ repo: string; branch: string; headSha: string; files: Array<{ path: string; content: string }> }> {
  const repo = safeRepo(repoInput);
  const branch = safeBranch(branchInput);
  const ref = await githubRequest(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = String(row(ref.object).sha || '');
  if (!/^[0-9a-f]{40}$/i.test(headSha)) throw new Error('GitHub branch head was invalid.');
  const paths = pathsInput.map(safePath).slice(0, 20);
  const files: Array<{ path: string; content: string }> = [];
  for (const path of paths) {
    const item = await githubRequest(token, `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
    const encoded = typeof item.content === 'string' ? item.content.replace(/\s/g, '') : '';
    if (item.type !== 'file' || !encoded) continue;
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const content = new TextDecoder().decode(bytes);
    if (content.length > 500_000) throw new Error(`File ${path} is too large for Arc.`);
    files.push({ path, content });
  }
  return { repo, branch, headSha, files };
}

export async function githubSearchFiles(token: string, repoInput: string, branchInput: string, queryInput: string): Promise<{ repo: string; branch: string; headSha: string; paths: string[] }> {
  const repo = safeRepo(repoInput);
  const branch = safeBranch(branchInput);
  const query = typeof queryInput === 'string' ? queryInput.trim().toLowerCase().slice(0, 120) : '';
  if (!query) throw new Error('Search query is required.');
  const ref = await githubRequest(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = String(row(ref.object).sha || '');
  if (!/^[0-9a-f]{40}$/i.test(headSha)) throw new Error('GitHub branch head was invalid.');
  const commit = await githubRequest(token, `/repos/${repo}/git/commits/${headSha}`);
  const treeSha = String(row(commit.tree).sha || '');
  if (!/^[0-9a-f]{40}$/i.test(treeSha)) throw new Error('GitHub tree was invalid.');
  const tree = await githubRequest(token, `/repos/${repo}/git/trees/${treeSha}?recursive=1`);
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const paths = entries.flatMap((value: unknown) => {
    const item = row(value);
    const path = typeof item.path === 'string' ? item.path : '';
    if (item.type !== 'blob' || !path || path.length > 300 || path.startsWith('.') || /(^|\/)(node_modules|dist|build|coverage)\//.test(path)) return [];
    return path.toLowerCase().includes(query) ? [path] : [];
  }).slice(0, 50);
  return { repo, branch, headSha, paths };
}

export async function githubCommitPullRequest(token: string, args: {
  repo: string; baseBranch: string; files: Array<{ path: string; content?: string; delete?: boolean }>;
  commitMessage: string; pullRequestTitle: string; pullRequestBody: string;
}): Promise<{ branch: string; commitSha: string; pullRequestUrl: string }> {
  const repo = safeRepo(args.repo);
  const baseBranch = safeBranch(args.baseBranch);
  if (!Array.isArray(args.files) || args.files.length < 1 || args.files.length > 20) throw new Error('Provide 1-20 changed files.');
  const commitMessage = args.commitMessage.trim().slice(0, 200);
  const title = args.pullRequestTitle.trim().slice(0, 200);
  const body = args.pullRequestBody.trim().slice(0, 10_000);
  if (!commitMessage || !title) throw new Error('Commit message and pull request title are required.');
  const ref = await githubRequest(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const baseSha = String(row(ref.object).sha || '');
  const commit = await githubRequest(token, `/repos/${repo}/git/commits/${baseSha}`);
  const baseTree = String(row(commit.tree).sha || '');
  const branch = `arc/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await githubRequest(token, `/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) });
  const tree = [] as Array<Record<string, unknown>>;
  for (const change of args.files) {
    const path = safePath(change.path);
    if (change.delete === true) {
      tree.push({ path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    if (typeof change.content !== 'string' || change.content.length > 500_000) throw new Error(`Invalid content for ${path}.`);
    const blob = await githubRequest(token, `/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: change.content, encoding: 'utf-8' }) });
    tree.push({ path, mode: '100644', type: 'blob', sha: String(blob.sha || '') });
  }
  const treeResult = await githubRequest(token, `/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
  const treeSha = String(treeResult.sha || '');
  const commitResult = await githubRequest(token, `/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: commitMessage, tree: treeSha, parents: [baseSha] }) });
  const commitSha = String(commitResult.sha || '');
  await githubRequest(token, `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commitSha, force: false }) });
  const pull = await githubRequest(token, `/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ title, body, head: branch, base: baseBranch }) });
  const pullRequestUrl = typeof pull.html_url === 'string' ? pull.html_url : '';
  if (!commitSha || !pullRequestUrl) throw new Error('GitHub did not return a commit or pull request URL.');
  return { branch, commitSha, pullRequestUrl };
}
