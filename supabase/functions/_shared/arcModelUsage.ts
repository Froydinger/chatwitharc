import { ARC_LUNA, ARC_SOL, ARC_ASTRA, ArcModelAccessError, arcRequestComplexity, resolveArcModelRoute,
  type ArcModelRoute } from './arcModelRouting.ts';
import { NANOS_PER_CENT, priceArcProviderUsage, priceArcTokenUsage } from './arcUsageAccounting.ts';
import { reserveArcUsage, recordArcUsage, releaseArcUsage,
  type ArcUsageReservation } from './arcUsageLedger.ts';

type Database = Parameters<typeof reserveArcUsage>[0];
export type ArcModelUsageTicket = {
  reservation: ArcUsageReservation;
  assertNewProviderAttempt(): void;
  observe(usage: unknown, final: boolean, providerId: string, aggregation?: 'request' | 'session'): Promise<void>;
  observeSession(usage: unknown, final: boolean, providerId: string): Promise<void>;
  confirmZero(reason: string): Promise<void>;
  releaseIfNotStarted(): Promise<void>;
  /** Paid text-only requests reserve input plus this bounded output before POST. */
  completionTokenLimit(input: unknown, requested: number): number;
};

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Persist the actual route before the provider intent is saved. A future lease
 * must not relabel an existing Luna session as Sol when allowance replenishes. */
export async function prepareDurableArcModelUsage(options: Omit<Parameters<typeof prepareArcModelUsage>[0], 'requestId' | 'request' | 'resume' | 'attemptId'> & {
  run: { id: string; request: Record<string, unknown>; checkpoint: Record<string, unknown> };
}) {
  const { run } = options;
  const saved = run.checkpoint.modelRoute as ArcModelRoute | undefined;
  const engine = run.checkpoint.engine as { phase?: string; agentSessionId?: string; responseId?: string; modelIntent?: string } | undefined;
  if (saved && (![ARC_LUNA, ARC_SOL, ARC_ASTRA].includes(saved.model)
    || !['none', 'low', 'medium', 'high'].includes(saved.effort)
    || !['chat', 'write', 'code', 'search', 'analysis', 'file'].includes(saved.task))) {
    throw new Error('Saved model route is invalid.');
  }
  // Final persistence retries cannot generate again and need no fresh hold.
  if (engine?.phase === 'done') return { route: saved ?? options.route, ticket: null,
    notice: typeof run.checkpoint.modelSwitchNotice === 'string' ? run.checkpoint.modelSwitchNotice : undefined };
  const usage = await prepareArcModelUsage({ ...options, route: saved ?? options.route,
    requestId: run.id, request: run.request,
    attemptId: typeof run.checkpoint.modelUsageAttempt === 'string' ? run.checkpoint.modelUsageAttempt : undefined,
    resume: !!(engine?.agentSessionId || engine?.responseId || engine?.modelIntent),
  });
  run.checkpoint.modelRoute = usage.route;
  run.checkpoint.modelUsageAttempt = typeof run.checkpoint.modelUsageAttempt === 'string'
    ? run.checkpoint.modelUsageAttempt : `${options.source}:${usage.notice ? 'fallback-luna' : 'primary'}`;
  if (usage.notice) run.checkpoint.modelSwitchNotice = usage.notice;
  if (!usage.notice && typeof run.checkpoint.modelSwitchNotice === 'string') usage.notice = run.checkpoint.modelSwitchNotice;
  return usage;
}

/** A logical user submission has one stable provider-attempt reservation. Paid
 * retries must create separate attempt identities, never reuse a paid POST whose
 * outcome is unknown. A missing ledger cannot open an unmetered premium route. */
