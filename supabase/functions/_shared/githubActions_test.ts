import {
  dispatchGitHubActionsWorkflow,
  getGitHubActionsRun,
  listGitHubActionsRuns,
  listGitHubActionsWorkflows,
} from './githubActions.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}

async function rejects(operation: () => Promise<unknown>, expected: string) {
  try { await operation(); } catch (error) {
    assert(error instanceof Error && error.message.includes(expected), String(error));
    return;
  }
  throw new Error(`Expected rejection: ${expected}`);
}

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { 'Content-Type': 'application/json' },
  });
}

Deno.test('GitHub Actions workflow discovery normalizes results and empty repositories', async () => {
  const calls: string[] = [];
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(String(input));
    requestInit = init;
    return response({ total_count: 2, workflows: [
      { id: 12, name: 'Tests', path: '.github/workflows/test.yml', state: 'active', html_url: 'https://github.com/o/r/actions/workflows/12' },
      { id: 'malformed' },
    ] });
  };
  const result = await listGitHubActionsWorkflows('fixture-token', 'owner/repo', fetcher);
  assert(result.totalCount === 2 && result.workflows.length === 1 && result.truncated);
  assert(result.workflows[0].id === 12 && result.workflows[0].name === 'Tests');
  assert(calls[0].endsWith('/repos/owner/repo/actions/workflows?per_page=100'));
  assert((requestInit?.headers as Record<string, string>)['X-GitHub-Api-Version'] === '2026-03-10');

  const empty = await listGitHubActionsWorkflows('fixture-token', 'owner/empty', async () => response({ total_count: 0, workflows: [] }));
  assert(empty.workflows.length === 0 && empty.totalCount === 0 && !empty.truncated);
});

Deno.test('workflow dispatch sends only the selected ref and returns a status link', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const result = await dispatchGitHubActionsWorkflow('fixture-token', {
    repo: 'owner/repo', workflowId: '42', ref: 'arc/feature-branch',
  }, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return response(null, 204);
  });
  assert(requestUrl.endsWith('/repos/owner/repo/actions/workflows/42/dispatches'));
  assert(requestInit?.method === 'POST');
  assert(requestInit?.headers && (requestInit.headers as Record<string, string>).Authorization === 'Bearer fixture-token');
  assert(JSON.stringify(JSON.parse(String(requestInit?.body))) === JSON.stringify({ ref: 'arc/feature-branch' }));
  assert(result.accepted && result.workflowRunId === null);
  assert(result.statusUrl === 'https://github.com/owner/repo/actions');

  const identified = await dispatchGitHubActionsWorkflow('fixture-token', {
    repo: 'owner/repo', workflowId: 42, ref: 'main',
  }, async () => response({ workflow_run_id: 987, html_url: 'https://github.com/owner/repo/actions/runs/987' }));
  assert(identified.workflowRunId === 987 && identified.statusUrl.endsWith('/runs/987'));
});

Deno.test('Actions run list and lookup expose normalized status without shell output', async () => {
  const fixture = {
    id: 987, name: 'Tests', workflow_id: 42, status: 'completed', conclusion: 'success',
    head_branch: 'arc/feature-branch', head_sha: 'abc123', html_url: 'https://github.com/o/r/actions/runs/987',
    created_at: '2026-09-24T10:00:00Z', updated_at: '2026-09-24T10:02:00Z',
  };
  let url = '';
  const listed = await listGitHubActionsRuns('fixture-token', { repo: 'owner/repo', workflowId: 42, ref: 'arc/feature-branch' }, async input => {
    url = String(input);
    return response({ total_count: 1, workflow_runs: [fixture] });
  });
  assert(url.includes('workflow_id=42') && url.includes('branch=arc%2Ffeature-branch'));
  assert(listed.runs[0].status === 'completed' && listed.runs[0].conclusion === 'success');
  assert(listed.runs[0].branch === 'arc/feature-branch' && listed.runs[0].commitSha === 'abc123');
  const fetched = await getGitHubActionsRun('fixture-token', { repo: 'owner/repo', runId: 987 }, async () => response(fixture));
  assert(fetched.id === 987 && fetched.htmlUrl.endsWith('/987'));
});

Deno.test('invalid inputs fail before any GitHub call and unavailable Actions are explained', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return response({}); };
  await rejects(() => listGitHubActionsWorkflows('fixture-token', 'owner/repo/extra', fetcher), 'valid GitHub repository');
  await rejects(() => dispatchGitHubActionsWorkflow('fixture-token', {
    repo: 'owner/repo', workflowId: 'abc', ref: 'main',
  }, fetcher), 'Choose a workflow');
  await rejects(() => dispatchGitHubActionsWorkflow('fixture-token', {
    repo: 'owner/repo', workflowId: '2', ref: '../main',
  }, fetcher), 'valid Git branch');
  assert(calls === 0, 'invalid requests must not call GitHub');

  await rejects(() => listGitHubActionsWorkflows('fixture-token', 'owner/repo', async () => response({ message: 'Actions disabled' }, 403)), 'Actions are unavailable');
  await rejects(() => listGitHubActionsWorkflows('fixture-token', 'owner/repo', async () => response({ message: 'Bad credentials' }, 401)), 'Reconnect GitHub');
  await rejects(() => dispatchGitHubActionsWorkflow('fixture-token', {
    repo: 'owner/repo', workflowId: '2', ref: 'main',
  }, async () => response({ message: 'workflow does not have workflow_dispatch trigger' }, 422)), 'needs a workflow_dispatch trigger');
});
