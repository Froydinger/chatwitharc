const GITHUB_API = 'https://api.github.com';
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
};

export type GitHubActionsWorkflow = {
  id: number;
  name: string;
  path: string;
  state: string;
  htmlUrl: string;
};

export type GitHubActionsRun = {
  id: number;
  name: string;
  workflowId: number;
  status: string;
  conclusion: string | null;
  branch: string;
  commitSha: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid Actions response.');
  }
  return value as Json;
}

export function validateActionsRepo(repo: unknown): string {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Choose a valid GitHub repository.');
  }
  return repo;
}

export function validateActionsRef(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length < 1 || ref.length > 200 || ref.startsWith('-')
    || ref.includes('..') || ref.includes('@{') || ref.endsWith('.')
    || /[\s~^:?*\\[\]]/.test(ref)) {
    throw new Error('Choose a valid Git branch or tag.');
  }
  return ref;
}

function validateWorkflowId(id: unknown): string {
  const value = typeof id === 'number' && Number.isSafeInteger(id) ? String(id)
    : typeof id === 'string' ? id : '';
  if (!/^\d{1,20}$/.test(value)) throw new Error('Choose a workflow from the repository Actions list.');
  return value;
}

function validateRunId(id: unknown): string {
  const value = typeof id === 'number' && Number.isSafeInteger(id) ? String(id)
    : typeof id === 'string' ? id : '';
  if (!/^\d{1,20}$/.test(value)) throw new Error('Provide a valid GitHub Actions run ID.');
  return value;
}

function safeMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;
  const message = (body as Json).message;
  return typeof message === 'string' ? message.slice(0, 180) : fallback;
}

async function request(
  token: string,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const response = await fetcher(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub authorization expired. Reconnect GitHub.');
    if (response.status === 422 && path.endsWith('/dispatches')) {
      throw new Error('This workflow cannot be manually started. It needs a workflow_dispatch trigger in the repository; no Actions run was started.');
    }
    if (response.status === 403 || response.status === 404) {
      throw new Error('GitHub Actions are unavailable for this repository. Check that Actions are enabled and the connected account can access them.');
    }
    throw new Error(`GitHub Actions request failed (${response.status}): ${safeMessage(body, 'Request failed.')}`);
  }
  return { status: response.status, body };
}

function workflow(value: unknown): GitHubActionsWorkflow | null {
  const item = record(value);
  const id = item.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || typeof item.name !== 'string'
    || typeof item.path !== 'string' || typeof item.state !== 'string') return null;
  return {
    id,
    name: item.name.slice(0, 160),
    path: item.path.slice(0, 300),
    state: item.state.slice(0, 40),
    htmlUrl: typeof item.html_url === 'string' ? item.html_url.slice(0, 500) : '',
  };
}

function run(value: unknown): GitHubActionsRun | null {
  const item = record(value);
  const id = item.id;
  const workflowId = item.workflow_id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || typeof workflowId !== 'number'
    || !Number.isSafeInteger(workflowId) || typeof item.status !== 'string'
    || typeof item.head_branch !== 'string' || typeof item.head_sha !== 'string'
    || typeof item.html_url !== 'string' || typeof item.created_at !== 'string'
    || typeof item.updated_at !== 'string') return null;
  return {
    id,
    name: typeof item.name === 'string' ? item.name.slice(0, 160) : `Workflow ${workflowId}`,
    workflowId,
    status: item.status.slice(0, 40),
    conclusion: typeof item.conclusion === 'string' ? item.conclusion.slice(0, 40) : null,
    branch: item.head_branch.slice(0, 200),
    commitSha: item.head_sha.slice(0, 64),
    htmlUrl: item.html_url.slice(0, 500),
    createdAt: item.created_at.slice(0, 40),
    updatedAt: item.updated_at.slice(0, 40),
  };
}

export async function listGitHubActionsWorkflows(
  token: string,
  repoInput: unknown,
  fetcher: typeof fetch = fetch,
): Promise<{ workflows: GitHubActionsWorkflow[]; totalCount: number; truncated: boolean }> {
  const repo = validateActionsRepo(repoInput);
  const { body } = await request(token, `/repos/${repo}/actions/workflows?per_page=100`, {}, fetcher);
  const payload = record(body);
  const raw = Array.isArray(payload.workflows) ? payload.workflows : [];
  const workflows = raw.flatMap(value => {
    try { const parsed = workflow(value); return parsed ? [parsed] : []; }
    catch { return []; }
  });
  const count = typeof payload.total_count === 'number' && Number.isFinite(payload.total_count)
    ? Math.max(0, Math.trunc(payload.total_count)) : workflows.length;
  return { workflows, totalCount: count, truncated: count > workflows.length };
}

export async function dispatchGitHubActionsWorkflow(
  token: string,
  args: { repo: unknown; workflowId: unknown; ref: unknown },
  fetcher: typeof fetch = fetch,
): Promise<{ accepted: true; workflowRunId: number | null; workflowRunUrl: string | null; statusUrl: string }> {
  const repo = validateActionsRepo(args.repo);
  const workflowId = validateWorkflowId(args.workflowId);
  const ref = validateActionsRef(args.ref);
  const dispatched = await request(token, `/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref }),
  }, fetcher);
  const body = dispatched.body && typeof dispatched.body === 'object' && !Array.isArray(dispatched.body)
    ? dispatched.body as Json : {};
  const runId = typeof body.workflow_run_id === 'number' && Number.isSafeInteger(body.workflow_run_id)
    ? body.workflow_run_id : typeof body.run_id === 'number' && Number.isSafeInteger(body.run_id) ? body.run_id : null;
  const runUrl = typeof body.html_url === 'string' ? body.html_url.slice(0, 500)
    : typeof body.run_url === 'string' ? body.run_url.slice(0, 500) : null;
  return {
    accepted: true,
    workflowRunId: runId,
    workflowRunUrl: runUrl,
    statusUrl: `https://github.com/${repo}/actions${runId ? `/runs/${runId}` : ''}`,
  };
}

export async function listGitHubActionsRuns(
  token: string,
  args: { repo: unknown; workflowId?: unknown; ref?: unknown },
  fetcher: typeof fetch = fetch,
): Promise<{ runs: GitHubActionsRun[]; totalCount: number }> {
  const repo = validateActionsRepo(args.repo);
  const query = new URLSearchParams({ per_page: '20' });
  if (args.workflowId !== undefined) query.set('workflow_id', validateWorkflowId(args.workflowId));
  if (args.ref !== undefined) query.set('branch', validateActionsRef(args.ref));
  const { body } = await request(token, `/repos/${repo}/actions/runs?${query.toString()}`, {}, fetcher);
  const payload = record(body);
  const raw = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  const runs = raw.flatMap(value => {
    try { const parsed = run(value); return parsed ? [parsed] : []; }
    catch { return []; }
  });
  const count = typeof payload.total_count === 'number' && Number.isFinite(payload.total_count)
    ? Math.max(0, Math.trunc(payload.total_count)) : runs.length;
  return { runs, totalCount: count };
}

export async function getGitHubActionsRun(
  token: string,
  args: { repo: unknown; runId: unknown },
  fetcher: typeof fetch = fetch,
): Promise<GitHubActionsRun> {
  const repo = validateActionsRepo(args.repo);
  const runId = validateRunId(args.runId);
  const { body } = await request(token, `/repos/${repo}/actions/runs/${runId}`, {}, fetcher);
  const result = run(body);
  if (!result) throw new Error('GitHub returned an invalid Actions run.');
  return result;
}
