import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { continueCloudRun } from './cloudRunBurst.ts';
Deno.test('burst advances checkpoints promptly and stops on completion', async () => {
  let steps = 0;
  const result = await continueCloudRun('run', {
    advance: async () => { steps++; return true; },
    inspect: async () => ({ status: steps === 4 ? 'completed' : 'queued', waitingForModel: false }),
    wait: async () => { throw new Error('Tool checkpoints should not wait'); },
  });
  equal(result.steps, 4); equal(result.requeue, false);
});
Deno.test('burst backs off provider polls, bounds runtime and requests continuation', async () => {
  let clock = 0; const waits: number[] = [];
  const result = await continueCloudRun('run', {
    advance: async () => true, inspect: async () => ({ status: 'queued', waitingForModel: true }),
    now: () => clock, durationMs: 1600,
    wait: async ms => { waits.push(ms); clock += ms; },
  });
  deepStrictEqual(waits, [750, 750, 100]); equal(result.steps, 3); equal(result.requeue, true);
});
Deno.test('burst cannot bypass a lost claim, approval, cancellation or another worker', async () => {
  const lost = await continueCloudRun('run', { advance: async () => false, inspect: async () => { throw new Error('must not inspect'); } });
  equal(lost.steps, 0); equal(lost.requeue, false);
  for (const status of ['awaiting_input', 'cancelled', 'failed', 'running']) {
    let calls = 0;
    const result = await continueCloudRun('run', { advance: async () => { calls++; return true; }, inspect: async () => ({ status, waitingForModel: false }) });
    equal(calls, 1); equal(result.requeue, false);
  }
});
Deno.test('burst never retries ambiguous operations and bounds immediate tool chains', async () => {
  let calls = 0;
  await rejects(continueCloudRun('run', { advance: async () => { calls++; throw new Error('unknown provider outcome'); }, inspect: async () => null }));
  equal(calls, 1);
  const result = await continueCloudRun('run', { maxSteps: 3, advance: async () => true, inspect: async () => ({ status: 'queued', waitingForModel: false }) });
  equal(result.steps, 3); equal(result.requeue, true);
});
