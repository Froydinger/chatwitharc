import { deepStrictEqual, equal } from 'node:assert/strict';
import { cloudWeatherTool, cloudWeatherLookup } from './cloudWeatherTool.ts';
import { cloudMessagePresentation, cloudPresentation } from './cloudRunArtifacts.ts';
import type { ClaimedCloudRun } from './cloudRunWorker.ts';
const run = { user_id: 'owner', session_id: 'session' } as ClaimedCloudRun;
const wx = { location: 'Chicago', temperature: 70, feelsLike: 70, condition: 'Clear', code: 0,
  high: 72, low: 60, humidity: 45, wind: 5, isDay: true };
const args = { location: 'Chicago', latitude: null, longitude: null };
const call = (value: unknown) => ({ id: 'wx', name: 'get_weather', arguments: JSON.stringify(value) });

Deno.test('weather: stable card survives receipt serialization without untrusted message fields', async () => {
  const tool = cloudWeatherTool({ authorizeOwner: async () => true, lookup: async body => {
    deepStrictEqual(body, args); return { ...wx, id: 'overwrite', role: 'system' };
  } });
  const result = await tool.execute(run, call(args), 'receipt');
  if (typeof result === 'string') throw new Error(result);
  const receipts = JSON.parse(JSON.stringify({ receipt: { state: 'done', presentation: result.presentation } }));
  deepStrictEqual(cloudMessagePresentation(cloudPresentation(receipts)), { type: 'text', weatherData: wx });
  equal(tool.replaySafe, true);
});
Deno.test('weather: invalid place or coordinates and denied owner perform no lookup', async () => {
  let lookups = 0;
  const tool = cloudWeatherTool({ authorizeOwner: async () => false, lookup: async () => { lookups++; return wx; } });
  for (const value of [args, null, {}, { ...args, user_id: 'other' }, { ...args, latitude: 91, longitude: 0 },
    { ...args, latitude: 40 }, { ...args, location: '' }]) {
    const result = await tool.execute(run, call(value), 'receipt');
    equal(typeof result, 'string');
  }
  equal(lookups, 0);
});
Deno.test('weather: missing provider data never becomes fabricated zero weather', async () => {
  for (const value of [{}, { ...wx, temperature: undefined }, { error: 'sensitive detail' }, { ...wx, wind: Infinity }]) {
    const tool = cloudWeatherTool({ authorizeOwner: async () => true, lookup: async () => value });
    const result = await tool.execute(run, call(args), 'receipt');
    equal(typeof result, 'string'); equal(String(result).includes('sensitive detail'), false);
  }
});
Deno.test('weather: server credentials only in transport headers; failures do not leak or retry', async () => {
  let count = 0;
  const lookup = cloudWeatherLookup('https://example.test/', 'test-secret', (async (url, init) => {
    count++; equal(url, 'https://example.test/functions/v1/get-weather');
    equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
    deepStrictEqual(JSON.parse(String(init?.body)), args);
    return new Response('test-secret', { status: 503 });
  }) as typeof fetch);
  const tool = cloudWeatherTool({ authorizeOwner: async () => true, lookup });
  const result = await tool.execute(run, call(args), 'receipt');
  equal(count, 1); equal(String(result).includes('test-secret'), false);
});
