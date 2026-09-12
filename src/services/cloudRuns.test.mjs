import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = (await readFile(new URL('./cloudRuns.ts', import.meta.url), 'utf8'))
  .replace(/^import .*supabase\/client';/m, 'const { isSupabaseConfigured, supabase } = deps;')
  .replaceAll('import.meta.env.', 'deps.env.');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(handler) {
  const api = {}, requests = [];
  const deps = { isSupabaseConfigured: true,
    env: { VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'public' },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-user-token' } } }) } } };
  const fetch = async (url, options) => {
    assert.equal(url, 'https://test.invalid/functions/v1/cloud-run');
    assert.equal(options.headers.Authorization, 'Bearer test-user-token');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(JSON.stringify(body).includes('test-user-token'), false);
    return handler(body, options, requests.length);
  };
  new Function('exports', 'deps', 'fetch', compiled)(api, deps, fetch);
  return { api, requests };
}
const input = () => ({ sessionId: 'session', kind: 'chat', mode: 'auto', expectedRevision: 4,
  userMessage: { id: 'user-message', role: 'user', type: 'text', content: 'Hello', timestamp: '2026-09-12T00:00:00.000Z' },
  request: { messages: [{ role: 'user', content: 'Hello' }], reasoningEffort: 'medium' },
});

test('restored app association is a validated UUID, never arbitrary project data', async () => {
  const projectId = '00000000-0000-4000-8000-000000000001';
  const { api } = harness(body => Response.json(body.action === 'list'
    ? { runs:[{id:'run',sessionId:'session',kind:'app',mode:'ask',status:'queued',projectId}],nextCursor:null }
    : {id:body.id,status:'queued',projectId}));
  assert.equal((await api.listCloudRuns()).runs[0].projectId,projectId);
  assert.equal((await api.getCloudRunStatus('run')).projectId,projectId);
  for(const invalid of [null,{},'invalid']) {
    const {api: bad}=harness(body=>Response.json(body.action==='list'
      ? {runs:[{id:'run',sessionId:'session',kind:'app',mode:'ask',status:'queued',projectId:invalid}],nextCursor:null}
      : {id:body.id,status:'queued',projectId:invalid}));
    await assert.rejects(bad.listCloudRuns(),error=>error.code==='protocol');
    await assert.rejects(bad.getCloudRunStatus('run'),error=>error.code==='protocol');
  }
});

test('atomic submit snapshots stable user identity/revision and preserves exact retry payload', async () => {
  const { api, requests } = harness((body, _options, n) => Response.json({ id: body.id, status: n === 1 ? 'queued' : 'completed', sessionRevision: n === 1 ? 5 : 8, replayed: n > 1 }));
  const original = input();
  const submission = api.createCloudRunSubmission(original);
  original.userMessage.content = 'changed'; original.request.messages[0].content = 'changed'; original.expectedRevision = 99;
  const first = await api.submitCloudRun(submission);
  const second = await api.submitCloudRun(submission);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].id, submission.id);
  assert.equal(requests[0].userMessage.id, 'user-message');
  assert.equal(requests[0].userMessage.content, 'Hello');
  assert.equal(requests[0].userMessage.timestamp, '2026-09-12T00:00:00.000Z');
  assert.equal(requests[0].expectedRevision, 4);
  assert.equal(first.sessionRevision, 5); assert.equal(first.replayed, false);
  assert.equal(second.sessionRevision, 8); assert.equal(second.replayed, true);
});

test('workspace snapshot is exact, bounded, immutable across retries and separate from raw user', async()=>{
  const {api,requests}=harness(body=>Response.json({id:body.id,status:'queued',sessionRevision:5,replayed:false}));
  const original=input();original.request.workspace_context={kind:'code',content:'const value = 1;\n'.repeat(1500),language:'typescript',label:'Draft'};
  const expected=structuredClone(original.request.workspace_context);
  const submission=api.createCloudRunSubmission(original);
  original.request.workspace_context.content='changed after click';
  await api.submitCloudRun(submission);await api.submitCloudRun(submission);
  assert.deepEqual(requests[0].request.workspace_context,expected);
  assert.equal(requests[0].userMessage.content,'Hello');
  assert.equal(requests[0].request.messages.at(-1).content,'Hello');
  assert.deepEqual(requests[0],requests[1]);
  assert.deepEqual(api.captureCloudWorkspaceContext({kind:'canvas',content:''}),{kind:'canvas',content:''});
  for(const value of [null,[],{kind:'code',content:'x',owner:'other'},{kind:'system',content:'x'},
    {kind:'code',content:'x'.repeat(400001)},{kind:'canvas',content:'x',label:'x'.repeat(201)},
    {kind:'code',content:'x',language:null}]) {
    assert.throws(()=>api.captureCloudWorkspaceContext(value));
  }
});

test('409 conflict is exposed without retries or fallback', async () => {
  const { api, requests } = harness(() => Response.json({ error: 'stale revision' }, { status: 409 }));
  const submission = api.createCloudRunSubmission(input());
  await assert.rejects(api.submitCloudRun(submission), error => error.httpStatus === 409 && error.id === submission.id);
  assert.equal(requests.length, 1);
});

test('uncertain submission recovers via status with same id, never auto resubmits', async () => {
  const { api, requests } = harness((body, options) => {
    if (body.action === 'status') return Response.json({ id: body.id, status: 'completed', result: { content: 'Saved' } });
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError'))));
  });
  const submission = api.createCloudRunSubmission(input());
  await assert.rejects(api.submitCloudRun(submission, { timeoutMs: 1 }), error => error.code === 'timeout');
  const result = await api.getCloudRunStatus(submission.id);
  assert.equal(result.status, 'completed');
  assert.deepEqual(requests.map(r => [r.action, r.id]), [['submit', submission.id], ['status', submission.id]]);
});

test('invalid atomic submission receipt is not treated as success', async () => {
  for (const receipt of [{}, { sessionRevision: -1, replayed: false }, { sessionRevision: 5, replayed: 'yes' }]) {
    const { api, requests } = harness(body => Response.json({ id: body.id, status: 'queued', ...receipt }));
    await assert.rejects(api.submitCloudRun(api.createCloudRunSubmission(input())), error => error.code === 'protocol');
    assert.equal(requests.length, 1);
  }
});
