/** Provider-cost accounting, in integer USD nanodollars. Product allowances are
 * configured separately; these rates never grant access or enable a quota. */
export const ARC_USAGE_RATE_VERSION = 'openai-2026-10-10';
export const NANOS_PER_USD = 1_000_000_000;
export const NANOS_PER_CENT = 10_000_000;
export type ArcUsageModel = 'gpt-6-luna' | 'gpt-6.1-sol' | 'gpt-6-astra';
export type ArcTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  /** Includes reasoning tokens. Never add reasoning tokens a second time. */
  outputTokens: number;
};
export type ArcUsagePrice = {
  costNanos: number;
  basis: 'provider-token-detail' | 'conservative-session-detail' | 'conservative-total-tokens';
  rateVersion: string;
  longContext: boolean;
  totalTokens: number;
  tokens?: ArcTokenUsage;
  /** tokens.cacheWriteTokens is an upper-bound assumption, not provider data. */
  cacheWriteTokensEstimated?: true;
};

// Standard USD / 1M tokens, expressed directly as nanos per token. Cache-write
// tokens are a subset of input, disjoint from cached reads, not an extra charge
// on top of normal input. Sources: developers.openai.com/api/docs/models/{id}.
const RATES: Record<ArcUsageModel, { input: number; cached: number; write: number; output: number }> = {
  'gpt-6-luna': { input: 100, cached: 10, write: 125, output: 500 },
  'gpt-6.1-sol': { input: 2_000, cached: 100, write: 2_500, output: 10_000 },
  'gpt-6-astra': { input: 10_000, cached: 1_000, write: 12_500, output: 50_000 },
};
const LONG_CONTEXT_INPUT_TOKENS = 272_000;

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function rates(model: string) {
  if (!Object.hasOwn(RATES, model)) throw new Error('Unknown usage model');
  return RATES[model as ArcUsageModel];
}
function safeCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Usage cost exceeds safe integer range');
  return value;
}

export function priceArcTokenUsage(model: string, usage: ArcTokenUsage): ArcUsagePrice {
  const rate = rates(model);
  const input = count(usage.inputTokens, 'input token count');
  const cached = count(usage.cachedInputTokens, 'cached input token count');
  const write = count(usage.cacheWriteTokens, 'cache write token count');
  const output = count(usage.outputTokens, 'output token count');
  if (cached + write > input) throw new Error('Cached tokens exceed input tokens');
  const longContext = input > LONG_CONTEXT_INPUT_TOKENS;
  const inputCost = (input - cached - write) * rate.input + cached * rate.cached + write * rate.write;
  const costNanos = safeCost(inputCost * (longContext ? 2 : 1) + output * rate.output * (longContext ? 1.5 : 1));
  return { costNanos, basis: 'provider-token-detail', rateVersion: ARC_USAGE_RATE_VERSION,
    longContext, totalTokens: count(input + output, 'total token count'), tokens: { ...usage } };
}

/** Read both Chat Completions and Responses usage. Missing detailed fields are
 * not zero: callers must retain an unresolved hold when usage is absent.
 * total_tokens-only sessions use an explicit conservative upper bound, never
 * an invented input/output split or a rounded-to-zero cents value. Agents
 * session usage omits cache-write counts: price unspecified non-cached input
 * at the higher write rate, and keep the estimate distinguishable from actual
 * reported detail. Best-effort session counts may still be revised later. */
export function priceArcProviderUsage(model: string, value: unknown, options: {
  /** A session can sum many requests; crossing the aggregate threshold does
   * not prove that any one request had a long context. */
  aggregation?: 'request' | 'session';
} = {}): ArcUsagePrice | null {
  const rate = rates(model);
  const usage = record(value);
  if (!usage) return null;
  const inputValue = usage.input_tokens ?? usage.prompt_tokens;
  const outputValue = usage.output_tokens ?? usage.completion_tokens;
  if (inputValue !== undefined && outputValue !== undefined) {
    const details = record(usage.input_tokens_details ?? usage.prompt_tokens_details);
    const inputTokens = count(inputValue, 'input token count');
    const cachedInputTokens = count(details?.cached_tokens ?? 0, 'cached input token count');
    if (cachedInputTokens > inputTokens) throw new Error('Cached tokens exceed input tokens');
    const writeValue = details?.cache_write_tokens ?? details?.cache_creation_tokens ?? usage.cache_write_tokens;
    const cacheWriteTokensEstimated = options.aggregation === 'session' && (writeValue === undefined || writeValue === null);
    const price = priceArcTokenUsage(model, {
      inputTokens,
      outputTokens: count(outputValue, 'output token count'),
      cachedInputTokens,
      cacheWriteTokens: cacheWriteTokensEstimated
        ? inputTokens - cachedInputTokens
        : count(writeValue ?? 0, 'cache write token count'),
    });
    if (usage.total_tokens !== undefined && count(usage.total_tokens, 'total token count') !== price.totalTokens) {
      throw new Error('Provider token totals are inconsistent');
    }
    return options.aggregation === 'session' && (price.longContext || cacheWriteTokensEstimated)
      ? { ...price, basis: 'conservative-session-detail', ...(cacheWriteTokensEstimated ? { cacheWriteTokensEstimated: true as const } : {}) }
      : price;
  }
  if (usage.total_tokens === undefined) return null;
  const totalTokens = count(usage.total_tokens, 'total token count');
  // Without an input split, a long-context request is possible above 272K.
  // Price all tokens at the maximum applicable output rate as a safe estimate.
  const longContext = totalTokens > LONG_CONTEXT_INPUT_TOKENS;
  return { costNanos: safeCost(totalTokens * rate.output * (longContext ? 1.5 : 1)),
    basis: 'conservative-total-tokens', rateVersion: ARC_USAGE_RATE_VERSION, longContext, totalTokens };
}

/** Provider budgets use whole cents; ledger costs retain sub-cent precision. */
export function arcProviderBudgetCents(reservedNanos: number): number {
  return Math.floor(count(reservedNanos, 'reserved cost') / NANOS_PER_CENT);
}

/** Read-only UI units, not a new payment balance or a per-message guarantee. */
export function arcCostInUsd(costNanos: number): number {
  return count(costNanos, 'cost') / NANOS_PER_USD;
}
