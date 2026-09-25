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
  if (total < previousTokens) throw new Error('Agents API token usage moved backwards');
  return total - previousTokens;
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
    if (text.trim()) answers.push(text);
  }
  return {
    text: answers.at(-1) ?? '',
    ...(summaries.length ? { summary: summaries.join('\n').slice(0, 4_000) } : {}),
  };
}

/** Agents API session adapter for durable Work and App Builder runs.
 * environment:none keeps execution in our existing trusted tools and does not
 * provision an OpenAI-hosted computer or sandbox. */
export function cloudAgentsProvider(options: {
  apiKey: string;
  instructions: string;
  reasoningEffort: 'low' | 'medium' | 'high';
  tools: CloudToolDefinition[];
  firstTool?: string;
  expandInput?: (transcript: unknown[]) => Promise<unknown[]>;
  fetcher?: typeof fetch;
}): EngineProvider {
  if (options.firstTool && !options.tools.some(tool => tool.name === options.firstTool)) {
    throw new Error('Requested initial tool is not registered');
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
      throw new Error(`Agents API HTTP ${response.status} on ${endpoint}${details ? ` (${details})` : ''}`);
    }
    const text = await response.text();
    if (!text) return {};
    return record(JSON.parse(text));
  }

  async function startAgentSession(transcript: unknown[], requestKey: string, _maxTokens: number): Promise<string> {
    const expanded = options.expandInput ? await options.expandInput(transcript) : transcript;
    const input = transcriptPrompt(expanded);
    const initialToolInstruction = options.firstTool
      ? `For the first action of this task, call the ${options.firstTool} function before giving a final answer. After its result, continue normally.`
      : '';
    const system = [options.instructions, ...input.system, initialToolInstruction].filter(Boolean).join('\n\n');
    const response = await request('/sessions', 'POST', {
      agent: {
        model: options.reasoningEffort === 'high' ? 'gpt-6-sol' : 'gpt-6-luna',
        instructions: system,
        reasoning: { effort: options.reasoningEffort === 'high' ? 'low' : options.reasoningEffort, summary: 'concise' },
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
      input: [{ role: 'user', content: input.content }],
      metadata: { arc_request_key: requestKey.slice(0, 512) },
    });
    if (typeof response.id !== 'string' || !/^sess_[a-zA-Z0-9_-]+$/.test(response.id)) {
      throw new Error('Agents API did not return a session ID');
    }
    return response.id;
  }

  async function pollAgentSession(sessionId: string, previousUsageTokens = 0): Promise<ModelTurn | null> {
    if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Invalid Agents API session ID');
    const session = await request(`/sessions/${sessionId}`);
    if (session.status === 'failed') throw new CloudModelTerminalError('failed');
    if (session.status === 'requires_action') {
      const calls = parseActions(session.required_actions);
      if (!calls.length) throw new Error('Agents API requested unsupported environment input');
      return { calls, text: '', tokens: usageDelta(session.usage, previousUsageTokens) };
    }
    if (session.status === 'in_progress') return null;
    if (session.status !== 'idle') throw new Error('Agents API returned an unknown session status');

    const page = await request(`/sessions/${sessionId}/turns?order=desc&limit=1`);
    const turns = Array.isArray(page.data) ? page.data : [];
    if (!turns.length) return null;
    const latest = record(turns[0]);
    if (latest.status === 'in_progress' || latest.status === 'queued' || latest.status === 'waiting') return null;
    if (latest.status === 'failed' || latest.status === 'cancelled') {
      throw new CloudModelTerminalError(latest.status);
    }
    if (latest.status !== 'completed' || typeof latest.id !== 'string') {
      throw new Error('Agents API turn did not reach a confirmed terminal state');
    }
    const turnId = latest.id;
    // The Agents API lists root-agent items at the session level; each item
    // carries turn_id. There is no root-turn /items route.
    const itemsPage = await request(`/sessions/${sessionId}/items?order=desc&limit=100`);
    const items = Array.isArray(itemsPage.data) ? itemsPage.data.filter(rawItem => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return false;
      return stringValue((rawItem as Json).turn_id) === turnId;
    }) : [];
    const output = assistantText(items);
    if (!output.text.trim()) throw new Error('Agents API completed without an assistant answer');
    const detail = await request(`/sessions/${sessionId}/turns/${encodeURIComponent(turnId)}`);
    const tokens = usageDelta(detail.usage ?? session.usage, previousUsageTokens);
    return {
      calls: [], text: output.text, tokens,
      ...(output.summary ? { reasoningSummary: output.summary } : {}),
    };
  }

  async function submitAgentToolResults(sessionId: string, results: AgentToolResult[], idempotencyKey: string): Promise<void> {
    if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId) || !results.length || idempotencyKey.length > 256) {
      throw new Error('Invalid Agents API tool result');
    }
    const events = results.map(result => ({
      type: 'agent.session.input.tool_result',
      turn_id: result.turnId,
      call_id: result.callId,
      success: result.success,
      ...(result.success ? { output: result.output ?? '' } : { error: result.error ?? 'Tool action failed.' }),
    }));
    await request(`/sessions/${sessionId}/events`, 'POST', { events }, idempotencyKey);
  }

  return {
    // startModel/pollModel keep this provider structurally compatible with
    // existing cloud adapter consumers; the engine selects the session methods.
    startModel: startAgentSession,
    pollModel: pollAgentSession,
    startAgentSession,
    pollAgentSession,
    submitAgentToolResults,
  };
}
