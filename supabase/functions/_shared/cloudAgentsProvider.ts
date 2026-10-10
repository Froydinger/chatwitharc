import { arcProviderEffort, type ArcTextModel } from './arcModelRouting.ts';
import { CloudModelTerminalError, type AgentToolResult, type ModelTurn } from './cloudRunEngine.ts';
import type { CloudToolDefinition } from './cloudRunProvider.ts';
import type { EngineProvider } from './cloudRunEngine.ts';

type Json = Record<string, unknown>;
type AgentCall = { id: string; turnId: string; name: string; arguments: string };

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Agents API response');
  return value as Json;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function usageDelta(value: unknown, previousTokens: number): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const total = Number((value as Json).total_tokens);
  if (!Number.isFinite(total) || total < 0) return 0;
  // Usage is explicitly best-effort and may be revised as accounting arrives.
  // Keep a conservative high-water mark instead of failing a run on a correction.
  return Math.max(0, total - previousTokens);
}

function totalTokens(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const total = Number((value as Json).total_tokens);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function transcriptPrompt(transcript: unknown[]): { system: string[]; content: Json[] } {
  const system: string[] = [];
  const content: Json[] = [];
  for (const raw of transcript) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Json;
    const role = typeof item.role === 'string' ? item.role : 'user';
    const chunks: string[] = [];
    const rawContent = item.content;
    if (typeof rawContent === 'string') chunks.push(rawContent);
    else if (Array.isArray(rawContent)) {
      for (const part of rawContent) {
        if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
        const value = part as Json;
        if (typeof value.text === 'string') chunks.push(value.text);
        const nestedImage = value.image_url && typeof value.image_url === 'object'
          ? stringValue((value.image_url as Json).url) : '';
        const imageUrl = nestedImage || stringValue(value.image_url);
        if (imageUrl && (value.type === 'image_url' || value.type === 'input_image')) {
          content.push({ type: 'input_text', text: `[${role} attached image follows]` });
          content.push({ type: 'input_image', image_url: imageUrl });
        }
      }
    }
    if (Array.isArray(item.tool_calls)) {
      const calls = item.tool_calls.map(rawCall => {
        if (!rawCall || typeof rawCall !== 'object' || Array.isArray(rawCall)) return '';
        const call = rawCall as Json;
        const fn = call.function && typeof call.function === 'object' ? call.function as Json : {};
        return `${stringValue(fn.name)}(${stringValue(fn.arguments)})`;
      }).filter(Boolean);
      if (calls.length) chunks.push(`Requested tools: ${calls.join('; ')}`);
    }
    if (role === 'system' || role === 'developer') {
      if (chunks.length) system.push(chunks.join('\n'));
      continue;
    }
    const label = role === 'tool'
      ? `Tool result ${stringValue(item.tool_call_id) || stringValue(item.name) || ''}`
      : role === 'assistant' ? 'Assistant' : 'User';
    const text = chunks.join('\n').trim();
    if (text) content.push({ type: 'input_text', text: `[${label}]:\n${text}` });
  }
  if (!content.length) content.push({ type: 'input_text', text: '[User]:\nContinue.' });
  return { system, content };
}

function parseActions(value: unknown): AgentCall[] {
  if (!Array.isArray(value)) throw new Error('Agents API required actions are missing');
  return value.map(raw => {
    const action = record(raw);
    if (action.type !== 'function_call' || typeof action.call_id !== 'string' ||
      typeof action.turn_id !== 'string' || typeof action.name !== 'string') {
      throw new Error('Agents API returned an unsupported required action');
    }
    const args = typeof action.arguments === 'string' ? action.arguments : JSON.stringify(action.arguments ?? {});
    return { id: action.call_id, turnId: action.turn_id, name: action.name, arguments: args };
  });
}

