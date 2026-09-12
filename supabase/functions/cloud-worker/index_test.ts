import { deepStrictEqual, equal } from 'node:assert/strict';
import { handleCloudWorker } from './index.ts';

Deno.test('cloud worker endpoint: disabled, browser and anonymous callers cannot sweep', async () => {
  let calls = 0;
  const sweep = () => { calls++; return Promise.resolve({ advanced: 1 }); };
  for (const [enabled, token, expected] of [[false, 'fixture-secret', 503], [true, '', 401], [true, 'user-jwt', 401], [true, 'anon-key', 401]] as const) {
    const response = await handleCloudWorker(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), { enabled, secret: 'fixture-secret', sweep });
    equal(response.status, expected);
  }
  equal(calls, 0);
});

Deno.test('cloud worker endpoint: authenticated scheduler sweeps without trusting request data', async () => {
  let calls = 0;
  const response = await handleCloudWorker(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture-secret' }, body: JSON.stringify({ user_id: 'attacker', tools: ['fake'] }) }), {
    enabled: true, secret: 'fixture-secret', sweep: () => { calls++; return Promise.resolve({ examined: 2, advanced: 1, skipped: 1, failed: 0 }); },
  });
  equal(response.status, 200); equal(calls, 1);
  deepStrictEqual(await response.json(), { examined: 2, advanced: 1, skipped: 1, failed: 0 });
});

Deno.test('cloud worker endpoint: configuration and internal failures do not expose data', async () => {
  const req = new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture-secret' } });
  equal((await handleCloudWorker(req, { enabled: true, secret: '', sweep: () => { throw new Error('unexpected'); } })).status, 401);
  const response = await handleCloudWorker(req, { enabled: true, secret: 'fixture-secret', sweep: () => Promise.reject(new Error('private provider or database contents')) });
  equal(response.status, 503);
  deepStrictEqual(await response.json(), { error: 'Cloud sweep could not complete.' });
});
