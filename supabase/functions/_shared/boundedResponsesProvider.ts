import { ARC_LUNA, ArcModelAccessError, arcProviderEffort, type ArcReasoningEffort, type ArcTextModel } from './arcModelRouting.ts';
import { priceArcProviderUsage, priceArcTokenUsage } from './arcUsageAccounting.ts';
import type { ArcModelUsageTicket } from './arcModelUsage.ts';
import { parseCloudResponse, type CloudToolDefinition } from './cloudRunProvider.ts';
import { CloudModelInputBudgetError, CloudModelTerminalError, type AgentToolResult, type EngineProvider, type ModelTurn } from './cloudRunEngine.ts';
import { isDefiniteNoGenerationRejectionStatus } from './cloudAgentsProvider.ts';
import { openBoundedResponseStream } from './boundedResponseStream.ts';

type Json = Record<string, unknown>;
/** Produced only after token counting and before a generation POST. */
export class BoundedResponseBudgetError extends CloudModelInputBudgetError {
  constructor(initialFallbackAllowed = false) { super(initialFallbackAllowed); this.name = 'BoundedResponseBudgetError'; }
}
const record = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model response.');
  return value as Json;
};

/** Convert historical chat messages without flattening tool results into trusted
 * prose. Native Responses output (including reasoning) is carried verbatim. */
export function boundedResponseInput(transcript: unknown[]): unknown[] {
  return transcript.flatMap(raw => {
    const item = record(raw);
    if (typeof item.type === 'string' && (!item.role || (item.type === 'message' && item.role === 'assistant'))) {
      if (!['reasoning', 'message', 'function_call', 'function_call_output', 'item_reference'].includes(item.type)) {
        throw new Error('This provider transcript item is not supported.');
      }
      return [item];
    }
    if (item.role === 'tool') return [{ type: 'function_call_output', call_id: item.tool_call_id,
      output: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? '') }];
    const result: Json[] = [];
    if (typeof item.content === 'string' && item.content) result.push({ role: item.role, content: item.content });
    else if (Array.isArray(item.content)) {
      const content = item.content.map(rawPart => {
        const part = record(rawPart);
        if (part.type === 'text' || part.type === 'input_text') return { type: 'input_text', text: part.text };
        if (part.type === 'image_url' || part.type === 'input_image') {
          const nested = part.image_url && typeof part.image_url === 'object' ? record(part.image_url) : null;
          return { type: 'input_image', image_url: nested?.url ?? part.image_url,
            ...(nested?.detail || part.detail ? { detail: nested?.detail ?? part.detail } : {}) };
        }
        if (part.type === 'file') return { type: 'input_file', ...record(part.file) };
        if (part.type === 'input_file') return part;
        throw new Error('This input type is not supported by the bounded model provider.');
      });
      result.push({ role: item.role, content });
    }
    if (Array.isArray(item.tool_calls)) {
      for (const rawCall of item.tool_calls) {
        const call = record(rawCall);
        const fn = record(call.function);
        result.push({ type: 'function_call', call_id: call.id, name: fn.name, arguments: fn.arguments });
      }
    }
    return result;
  });
}

export type BoundedResponsesOptions = {
  apiKey: string;
  instructions: string;
  model: ArcTextModel;
  reasoningEffort: ArcReasoningEffort;
  tools: CloudToolDefinition[];
  firstTool?: string;
  requireTool?: boolean;
  expandInput?: (transcript: unknown[]) => Promise<unknown[]>;
  ticket: ArcModelUsageTicket | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  /** Display only. Terminal polling and actual usage still authorize tool work. */
  onText?: (text: string) => void;
  /** Extra local safety ceiling when the unmetered Luna ledger is unavailable. */
  maxTotalTokens?: number;
};

/** Request-bounded Responses transport. Each POST first counts the complete
 * model input (schemas, images and tool outputs included), then limits output
 * to the existing remaining reservation. No built-in tool can incur hidden
 * provider spend; all functions use Arc's existing policy/execution gates.
 * No POST is retried, and missing usage blocks the next step. */