function assistantText(items: unknown[]): { text: string; summary?: string } {
  const answers: string[] = [];
  const finalAnswers: string[] = [];
  const summaries: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Json;
    if (item.type === 'reasoning' && Array.isArray(item.summary)) {
      for (const rawPart of item.summary) {
        if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) continue;
        const part = rawPart as Json;
        if (part.type === 'summary_text' && typeof part.text === 'string') summaries.push(part.text);
      }
    }
    const isAssistantMessage = item.type === 'assistant_message' ||
      (item.type === 'message' && item.role === 'assistant');
    if (!isAssistantMessage || !Array.isArray(item.content)) continue;
    const text = item.content.flatMap(rawPart => {
      if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) return [];
      const part = rawPart as Json;
      return part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [];
    }).join('');
    if (text.trim()) {
      answers.push(text);
      if (item.phase === 'final_answer') finalAnswers.push(text);
    }
  }
  return {
    // Items are fetched with order=desc, so the newest final answer is first.
    // Prefer that over earlier assistant commentary such as “I’ll look it up.”
    text: finalAnswers[0] ?? answers[0] ?? '',
    ...(summaries.length ? { summary: summaries.join('\n').slice(0, 4_000) } : {}),
  };
}

/** Agents API session adapter for durable Work and App Builder runs.
 * environment:none keeps execution in our existing trusted tools and does not
 * provision an OpenAI-hosted computer or sandbox. */
