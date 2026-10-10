import { boundedResponsesProvider } from './boundedResponsesProvider.ts';
import { cloudAgentsProvider } from './cloudAgentsProvider.ts';
import type { EngineProvider, EngineState } from './cloudRunEngine.ts';

/** A persisted Agents session must finish on its original transport. New runs
 * and Responses continuations use bounded output and the same durable ticket;
 * an unknown submission remains fenced by the engine before either can start. */
export function durableArcProvider(
  engine: Pick<EngineState, 'agentSessionId' | 'phase' | 'modelProvider' | 'responseId' | 'lastResponseId'> | undefined,
  options: Parameters<typeof boundedResponsesProvider>[0],
  enabled = true,
): EngineProvider {
  const savedResponse = engine?.modelProvider === 'responses' || !!engine?.responseId || !!engine?.lastResponseId;
  // Rollback applies only before a transport has been selected. A saved provider
  // identity must survive toggles, resumed tool phases and completion retries.
  if (!engine?.agentSessionId && (enabled || savedResponse)) {
    // Final persistence retries have no usage ticket and cannot generate again.
    // Do not construct a premium provider merely to save its completed answer.
    if (engine?.phase === 'done') {
      const finished = () => Promise.reject(new Error('This run already completed its model work.'));
      return { startModel: finished, pollModel: finished };
    }
    return boundedResponsesProvider(options);
  }
  const { ticket, ...providerOptions } = options;
  return cloudAgentsProvider({
    ...providerOptions,
    spendLimitCents: ticket?.reservation.providerBudgetCents,
    beforeStart: ticket?.assertNewProviderAttempt,
    onUsage: ticket?.observeSession,
    onRejected: ticket?.confirmZero,
  });
}
