import { deepStrictEqual, equal, throws } from 'node:assert/strict';
import { arcCostInUsd, arcProviderBudgetCents, priceArcProviderUsage, priceArcTokenUsage } from './arcUsageAccounting.ts';

Deno.test('usage pricing: ordinary Luna/Sol/Astra ratios and sub-cent amounts', () => {
  const tokens = { inputTokens: 3_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 800 };
  equal(arcCostInUsd(priceArcTokenUsage('gpt-6-luna', tokens).costNanos), 0.0007);
  equal(priceArcTokenUsage('gpt-6.1-sol', tokens).costNanos, 14_000_000);
  equal(priceArcTokenUsage('gpt-6-astra', tokens).costNanos, 70_000_000);
  equal(priceArcTokenUsage('gpt-6.1-sol', tokens).costNanos / priceArcTokenUsage('gpt-6-luna', tokens).costNanos, 20);
});
Deno.test('usage pricing: cached Sol input is 10x Luna, not a blanket 20x', () => {
  const tokens = { inputTokens: 1_000, cachedInputTokens: 1_000, cacheWriteTokens: 0, outputTokens: 0 };
  equal(priceArcTokenUsage('gpt-6-luna', tokens).costNanos, 10_000);
  equal(priceArcTokenUsage('gpt-6.1-sol', tokens).costNanos, 100_000);
  equal(priceArcTokenUsage('gpt-6-astra', tokens).costNanos, 1_000_000);
});
Deno.test('usage pricing: cache writes replace their ordinary input charge', () => {
  equal(priceArcTokenUsage('gpt-6-luna', { inputTokens: 1_000, cachedInputTokens: 200, cacheWriteTokens: 300, outputTokens: 10 }).costNanos,
    500 * 100 + 200 * 10 + 300 * 125 + 10 * 500);
});
Deno.test('usage pricing: long context applies to the whole request after 272K input', () => {
  const tokens = { inputTokens: 272_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2 };
  equal(priceArcTokenUsage('gpt-6-luna', tokens).longContext, false);
  const price = priceArcTokenUsage('gpt-6-luna', { ...tokens, inputTokens: 272_001 });
  equal(price.longContext, true);
  equal(price.costNanos, 272_001 * 100 * 2 + 2 * 500 * 1.5);
});
Deno.test('usage pricing: Responses and Chat Completions details include reasoning once', () => {
  const responses = { input_tokens: 3_000, output_tokens: 800, total_tokens: 3_800,
    input_tokens_details: { cached_tokens: 1_000 }, output_tokens_details: { reasoning_tokens: 500 } };
  const completion = { prompt_tokens: 3_000, completion_tokens: 800, total_tokens: 3_800,
    prompt_tokens_details: { cached_tokens: 1_000 }, completion_tokens_details: { reasoning_tokens: 500 } };
  deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', responses), priceArcProviderUsage('gpt-6.1-sol', completion));
  equal(priceArcProviderUsage('gpt-6.1-sol', responses)?.costNanos, 12_100_000);
});
Deno.test('usage pricing: missing usage retains uncertainty; total-only is conservative', () => {
  equal(priceArcProviderUsage('gpt-6-luna', undefined), null);
  equal(priceArcProviderUsage('gpt-6-luna', {}), null);
  equal(priceArcProviderUsage('gpt-6-luna', { total_tokens: 1 })?.costNanos, 500);
  equal(priceArcProviderUsage('gpt-6-luna', { total_tokens: 0 })?.costNanos, 0);
  const long = priceArcProviderUsage('gpt-6-astra', { total_tokens: 272_001 });
  equal(long?.basis, 'conservative-total-tokens');
  equal(long?.costNanos, 272_001 * 75_000);
});
Deno.test('usage pricing: aggregate session input does not prove per-request long context', () => {
  const usage = { input_tokens: 300_000, output_tokens: 1_000 };
  equal(priceArcProviderUsage('gpt-6.1-sol', usage)?.basis,'provider-token-detail');
  const session = priceArcProviderUsage('gpt-6.1-sol', usage, { aggregation: 'session' });
  equal(session?.basis,'conservative-session-detail');
  equal(session?.costNanos,1_515_000_000);
  equal(session?.cacheWriteTokensEstimated, true);
  const knownWrites = priceArcProviderUsage('gpt-6.1-sol', { ...usage, cache_write_tokens: 0 }, { aggregation: 'session' });
  equal(knownWrites?.basis, 'conservative-session-detail');
  equal(knownWrites?.costNanos, 1_215_000_000);
  equal(knownWrites?.cacheWriteTokensEstimated, undefined);
});
Deno.test('usage pricing: Agents missing writes uses an explicit upper bound below 272K', () => {
  const usage = { input_tokens: 1_000, input_tokens_details: { cached_tokens: 200 }, output_tokens: 10, total_tokens: 1_010 };
  for (const [model, cachedRate, writeRate, outputRate] of [
    ['gpt-6-luna', 10, 125, 500],
    ['gpt-6.1-sol', 100, 2_500, 10_000],
    ['gpt-6-astra', 1_000, 12_500, 50_000],
  ] as const) {
    const price = priceArcProviderUsage(model, usage, { aggregation: 'session' });
    equal(price?.basis, 'conservative-session-detail');
    equal(price?.cacheWriteTokensEstimated, true);
    equal(price?.longContext, false);
    equal(price?.costNanos, 200 * cachedRate + 800 * writeRate + 10 * outputRate);
    deepStrictEqual(price?.tokens, { inputTokens: 1_000, cachedInputTokens: 200, cacheWriteTokens: 800, outputTokens: 10 });
  }
  const nullWrites = { ...usage, input_tokens_details: { cached_tokens: 200, cache_write_tokens: null } };
  deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', nullWrites, { aggregation: 'session' }),
    priceArcProviderUsage('gpt-6.1-sol', usage, { aggregation: 'session' }));
  const allCached = priceArcProviderUsage('gpt-6.1-sol', { ...usage, input_tokens_details: { cached_tokens: 1_000 } }, { aggregation: 'session' });
  equal(allCached?.costNanos, 200_000);
  equal(allCached?.tokens?.cacheWriteTokens, 0);
});
Deno.test('usage pricing: explicit zero and nonzero writes preserve detailed request pricing', () => {
  for (const writes of [0, 300]) {
    const usage = { input_tokens: 1_000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: writes }, output_tokens: 10 };
    const expected = priceArcTokenUsage('gpt-6.1-sol', { inputTokens: 1_000, cachedInputTokens: 200, cacheWriteTokens: writes, outputTokens: 10 });
    deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', usage), expected);
    deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', usage, { aggregation: 'session' }), expected);
    const creationAlias = { ...usage, input_tokens_details: { cached_tokens: 200, cache_creation_tokens: writes } };
    deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', creationAlias, { aggregation: 'session' }), expected);
    const topLevelWrites = { ...usage, input_tokens_details: { cached_tokens: 200 }, cache_write_tokens: writes };
    deepStrictEqual(priceArcProviderUsage('gpt-6.1-sol', topLevelWrites, { aggregation: 'session' }), expected);
  }
});
Deno.test('usage pricing: invalid or inconsistent accounting is rejected', () => {
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    throws(() => priceArcProviderUsage('gpt-6-luna', { total_tokens: value }));
  }
  throws(() => priceArcTokenUsage('fake', { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }));
  throws(() => priceArcTokenUsage('gpt-6-luna', { inputTokens: 1, cachedInputTokens: 1, cacheWriteTokens: 1, outputTokens: 0 }));
  throws(() => priceArcProviderUsage('gpt-6-luna', { input_tokens: 4, output_tokens: 2, total_tokens: 5 }));
  throws(() => priceArcProviderUsage('gpt-6-luna', { input_tokens: 4, output_tokens: 2, total_tokens: 7 }));
  throws(() => priceArcProviderUsage('gpt-6-luna', { input_tokens: 4, output_tokens: 2, input_tokens_details: { cached_tokens: 5 } }, { aggregation: 'session' }));
  throws(() => priceArcProviderUsage('gpt-6-luna', { input_tokens: 4, output_tokens: 2, input_tokens_details: { cache_write_tokens: -1 } }, { aggregation: 'session' }));
  throws(() => priceArcProviderUsage('gpt-6-luna', { total_tokens: Number.MAX_SAFE_INTEGER }));
});
Deno.test('usage pricing: provider budgets floor whole cents without rounding ledger costs', () => {
  equal(arcProviderBudgetCents(9_999_999), 0);
  equal(arcProviderBudgetCents(10_000_000), 1);
  equal(arcProviderBudgetCents(59_999_999), 5);
  equal(arcCostInUsd(550_000), 0.00055);
});
