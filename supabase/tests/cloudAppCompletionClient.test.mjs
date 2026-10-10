// Actual completion caller and diagnostic sanitizer, transpiled as in the other
// Node Edge Function tests. Only the database port is fake: no HTTP, PostgREST
// server, paid provider, production configuration, or database writes are used.
// Run: node --test supabase/tests/cloudAppCompletionClient.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const modules = new Map(['cloudAppCore.ts', 'cloudAppPersistence.ts', 'cloudRunScheduler.ts'].map(name => [
  `./${name}`,
  ts.transpileModule(readFileSync(new URL(`../functions/_shared/${name}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
]));
const run = {
  id: '00000000-0000-4000-8000-000000000001',
  lease_token: '00000000-0000-4000-8000-000000000002',
  session_id: '00000000-0000-4000-8000-000000000003',
  user_id: '00000000-0000-4000-8000-000000000004',
  kind: 'app',
  request: {
    projectId: '00000000-0000-4000-8000-000000000005',
    messages: [{ role: 'user', content: 'Build the fixture app.' }],
  },
};
const result = { text: 'Fixture app ready.' };
const message = { id: `cloud-${run.id}`, role: 'assistant', content: result.text };
const expectedCall = {
  name: 'cloud_app_step',
  args: {
    p_run_id: run.id,
    p_lease_token: run.lease_token,
    p_action: 'complete',
    p_result: result,
    p_message: message,
  },
};

function setup(responses) {
  const calls = [], scheduledRetries = [], cache = new Map();
  const forbidden = action => { throw new Error(`Unexpected ${action} in completion caller`); };
  const schedule = (...args) => { scheduledRetries.push(args); return forbidden('retry timer'); };
  function load(name) {
    assert.ok(modules.has(name), `Unexpected runtime dependency: ${name}`);
    if (!cache.has(name)) {
      const exports = {};
      cache.set(name, exports);
      new Function('exports', 'require', 'fetch', 'setTimeout', 'setInterval', modules.get(name))(
        exports, load, () => forbidden('network request'), schedule, schedule,
      );
    }
    return cache.get(name);
  }
  const db = {
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      assert.ok(calls.length <= responses.length, 'Unexpected automatic RPC retry');
      return responses[calls.length - 1];
    },
    from() { return forbidden('table access'); },
  };
  return {
    persistence: load('./cloudAppPersistence.ts').cloudAppPersistence(db),
    logFields: load('./cloudRunScheduler.ts').cloudFailureLogFields,
    calls,
    scheduledRetries,
  };
}

for (const code of ['PT409', '40001']) {
  test(`complete preserves ${code} diagnostics and rejects after exactly one RPC without retry`, async () => {
    const fixture = setup([{ data: null, error: {
      code,
      message: code === 'PT409' ? 'Completion lease expired' : 'could not serialize access due to concurrent update',
      details: 'private fixture payload must not reach diagnostics',
      hint: 'private fixture recovery hint',
    } }]);
    await assert.rejects(fixture.persistence.complete(run, result, message), error => {
      assert.equal(error.name, 'CloudAppPersistenceError');
      assert.equal(error.safeCode, code);
      assert.equal(error.safeAction, 'complete');
      assert.equal(error.message, 'App persistence unavailable; same receipt required for recovery.');
      assert.deepEqual(fixture.logFields(error), {
        errorName: 'CloudAppPersistenceError', dbCode: code, action: 'complete',
      });
      assert.doesNotMatch(JSON.stringify(error), /private fixture|lease expired|serialize access/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.deepEqual(fixture.calls, [expectedCall]);
    assert.deepEqual(fixture.scheduledRetries, []);
  });
}

test('complete sanitizes an unsafe database code without exposing the database error', async () => {
  const fixture = setup([{ data: null, error: {
    code: 'private/token', message: 'private fixture database message',
  } }]);
  await assert.rejects(fixture.persistence.complete(run, result, message), error => {
    assert.deepEqual(fixture.logFields(error), {
      errorName: 'CloudAppPersistenceError', dbCode: 'UNKNOWN', action: 'complete',
    });
    assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /private/);
    return true;
  });
  assert.deepEqual(fixture.calls, [expectedCall]);
  assert.deepEqual(fixture.scheduledRetries, []);
});

const completedReceipt = {
  status: 'completed',
  artifact: {
    projectId: run.request.projectId, runId: run.id, version: 2,
    published: true, executed: false, tested: false, deployed: false,
  },
};

for (const receipt of [completedReceipt, { status: 'fenced' }, { status: 'conflict' }, { status: 'denied' }]) {
  test(`complete preserves the ${receipt.status} receipt without retry`, async () => {
    const fixture = setup([{ data: receipt, error: null }]);
    assert.deepEqual(await fixture.persistence.complete(run, result, message), receipt);
    assert.deepEqual(fixture.calls, [expectedCall]);
    assert.deepEqual(fixture.scheduledRetries, []);
  });
}

test('an explicit duplicate completion preserves the database fenced receipt and original request identity', async () => {
  // The SQL regression suite verifies duplicate protection in the database.
  // Here, model its receipts to verify the caller neither retries nor rewrites them.
  const fixture = setup([
    { data: completedReceipt, error: null },
    { data: { status: 'fenced' }, error: null },
  ]);
  assert.deepEqual(await fixture.persistence.complete(run, result, message), completedReceipt);
  assert.deepEqual(fixture.calls, [expectedCall]);
  assert.deepEqual(await fixture.persistence.complete(run, result, message), { status: 'fenced' });
  assert.deepEqual(fixture.calls, [expectedCall, expectedCall]);
  assert.deepEqual(fixture.scheduledRetries, []);
});
