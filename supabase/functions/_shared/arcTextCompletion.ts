import { ARC_LUNA, ArcModelAccessError, arcRequestComplexity, resolveArcModelRoute, type ArcModelRoute } from './arcModelRouting.ts';
import { prepareArcModelUsage } from './arcModelUsage.ts';
import { cloudAgentsProvider } from './cloudAgentsProvider.ts';

function mediaInput(messages: unknown[]): 'none' | 'image' | 'document' {
  let image = false;
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const content = (raw as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const value = part as Record<string, unknown>;
      if (value.type === 'file' || value.type === 'input_file') return 'document';
      if (value.type !== 'image_url' && value.type !== 'input_image') continue;
      const url = typeof value.image_url === 'string' ? value.image_url
        : value.image_url && typeof value.image_url === 'object' ? String((value.image_url as Record<string, unknown>).url ?? '') : '';
      if (url.startsWith('data:') && !url.startsWith('data:image/')) return 'document';
      image = true;
    }
  }
  return image ? 'image' : 'none';
}

/** Metered text/vision/document completion. Token caps include reasoning tokens.
 * No ambiguous paid POST is retried; its reservation survives for reconciliation.
 * Premium vision uses a provider-capped session, never a URL-length token guess.
 * Inline non-image documents retain their existing Luna completion transport. */
export async function arcTextCompletion(options: {
  db: Parameters<typeof prepareArcModelUsage>[0]['db'];
  user: Parameters<typeof prepareArcModelUsage>[0]['user'];
  request: Record<string, unknown>; requestId: string; source: string;
  route: ArcModelRoute; apiKey: string; messages: unknown[]; maxTokens?: number;
  fetcher?: typeof fetch;
}) {
  const maxTokens = options.maxTokens ?? 16_384;
  let usage = await prepareArcModelUsage({ ...options, providerInput: options.messages, maxTotalTokens: Math.max(65_536, maxTokens) });
  if (usage.ticket?.reservation.replayed) throw new ArcModelAccessError('This request already started. Check the existing response before trying again.', 409);
  const media = mediaInput(options.messages);
  if (media === 'document' && usage.route.model !== ARC_LUNA) {
    await usage.ticket?.confirmZero('document-transport-requires-luna');
    usage = await prepareArcModelUsage({ ...options, providerInput: options.messages, attemptId: `${options.source}:fallback-luna`, route: resolveArcModelRoute({ selection: ARC_LUNA,
      task: options.route.task, complexity: arcRequestComplexity(options.request) }) });
    usage.notice = 'This document uses GPT 6 Luna. Premium document analysis is not available for this file format.';
  }
  if (media === 'image' && usage.route.model !== ARC_LUNA) {
    const provider = cloudAgentsProvider({ apiKey: options.apiKey, instructions: 'Follow the supplied system instructions and analyze every attached image. Return the complete answer as text.',
      model: usage.route.model, reasoningEffort: usage.route.effort, tools: [],
      spendLimitCents: usage.ticket!.reservation.providerBudgetCents,
      beforeStart: usage.ticket!.assertNewProviderAttempt, onUsage: usage.ticket!.observeSession,
      onRejected: usage.ticket!.confirmZero, fetcher: options.fetcher });
    let sessionId: string | undefined;
    let tokens = 0;
    const deadline = Date.now() + 80_000;
    try {
      sessionId = await provider.startAgentSession!(options.messages, options.requestId, maxTokens);
      while (Date.now() < deadline) {
        const turn = await provider.pollAgentSession!(sessionId, tokens);
        if (turn) {
          tokens += turn.tokens;
          if (turn.calls.length) throw new Error('Image analysis returned an unsupported action.');
          if (!turn.progressOnly) return { data: { choices: [{ message: { content: turn.text } }] }, route: usage.route, notice: usage.notice };
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      throw new ArcModelAccessError('Image analysis took too long. Check the response before retrying.', 504);
    } catch (error) {
      if (sessionId) await provider.cancelAgentSession!(sessionId, `${sessionId}:analysis-cancel`).catch(() => {});
      throw error;
    } finally { await usage.ticket?.releaseIfNotStarted(); }
  }
  let tokenLimit = maxTokens;
  try { tokenLimit = usage.ticket?.completionTokenLimit(options.messages, maxTokens) ?? maxTokens; }
  catch (error) {
    if (!(error instanceof ArcModelAccessError) || error.status !== 429) throw error;
    await usage.ticket?.confirmZero('input-does-not-fit-reservation');
    usage = await prepareArcModelUsage({ ...options, providerInput: options.messages, attemptId: `${options.source}:fallback-luna`, route: resolveArcModelRoute({ selection: ARC_LUNA,
      task: options.route.task, complexity: arcRequestComplexity(options.request) }) });
    usage.notice = 'This request is too large for the remaining premium allowance. This response uses GPT 6 Luna.';
  }
  usage.ticket?.assertNewProviderAttempt();
  const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: usage.route.model, reasoning_effort: usage.route.effort,
      messages: options.messages, max_completion_tokens: tokenLimit }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) await usage.ticket?.confirmZero(`provider-rejected-${response.status}`);
    throw new ArcModelAccessError(response.status === 429 ? 'The model is busy. Please try again.' : 'The model could not complete this request.', response.status === 429 ? 429 : 502);
  }
  const data = await response.json();
  await usage.ticket?.observe(data.usage, true, typeof data.id === 'string' ? data.id : options.requestId);
  return { data, route: usage.route, notice: usage.notice };
}