export function cloudAgentsProvider(options: {
  apiKey: string;
  instructions: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  model?: ArcTextModel;
  tools: CloudToolDefinition[];
  firstTool?: string;
  expandInput?: (transcript: unknown[]) => Promise<unknown[]>;
  /** Whole USD cents, returned by the atomic usage reservation. */
  spendLimitCents?: number;
  beforeStart?: () => void;
  onUsage?: (usage: unknown, final: boolean, sessionId: string) => Promise<void>;
  onRejected?: (reason: string) => Promise<void>;
  fetcher?: typeof fetch;
}): EngineProvider {
  if (options.firstTool && !options.tools.some(tool => tool.name === options.firstTool)) {
    throw new Error('Requested initial tool is not registered');
  }
  if (options.spendLimitCents !== undefined && (!Number.isSafeInteger(options.spendLimitCents) || options.spendLimitCents < 1)) {
    throw new Error('Invalid provider spend control.');
  }
  const fetcher = options.fetcher ?? fetch;
  async function request(path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<Json> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      'OpenAI-Beta': 'agents=v1',
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetcher(`https://api.openai.com/v1/agents${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      // Keep provider diagnostics useful without recording request bodies,
      // user content, tool output, or credentials. The endpoint here is the
      // fixed API path, and code/param are the provider's structured fields.
      let code = '';
      let param = '';
      try {
        const payload = record(await response.json());
        const upstream = record(payload.error);
        code = stringValue(upstream.code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
        param = stringValue(upstream.param).replace(/[^a-zA-Z0-9_.\[\]-]/g, '').slice(0, 120);
      } catch {
        // Some gateway errors are not JSON. Status and endpoint remain useful.
      }
      const endpoint = `${method} /agents${path.replace(/\/sess_[a-zA-Z0-9_-]+/g, '/{session_id}')}`;
      const details = [code, param ? `param=${param}` : ''].filter(Boolean).join(' ');
      console.error('Agents API request rejected', { status: response.status, endpoint, code, param });
      if (method === 'POST' && path === '/sessions' && response.status >= 400 && response.status < 500) {
        await options.onRejected?.(`provider-rejected-${response.status}`);
      }
      throw new Error(`Agents API HTTP ${response.status} on ${endpoint}${details ? ` (${details})` : ''}`);
    }
    const text = await response.text();
    if (!text) return {};
    return record(JSON.parse(text));
  }

  async function startAgentSession(transcript: unknown[], requestKey: string, _maxTokens: number): Promise<string> {
    // Agents API session configuration has no max_output_tokens field. Keep the
    // existing engine budget meaningful by checkpointing best-effort session
    // usage as it appears and cancelling the session when that budget is crossed.
    const expanded = options.expandInput ? await options.expandInput(transcript) : transcript;
    const input = transcriptPrompt(expanded);
    const initialToolInstruction = options.firstTool
      ? `For the first action of this task, call the ${options.firstTool} function before giving a final answer. After its result, continue normally.`
      : '';
    const system = [options.instructions, ...input.system, initialToolInstruction].filter(Boolean).join('\n\n');
    options.beforeStart?.();
    const response = await request('/sessions', 'POST', {
      agent: {
        model: options.model ?? 'gpt-6-luna',
        instructions: system,
        reasoning: { effort: arcProviderEffort(options.model ?? 'gpt-6-luna', options.reasoningEffort), ...(arcProviderEffort(options.model ?? 'gpt-6-luna', options.reasoningEffort) === 'none' ? {} : { summary: 'concise' }) },
        text: { verbosity: 'low' },
        tools: options.tools.map(tool => ({
          type: 'function', name: tool.name, description: tool.description,
          parameters: tool.parameters,
          // The Agents API function schema accepts parameters but rejects the
          // Responses-style `strict` property (even when true). Keep strictness
          // as internal metadata only and use the API's documented default.
        })),
      },
      environment: { type: 'none' },
      ...(options.spendLimitCents !== undefined ? { spend_control: { limit: options.spendLimitCents } } : {}),
      input: [{ role: 'user', content: input.content }],
      metadata: { arc_request_key: requestKey.slice(0, 512) },
    });
    if (typeof response.id !== 'string' || !/^sess_[a-zA-Z0-9_-]+$/.test(response.id)) {
      throw new Error('Agents API did not return a session ID');
    }
    return response.id;
  }

  async function ensureSessionBudget(sessionId: string, session: Json): Promise<Json> {
    if (options.spendLimitCents === undefined || session.status === 'failed') return session;
    const existing = session.spend_control && typeof session.spend_control === 'object'
      ? (session.spend_control as Json).limit : undefined;
    if (existing === options.spendLimitCents) return session;
    // Legacy in-flight sessions may predate spend_control. On resume, attach the
    // same absolute ceiling reserved for this provider attempt before another
    // tool result can let the model continue. The documented update preserves
    // accumulated spend; never send null or reset a session's consumption.
    const updated = await request(`/sessions/${sessionId}`, 'POST', {
      spend_control: { limit: options.spendLimitCents },
    });
    return typeof updated.status === 'string' ? updated : session;
  }

  async function pollAgentSession(sessionId: string, previousUsageTokens = 0): Promise<ModelTurn | null> {
    if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Invalid Agents API session ID');
    const session = await ensureSessionBudget(sessionId, await request(`/sessions/${sessionId}`));
    if (session.status === 'failed') {
      await options.onUsage?.(session.usage, true, sessionId);
      throw new CloudModelTerminalError('failed');
    }
    if (session.status === 'requires_action') {
      await options.onUsage?.(session.usage, false, sessionId);
      const calls = parseActions(session.required_actions);
      if (!calls.length) throw new Error('Agents API requested unsupported environment input');
      return { calls, text: '', tokens: usageDelta(session.usage, previousUsageTokens), providerActive: true };
    }
    if (session.status === 'in_progress') {
      await options.onUsage?.(session.usage, false, sessionId);
      return {
        calls: [], text: '', tokens: usageDelta(session.usage, previousUsageTokens),
        progressOnly: true, providerActive: true,
      };
    }
    if (session.status !== 'idle') throw new Error('Agents API returned an unknown session status');

    const page = await request(`/sessions/${sessionId}/turns?order=desc&limit=1`);
    const turns = Array.isArray(page.data) ? page.data : [];
    if (!turns.length) return null;
    const latest = record(turns[0]);
    if (latest.status === 'in_progress' || latest.status === 'queued' || latest.status === 'waiting') return null;
    if (latest.status === 'failed' || latest.status === 'cancelled') {
      await options.onUsage?.(session.usage, true, sessionId);
      throw new CloudModelTerminalError(latest.status);
    }
    if (latest.status !== 'completed' || typeof latest.id !== 'string') {
      throw new Error('Agents API turn did not reach a confirmed terminal state');
    }
    const turnId = latest.id;
    // The Agents API lists root-agent items at the session level; each item
    // carries turn_id. There is no root-turn /items route.
    // Both reads depend on the confirmed completed turn, not on each other.
    const [itemsPage, detail] = await Promise.all([
      request(`/sessions/${sessionId}/items?order=desc&limit=100`),
      request(`/sessions/${sessionId}/turns/${encodeURIComponent(turnId)}`),
    ]);
    const items = Array.isArray(itemsPage.data) ? itemsPage.data.filter(rawItem => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return false;
      return stringValue((rawItem as Json).turn_id) === turnId;
    }) : [];
    const output = assistantText(items);
    if (!output.text.trim()) throw new Error('Agents API completed without an assistant answer');
    const sessionTotal = totalTokens(session.usage);
    // Prefer the cumulative session count. If the session count is unavailable,
    // count the completed turn's usage as a conservative incremental estimate.
    const tokens = sessionTotal !== null
      ? usageDelta(session.usage, previousUsageTokens)
      : Math.max(totalTokens(detail.usage) ?? 0, usageDelta(detail.usage, previousUsageTokens));
    // Session usage is cumulative across tool rounds. A turn-only report must
    // not be mistaken for the entire session when earlier turns are missing.
    await options.onUsage?.(session.usage ?? (previousUsageTokens === 0 ? detail.usage : undefined), true, sessionId);
    return {
      calls: [], text: output.text, tokens,
      ...(output.summary ? { reasoningSummary: output.summary } : {}),
    };
  }

  async function submitAgentToolResults(sessionId: string, results: AgentToolResult[], idempotencyKey: string): Promise<void> {
    if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId) || !results.length || idempotencyKey.length > 256) {
      throw new Error('Invalid Agents API tool result');
    }
    const pendingResults = async (session: Json) => {
      const actions = Array.isArray(session.required_actions) ? session.required_actions : [];
      return results.filter(result => actions.some(rawAction => {
        if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) return false;
        const action = rawAction as Json;
        return action.type === 'function_call' && action.call_id === result.callId && action.turn_id === result.turnId;
      }));
    };

    // A tool may take long enough for a retry or another worker to advance the
    // session. `required_actions` is the source of truth for whether these
    // results are still pending; do not post an event that the session has
    // already consumed.
    const currentSession = await ensureSessionBudget(sessionId, await request(`/sessions/${sessionId}`));
    let stillPending = await pendingResults(currentSession);
    if (!stillPending.length && ['in_progress', 'idle', 'requires_action'].includes(stringValue(currentSession.status))) {
      return;
    }
    if (!stillPending.length) throw new Error('Agents API has no matching pending function calls');

    const makeEvents = (pending: AgentToolResult[]) => pending.map(result => ({
      type: 'agent.session.input.tool_result',
      turn_id: result.turnId,
      call_id: result.callId,
      success: result.success,
      ...(result.success ? { output: result.output ?? '' } : { error: result.error ?? 'Tool action failed.' }),
    }));
    try {
      await request(`/sessions/${sessionId}/events`, 'POST', { events: makeEvents(stillPending) }, idempotencyKey);
    } catch (error) {
      // Resolve a concurrent submit or an accepted event whose response was
      // lost before reporting a conflict to the caller. Never re-run tools here.
      if (!(error instanceof Error) || !/Agents API HTTP 409\b/.test(error.message)) throw error;
      const latestSession = await request(`/sessions/${sessionId}`);
      stillPending = await pendingResults(latestSession);
      if (!stillPending.length && ['in_progress', 'idle', 'requires_action'].includes(stringValue(latestSession.status))) {
        return;
      }
      throw error;
    }
  }

  async function cancelAgentSession(sessionId: string, idempotencyKey: string): Promise<void> {
    if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId) || !idempotencyKey || idempotencyKey.length > 256) {
      throw new Error('Invalid Agents API cancellation request');
    }
    await request(`/sessions/${sessionId}/events`, 'POST', {
      events: [{ type: 'agent.session.input.cancel' }],
    }, idempotencyKey);
    if (options.onUsage) {
      // An accepted cancel is not proof of zero spend or termination. Only a
      // confirmed terminal status can release the remaining metered hold.
      const session = await request(`/sessions/${sessionId}`);
      let terminal = session.status === 'failed';
      if (session.status === 'idle') {
        const page = await request(`/sessions/${sessionId}/turns?order=desc&limit=1`);
        const latest = Array.isArray(page.data) && page.data[0] && typeof page.data[0] === 'object'
          ? page.data[0] as Json : {};
        terminal = ['completed', 'failed', 'cancelled'].includes(stringValue(latest.status));
      }
      await options.onUsage(session.usage, terminal, sessionId);
    }
  }

  return {
    // startModel/pollModel keep this provider structurally compatible with
    // existing cloud adapter consumers; the engine selects the session methods.
    startModel: startAgentSession,
    pollModel: pollAgentSession,
    startAgentSession,
    pollAgentSession,
    submitAgentToolResults,
    cancelAgentSession,
  };
}
