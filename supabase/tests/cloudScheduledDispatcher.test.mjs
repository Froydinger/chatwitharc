// Executable characterization of UNFIXED legacy dispatcher gaps. Real handler
// source, fake DB/provider/push ports only. No network, keys, or source changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const source = readFileSync(new URL('../functions/run-scheduled-tasks/index.ts', import.meta.url), 'utf8');
function setup({ concurrent = false, cancelDuringModel = false, pushStatus = 200 } = {}) {
  const task = { id: randomUUID(), user_id: randomUUID(), title: 'Fixture', prompt: 'Reminder', schedule_type: 'once',
    next_run_at: '2000-01-01T00:00:00Z', status: 'active', push_on_complete: true, notify_email: false, result_chat_id: null };
  const tasks = [task], runs = [], chats = [], effects = { models: 0, pushes: 0 };
  let release, readers = 0;
  const barrier = new Promise(resolve => { release = resolve; });
  const tables = { scheduled_tasks: tasks, scheduled_task_runs: runs, chat_sessions: chats };
  const db = { from(table) {
    assert.ok(table in tables); let operation = 'select', value, single = false; const filters = [];
    const builder = {
      select() { return builder; }, insert(v) { operation = 'insert'; value = v; return builder; },
      update(v) { operation = 'update'; value = v; return builder; }, upsert(v) { operation = 'upsert'; value = v; return builder; },
      eq(k, v) { filters.push(row => row[k] === v); return builder; },
      lte(k, v) { filters.push(row => row[k] <= v); return builder; }, limit() { return builder; },
      single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
      then(resolve, reject) {
        return (async () => {
          let rows;
          if (operation === 'select') {
            rows = structuredClone(tables[table].filter(row => filters.every(f => f(row))));
            if (table === 'scheduled_tasks' && concurrent && readers < 2) { if (++readers === 2) release(); await barrier; }
          } else if (operation === 'insert') {
            const row = { id: randomUUID(), ...structuredClone(value) }; tables[table].push(row); rows = [row];
          } else if (operation === 'update') {
            rows = tables[table].filter(row => filters.every(f => f(row))); rows.forEach(row => Object.assign(row, structuredClone(value)));
          } else {
            const existing = tables[table].find(row => row.id === value.id);
            if (existing) Object.assign(existing, structuredClone(value)); else tables[table].push(structuredClone(value));
            rows = [value];
          }
          return { data: single ? rows[0] ?? null : rows, error: null };
        })().then(resolve, reject);
      },
    }; return builder;
  } };
  let handler;
  const fakeFetch = async url => {
    if (url === 'https://api.openai.com/v1/chat/completions') {
      effects.models++;
      if (cancelDuringModel) { tasks.length = 0; runs.length = 0; } // DELETE + task_runs cascade.
      return Response.json({ choices: [{ message: { content: 'Time for your reminder.' } }] });
    }
    if (url === 'https://fixture.invalid/functions/v1/send-push-notification') {
      effects.pushes++; return Response.json({ sent: 0, failed: 1 }, { status: pushStatus });
    }
    throw new Error('Unmocked network blocked');
  };
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'require', 'Deno', 'fetch', 'console', code)({}, name => {
    assert.equal(name, 'https://esm.sh/@supabase/supabase-js@2.45.0'); return { createClient: () => db };
  }, { env: { get: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-test-only', OPENAI_API_KEY: 'never-used' })[key] }, serve: fn => { handler = fn; } },
  fakeFetch, { log() {}, error() {} });
  return { tasks, runs, chats, effects, fire: () => handler(new Request('https://fixture.invalid/run', { headers: { Authorization: 'Bearer local-test-only' } })) };
}
test('UNFIXED: two real dispatcher invocations pick the same occurrence and duplicate paid work/chat/push', async () => {
  const f = setup({ concurrent: true }); const results = await Promise.all([f.fire(), f.fire()]);
  assert.deepEqual(await Promise.all(results.map(r => r.json())), [{ ran: 1 }, { ran: 1 }]);
  assert.equal(f.effects.models, 2); assert.equal(f.runs.length, 2); assert.equal(f.chats.length, 2); assert.equal(f.effects.pushes, 2);
});
test('UNFIXED: push HTTP failure still completes once task, leaving no retry on next tick', async () => {
  const f = setup({ pushStatus: 503 }); await f.fire();
  assert.equal(f.tasks[0].status, 'completed'); assert.equal(f.runs[0].status, 'succeeded');
  assert.deepEqual(await (await f.fire()).json(), { ran: 0 }); assert.equal(f.effects.pushes, 1);
});
test('UNFIXED: cancellation after pickup does not fence actual handler completion or delivery', async () => {
  const f = setup({ cancelDuringModel: true }); await f.fire();
  assert.equal(f.tasks.length, 0); assert.equal(f.runs.length, 0);
  assert.equal(f.chats.length, 1); assert.equal(f.effects.pushes, 1);
});
