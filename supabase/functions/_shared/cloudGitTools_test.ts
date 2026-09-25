import { cloudGitTools } from './cloudGitTools.ts';

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

function fixture(connection: Record<string, unknown>) {
  const queries: Array<Record<string, string>> = [];
  const db = {
    from(table: string) {
      assert(table === 'git_connections', `unexpected table: ${table}`);
      return {
        select(_columns: string) {
          const filters: Record<string, string> = {};
          const query = {
            eq(column: string, value: string) { filters[column] = value; return query; },
            maybeSingle() {
              queries.push({ ...filters });
              return Promise.resolve({
                data: filters.user_id === connection.user_id && filters.provider === connection.provider ? connection : null,
                error: null,
              });
            },
          };
          return query;
        },
      };
    },
  };
  return { db: db as never, queries };
}

Deno.test('Actions dispatch requires explicit approval and enforces selected repository allowlist', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const connection = {
    user_id: ownerId, provider: 'github', repo_access_mode: 'selected', allowed_repos: ['owner/allowed'],
  };
  const denied = fixture(connection);
  const fetchCalls = { count: 0 };
  const deniedTool = cloudGitTools({
    db: denied.db,
    authorizeOwner: async () => true,
    tokenProvider: async () => 'fixture-token',
    fetcher: async () => { fetchCalls.count++; return new Response(null, { status: 204 }); },
  }).git_dispatch_actions_workflow;
  assert(deniedTool.approval === 'always' && deniedTool.replaySafe === false);
  assert(fetchCalls.count === 0, 'registering the tool must not contact GitHub');
  await rejects(() => deniedTool.execute(
    { user_id: ownerId } as never,
    { arguments: JSON.stringify({ repo: 'owner/private', workflowId: '12', ref: 'main' }) } as never,
    'not-used',
  ), 'not enabled in your GitHub settings');
  assert(fetchCalls.count === 0, 'a disallowed repository must not contact GitHub');

  const allowed = fixture(connection);
  const approvedTool = cloudGitTools({
    db: allowed.db,
    authorizeOwner: async () => true,
    tokenProvider: async userId => {
      assert(userId === ownerId);
      return 'fixture-token';
    },
    fetcher: async (input, init) => {
      fetchCalls.count++;
      assert(String(input).endsWith('/repos/owner/allowed/actions/workflows/12/dispatches'));
      assert(init?.method === 'POST');
      return new Response(null, { status: 204 });
    },
  }).git_dispatch_actions_workflow;
  const output = await approvedTool.execute(
    { user_id: ownerId } as never,
    { arguments: JSON.stringify({ repo: 'owner/allowed', workflowId: '12', ref: 'arc/update' }) } as never,
    'approved-test-receipt',
  );
  const result = JSON.parse(typeof output === 'string' ? output : output.output);
  assert(Number(fetchCalls.count) === 1 && result.accepted === true && result.ref === 'arc/update');
  assert(allowed.queries.length === 1 && allowed.queries[0].user_id === ownerId);
});

Deno.test('unknown GitHub repository access mode fails closed', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const f = fixture({ user_id: ownerId, provider: 'github', allowed_repos: ['owner/repo'] });
  const tool = cloudGitTools({ db: f.db, authorizeOwner: async () => true,
    tokenProvider: async () => 'fixture-token', fetcher: async () => { throw new Error('unexpected fetch'); } })
    .git_list_actions_workflows;
  await rejects(() => tool.execute({ user_id: ownerId } as never,
    { arguments: JSON.stringify({ repo: 'owner/repo' }) } as never, 'test'), 'settings could not be verified');
});