export function boundedResponsesProvider(options: BoundedResponsesOptions): EngineProvider {
  if (!options.ticket && options.model !== ARC_LUNA) throw new Error('Premium model usage must be reserved.');
  if (options.firstTool && !options.tools.some(tool => tool.name === options.firstTool)) throw new Error('Requested initial tool is not registered.');
  const fetcher = options.fetcher ?? fetch;
  const ready = new Map<string, Json>();
  const accounted = new Set<string>();
  const attempted = new Set<string>();
  const registered = new Set(options.tools.map(tool => tool.name));
  const localCeiling = priceArcProviderUsage(options.model, { total_tokens: options.maxTotalTokens ?? 65_536 })!.costNanos;
  let localCost = 0;
  let blocked = false;
  let uncertainGeneration = false;
  const tools = options.tools.map(tool => ({ type: 'function', name: tool.name,
    description: tool.description, parameters: tool.parameters, strict: tool.strict ?? false }));

  async function requestResponse(path: string, method: string, body?: unknown, generation = false): Promise<Response> {
    options.signal?.throwIfAborted();
    const response = await fetcher(`https://api.openai.com/v1/responses${path}`, {
      method, headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(generation && options.onText ? 90_000 : 25_000)])
        : AbortSignal.timeout(generation && options.onText ? 90_000 : 25_000),
    });
    if (!response.ok) {
      if (generation && isDefiniteNoGenerationRejectionStatus(response.status)) {
        await options.ticket?.settleResponseRejection(`provider-rejected-${response.status}`);
      }
      // No raw provider body can echo private input into logs or the user error.
      throw new Error(`Bounded model request failed (HTTP ${response.status}). No automatic retry was made.`);
    }
    return response;
  }
  async function request(path: string, method: string, body?: unknown, generation = false): Promise<Json> {
    return record(await (await requestResponse(path, method, body, generation)).json());
  }

  function tokenLimit(inputTokens: number, requested: number): number {
    if (blocked) throw new Error('Model usage is unconfirmed; no additional model step was started.');
    if (options.ticket) {
      try { return options.ticket.responseTokenLimit(inputTokens, requested); }
      catch (error) {
        if (error instanceof ArcModelAccessError && error.status === 429) throw new BoundedResponseBudgetError();
        throw error;
      }
    }
    const input = { inputTokens, cachedInputTokens: 0, cacheWriteTokens: inputTokens };
    const inputCost = priceArcTokenUsage(options.model, { ...input, outputTokens: 0 }).costNanos;
    const outputRate = priceArcTokenUsage(options.model, { ...input, outputTokens: 1 }).costNanos - inputCost;
    const available = Math.floor((localCeiling - localCost - inputCost) / outputRate);
    if (available < 128) throw new Error('Arc reached the safe model limit for this request.');
    return Math.min(requested, available);
  }

  function verifyResponseModel(response: Json) {
    if (response.model !== undefined && response.model !== options.model &&
        !(typeof response.model === 'string' && response.model.startsWith(`${options.model}-`))) {
      blocked = true;
      throw new Error('The provider returned a different model; its usage remains reserved.');
    }
  }

  async function account(response: Json, final: boolean) {
    // Every accounting path, including failure cleanup, must use the same
    // requested model boundary before pricing or releasing a reservation.
    verifyResponseModel(response);
    const id = String(response.id ?? '');
    if (accounted.has(id)) return;
    let price;
    try { price = priceArcProviderUsage(options.model, response.usage); }
    catch (error) { blocked = true; throw error; }
    if (!price) { blocked = true; throw new Error('Model usage is missing; no additional model step was started.'); }
    const metadata = record(response.metadata);
    const prior = typeof metadata.arc_usage_prior_nanos === 'string' && /^\d+$/.test(metadata.arc_usage_prior_nanos)
      ? Number(metadata.arc_usage_prior_nanos) : NaN;
    if (!Number.isSafeInteger(prior) || prior < 0 ||
        metadata.arc_usage_reservation_id !== (options.ticket?.reservation.reservationId ?? 'luna-local')) {
      blocked = true; throw new Error('The model usage boundary could not be verified.');
    }
    try { await options.ticket?.observeResponse(response.usage, final, id, prior); }
    catch (error) { blocked = true; throw error; }
    localCost += price.costNanos;
    accounted.add(id);
  }

  async function inspect(response: Json): Promise<ModelTurn | null> {
    if (response.status === 'queued' || response.status === 'in_progress') return null;
    verifyResponseModel(response);
    if (response.status === 'failed' || response.status === 'cancelled' || response.status === 'incomplete') {
      if (response.usage) await account(response, true);
      blocked = true;
      throw new CloudModelTerminalError(response.status);
    }
    let turn;
    try { turn = parseCloudResponse(response); }
    catch (error) { blocked = true; throw error; }
    if (!turn) return null;
    // Unknown tools are never executed, even if the provider reports completion.
    await account(response, turn.calls.length === 0);
    if (turn.calls.some(call => !registered.has(call.name))) {
      blocked = true; throw new Error('The model requested an unavailable tool. No tool action was executed.');
    }
    if (new Set(turn.calls.map(call => call.id)).size !== turn.calls.length) {
      blocked = true; throw new Error('The model returned duplicate tool actions. No tool action was executed.');
    }
    const initial = record(response.metadata).arc_request_key;
    if (typeof initial === 'string' && initial.endsWith(':model:0') &&
        ((options.requireTool && !turn.calls.length) || (options.firstTool && turn.calls[0]?.name !== options.firstTool))) {
      blocked = true; throw new Error('The model did not select the required tool. No tool action was executed.');
    }
    if (!turn.calls.length && !turn.text.trim()) throw new Error('The model returned no complete answer.');
    return turn;
  }

  return {
    retainCompletedResponseId: true,
    async startModel(transcript, requestKey, maxTokens) {
      if (attempted.has(requestKey)) throw new Error('This model step already started. No automatic retry was made.');
      if (!Number.isSafeInteger(maxTokens) || maxTokens < 128) throw new Error('Invalid bounded model token limit.');
      if (blocked) throw new Error('Model usage is unconfirmed; no additional model step was started.');
      const expanded = options.expandInput ? await options.expandInput(transcript) : transcript;
      const input = boundedResponseInput(expanded);
      const isFirst = requestKey.endsWith(':model:0');
      const toolChoice = isFirst && options.firstTool
        ? { type: 'function', name: options.firstTool }
        : isFirst && options.requireTool ? 'required' : 'auto';
      const effort = arcProviderEffort(options.model, options.reasoningEffort);
      const context = { model: options.model, instructions: options.instructions, input, tools, tool_choice: toolChoice,
        parallel_tool_calls: false, reasoning: { effort, ...(effort === 'none' ? {} : { summary: 'auto' }) },
        text: { verbosity: 'low' } };
      const count = await request('/input_tokens', 'POST', context);
      if (!Number.isSafeInteger(count.input_tokens) || Number(count.input_tokens) < 0) throw new Error('The model input count could not be verified.');
      let maxOutputTokens;
      try { maxOutputTokens = tokenLimit(Number(count.input_tokens), maxTokens); }
      catch (error) {
        if (error instanceof BoundedResponseBudgetError && isFirst && !attempted.size && options.model !== ARC_LUNA
            && options.ticket && !options.ticket.reservation.replayed) {
          await options.ticket.releaseIfNotStarted();
          throw new BoundedResponseBudgetError(true);
        }
        throw error;
      }
      options.signal?.throwIfAborted();
      options.ticket?.assertProviderStep();
      attempted.add(requestKey);
      uncertainGeneration = true;
      let response;
      try {
        const body = { ...context,
          max_output_tokens: maxOutputTokens, service_tier: 'default', background: true, store: true,
          metadata: { arc_request_key: requestKey.slice(0, 512),
            arc_usage_prior_nanos: String(options.ticket?.currentResponseCostNanos() ?? localCost),
            arc_usage_reservation_id: options.ticket?.reservation.reservationId ?? 'luna-local' },
        };
        if (options.onText) {
          const stream = await openBoundedResponseStream(await requestResponse('', 'POST', { ...body, stream: true }, true), {
            signal: options.signal, onText: options.onText,
            onTerminal: terminal => {
              if (typeof terminal.id === 'string' && /^resp_[a-zA-Z0-9_-]+$/.test(terminal.id)) ready.set(terminal.id, terminal);
            },
          });
          // A dropped read is not a failed generation. Continue only GET
          // polling of the accepted ID; never reissue its paid POST.
          void stream.drain.catch(() => {});
          response = stream.initial;
        } else response = await request('', 'POST', body, true);
      } catch (error) { blocked = true; throw error; }
      if (typeof response.id !== 'string' || !/^resp_[a-zA-Z0-9_-]+$/.test(response.id)) {
        blocked = true; throw new Error('The model submission outcome is unknown. Check this request before retrying.');
      }
      uncertainGeneration = false;
      if (!ready.has(response.id)) ready.set(response.id, response);
      return response.id;
    },
    async pollModel(id) {
      if (!/^resp_[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid response ID.');
      const cached = ready.get(id); ready.delete(id);
      const response = cached && cached.status !== 'queued' && cached.status !== 'in_progress'
        ? cached : await request(`/${id}`, 'GET');
      if (response.id !== id) throw new Error('The provider response ID could not be verified.');
      return await inspect(response);
    },
    async cancelModel(id) {
      if (!/^resp_[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid response ID.');
      if (uncertainGeneration) throw new Error('Model submission is unconfirmed; its usage remains reserved.');
      // Cancellation must still run after the client signal was aborted.
      const headers = { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' };
      const current = await fetcher(`https://api.openai.com/v1/responses/${id}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(25_000),
      });
      if (!current.ok) throw new Error('Model cancellation state could not be verified.');
      let terminal = record(await current.json());
      if (terminal.status === 'queued' || terminal.status === 'in_progress') {
        const response = await fetcher(`https://api.openai.com/v1/responses/${id}/cancel`, {
          method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error(`Model cancellation was not confirmed (HTTP ${response.status}).`);
        terminal = record(await response.json());
      }
      if (terminal.id !== id || !['completed', 'failed', 'cancelled', 'incomplete'].includes(String(terminal.status))) {
        throw new Error('Model cancellation did not reach a confirmed terminal state.');
      }
      if (!terminal.usage) throw new Error('Final model usage is unavailable; its reservation remains held.');
      const hasCalls = Array.isArray(terminal.output) && terminal.output.some(item =>
        item && typeof item === 'object' && (item as Json).type === 'function_call');
      await account(terminal, terminal.status !== 'completed' || !hasCalls);
      await options.ticket?.finalizeResponses(id);
    },
  };
}

/** Chat keeps its existing, audited Agents-shaped tool loop. This in-request
 * adapter only supplies bounded Responses turns; tool execution stays in chat.
 * Durable Work uses boundedResponsesProvider directly and checkpoints real IDs. */
export function boundedChatSessionProvider(options: BoundedResponsesOptions): EngineProvider {
  const provider = boundedResponsesProvider(options);
  let rootId = '';
  let responseId = '';
  let transcript: unknown[] = [];
  let pending: ModelTurn | null = null;
  let turn = 0;
  let key = '';
  let maxTokens = 0;
  let totalTokens = 0;
  let completed = false;
  const submitted = new Set<string>();
  const seenCalls = new Set<string>();
  const validate = (id: string) => { if (!rootId || id !== rootId) throw new Error('Invalid chat response handle.'); };
  return {
    ...provider,
    async startAgentSession(input, requestKey, limit) {
      if (rootId) throw new Error('This chat model request already started.');
      transcript = structuredClone(input); key = requestKey; maxTokens = limit;
      responseId = await provider.startModel(transcript, `${key}:model:0`, maxTokens);
      rootId = responseId;
      return rootId;
    },
    async pollAgentSession(id) {
      validate(id);
      const next = await provider.pollModel(responseId);
      if (!next) return null;
      if (!pending) {
        if (next.calls.some(call => seenCalls.has(call.id))) throw new Error('A tool action was already delivered. It was not executed again.');
        for (const call of next.calls) seenCalls.add(call.id);
        totalTokens += next.tokens;
        pending = { ...next, calls: next.calls.map(call => ({ ...call, turnId: responseId })) };
        transcript.push(...(next.outputItems ?? []));
        completed = next.calls.length === 0;
      }
      return pending;
    },
    async submitAgentToolResults(id, results: AgentToolResult[], submissionKey) {
      validate(id);
      if (submitted.has(submissionKey)) throw new Error('These tool results were already submitted.');
      if (!pending?.calls.length || results.length !== pending.calls.length ||
          results.some(result => result.turnId !== responseId || !pending!.calls.some(call => call.id === result.callId))) {
        throw new Error('Tool results did not match the requested actions.');
      }
      const ids = new Set(results.map(result => result.callId));
      if (ids.size !== pending.calls.length) throw new Error('Duplicate tool results are not supported.');
      const remaining = maxTokens - totalTokens;
      if (remaining < 128) throw new Error('Arc reached the safe model limit for this request.');
      submitted.add(submissionKey); // fence before the potentially ambiguous POST
      transcript.push(...results.map(result => ({ type: 'function_call_output', call_id: result.callId,
        output: result.success ? result.output ?? '' : result.error ?? 'Tool action failed.' })));
      pending = null;
      responseId = await provider.startModel(transcript, `${key}:model:${++turn}`, remaining);
    },
    async cancelAgentSession(id) {
      validate(id);
      if (!completed) await provider.cancelModel?.(responseId);
    },
  };
}