export async function prepareArcModelUsage(options: {
  db: Database;
  user: { id: string; is_anonymous?: boolean } | null | undefined;
  requestId: string;
  request: Record<string, unknown>;
  /** Effective completion input, hashed only; never stored as ledger content. */
  providerInput?: unknown;
  route: ArcModelRoute;
  source: string;
  maxTotalTokens?: number;
  attemptId?: string;
  /** A saved run's actual provider is immutable, even if its balance changes. */
  resume?: boolean;
}): Promise<{ route: ArcModelRoute; ticket: ArcModelUsageTicket | null; notice?: string }> {
  const fallback = async (notice: string) => {
    const route = resolveArcModelRoute({ selection: ARC_LUNA,
      task: options.route.task, complexity: arcRequestComplexity(options.request) });
    const next = options.user && !options.user.is_anonymous
      ? await prepareArcModelUsage({ ...options, route, attemptId: `${options.source}:fallback-luna` })
      : { route, ticket: null };
    return { ...next, notice };
  };
  if (!options.user || options.user.is_anonymous) {
    return options.route.model === ARC_LUNA ? { route: options.route, ticket: null }
      : fallback('This response uses GPT 6 Luna. Sign in to use your premium model allowance.');
  }
  const userId = options.user.id;
  const model = options.route.model;
  const attemptId = options.attemptId ?? `${options.source}:primary`;
  // The pre-existing run-token guard supplies a conservative per-request spend
  // ceiling. This is separate from the configurable account allowance.
  const maximumCost = priceArcProviderUsage(model, { total_tokens: options.maxTotalTokens ?? 65_536 })!.costNanos;
  const requestedNanos = Math.max(NANOS_PER_CENT, Math.ceil(maximumCost / NANOS_PER_CENT) * NANOS_PER_CENT);
  let reservation: ArcUsageReservation;
  try {
    reservation = await reserveArcUsage(options.db, {
      userId, requestId: options.requestId, attemptId, source: options.source, model,
      reserveNanos: requestedNanos, minimumReserveNanos: NANOS_PER_CENT, clampToRemaining: true,
      fingerprint: await fingerprint({ messages: options.providerInput ?? options.request.messages, prompt: options.request.prompt,
        image: options.request.image, images: options.request.images, fileBase64: options.request.fileBase64,
        fileName: options.request.fileName, fileType: options.request.fileType, mimeType: options.request.mimeType,
        attachments: options.request.attachments, model, selection: options.route.selection, task: options.route.task }),
    });
  } catch (error) {
    // Luna has no ordinary usage quota and remains available during a metering
    // outage. Never restart an in-flight premium provider as a different model.
    if (model === ARC_LUNA) return { route: options.route, ticket: null };
    throw new ArcModelAccessError('Premium usage could not be checked. Please try again.', 503);
  }
  if (!reservation.allowed) {
    if (options.resume) throw new ArcModelAccessError('This run reached its model allowance. Continue with GPT 6 Luna.', 429);
    const name = model === 'gpt-6-astra' ? 'GPT 6 Astra' : 'GPT 6.1 Sol';
    return fallback(`${name} allowance is used up. This response uses GPT 6 Luna.`);
  }
  const reservationId = reservation.reservationId!;
  let lastPartialCost = reservation.cumulativeCostNanos ?? 0;
  let providerStarted = options.resume === true;
  const ticket: ArcModelUsageTicket = {
    reservation,
    assertNewProviderAttempt() {
      if (reservation.replayed) throw new ArcModelAccessError('This request already started. Check the existing response before trying again.', 409);
      providerStarted = true;
    },
    async observe(usage, final, providerId, aggregation = 'request') {
      let price;
      try { price = priceArcProviderUsage(model, usage, { aggregation }); }
      catch {
        // An unusable final report is not zero spend. Keep the hold without
        // discarding a completed answer or making another paid provider call.
        if (final) { console.error('Final provider usage is unavailable; reservation retained.'); return; }
        throw new ArcModelAccessError('Model usage could not be verified.', 503);
      }
      if (!price) return; // An absent best-effort usage report is not zero spend.
      if (!final && price.costNanos <= lastPartialCost) return;
      const receiptId = `${providerId}:${price.costNanos}:${final ? 'final' : 'partial'}:${price.basis}`;
      try {
        await recordArcUsage(options.db, { userId, reservationId, receiptId,
          cumulativeCostNanos: price.costNanos, final,
          usage: { ...price, providerId, terminal: final } });
      } catch {
        if (final) { console.error('Final usage receipt was not saved; reservation retained.'); return; }
        throw new ArcModelAccessError('Model usage could not be saved.', 503);
      }
      lastPartialCost = Math.max(lastPartialCost, price.costNanos);
    },
    async observeSession(usage, final, providerId) {
      await ticket.observe(usage, final, providerId, 'session');
    },
    async confirmZero(reason) {
      // A replay belongs to an earlier/unknown provider attempt. A changed
      // request or a new caller's validation result cannot prove it spent zero.
      if (reservation.replayed) throw new ArcModelAccessError('This request already started. Check the existing response before trying again.', 409);
      await releaseArcUsage(options.db, { userId, reservationId, receiptId: `${attemptId}:confirmed-zero:${reason}`, reason });
    },
    async releaseIfNotStarted() {
      if (!providerStarted && !reservation.replayed) await ticket.confirmZero('provider-not-started');
    },
    completionTokenLimit(input, requested) {
      if (model === ARC_LUNA) return requested;
      // Text-only OpenAI calls: UTF-8 bytes are a conservative token upper bound,
      // with overhead for chat framing. Image/document tokens are not estimated
      // here; those calls must use a provider session spend control instead.
      const inputBound = new TextEncoder().encode(JSON.stringify(input)).byteLength + 1024;
      // Reserve the higher cache-write input price and the applicable per-request
      // long-context output rate. Cached reads can only lower the final charge.
      const inputUsage = { inputTokens: inputBound, cachedInputTokens: 0, cacheWriteTokens: inputBound };
      const inputCost = priceArcTokenUsage(model, { ...inputUsage, outputTokens: 0 }).costNanos;
      const oneOutput = priceArcTokenUsage(model, { ...inputUsage, outputTokens: 1 }).costNanos - inputCost;
      const available = Math.floor((reservation.reservedNanos - inputCost) / oneOutput);
      if (available < 128) throw new ArcModelAccessError('This request is too large for the remaining model allowance. Try GPT 6 Luna or a shorter request.', 429);
      return Math.min(requested, available);
    },
  };
  // Observation mode is a staged rollout, not permission for uncapped premium
  // access. New non-admin requests stay on Luna until the account policy is
  // configured and active. Known provider sessions keep their actual route and
  // finite spend ceiling; a replay can never refund another attempt's hold.
  if (model !== ARC_LUNA && !options.resume && reservation.adminUncapped !== true
      && (reservation.enforcementEnabled !== true || reservation.configured !== true)) {
    await ticket.confirmZero('premium-policy-not-active');
    return fallback('Premium models are being updated. This response uses GPT 6 Luna.');
  }
  return { route: options.route, ticket };
}
