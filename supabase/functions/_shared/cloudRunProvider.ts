import { CloudModelTerminalError, type ModelTurn } from './cloudRunEngine.ts';

type Json = Record<string, unknown>;
export type CloudToolDefinition = {
  type: 'function'; name: string; description: string;
  parameters: Json; strict: boolean;
};

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider payload');
  return value as Json;
}

/** Preserve raw output (including reasoning) rather than flattening a tool turn
 * into prose. Tool results are untrusted data, never elevated to system messages. */
export function parseCloudResponse(value: unknown): ModelTurn | null {
  const response = record(value);
  if (response.status === 'queued' || response.status === 'in_progress') return null;
  if (response.status === 'failed' || response.status === 'cancelled' || response.status === 'incomplete') {
    throw new CloudModelTerminalError(response.status);
  }
  if (response.status !== 'completed') throw new Error(`Model response ended: ${String(response.status)}`);
  if (!Array.isArray(response.output)) throw new Error('Missing model output');
  const calls: ModelTurn['calls'] = [];
  const text: string[] = [];
  for (const raw of response.output) {
    const item = record(raw);
    if (item.type === 'function_call') {
      if (typeof item.call_id !== 'string' || typeof item.name !== 'string' || typeof item.arguments !== 'string') {
        throw new Error('Invalid function call');
      }
      calls.push({ id: item.call_id, name: item.name, arguments: item.arguments });
    }
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const rawPart of item.content) {
        const part = record(rawPart);
        if (part.type === 'output_text' && typeof part.text === 'string') text.push(part.text);
        if (part.type === 'refusal' && typeof part.refusal === 'string') text.push(part.refusal);
      }
    }
  }
  const usage = record(response.usage);
  if (typeof usage.total_tokens !== 'number' || !Number.isFinite(usage.total_tokens) || usage.total_tokens < 0) {
    throw new Error('Missing model usage');
  }
  return { calls, text: text.join('\n'), tokens: usage.total_tokens, outputItems: response.output };
}

export function responseInput(transcript: unknown[]): unknown[] {
  return transcript.map(raw => {
    const item = record(raw);
    if (item.role === 'tool') return {
      type: 'function_call_output', call_id: item.tool_call_id, output: item.content,
    };
    return raw;
  });
}

export function cloudResponseProvider(options: {
  apiKey: string;
  instructions: string;
  reasoningEffort: 'low' | 'medium' | 'high';
  tools: CloudToolDefinition[];
  firstTool?: string;
  fetcher?: typeof fetch;
}) {
  if (options.firstTool && !options.tools.some(tool => tool.name === options.firstTool)) {
    throw new Error('Requested initial tool is not registered');
  }
  const fetcher = options.fetcher ?? fetch;
  async function request(path: string, body?: unknown) {
    const result = await fetcher(`https://api.openai.com/v1/responses${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    // Never log provider bodies or headers, which can contain user data.
    if (!result.ok) throw new Error(`Model provider HTTP ${result.status}`);
    return record(await result.json());
  }
  return {
    async startModel(transcript: unknown[], requestKey: string, maxTokens: number): Promise<string> {
      const response = await request('', {
        model: 'gpt-5.6-luna', input: responseInput(transcript),
        instructions: options.instructions,
        // Responses API spells Chat Completions reasoning_effort as reasoning.effort.
        reasoning: { effort: options.reasoningEffort },
        tools: options.tools, parallel_tool_calls: false,
        ...(options.firstTool && requestKey.endsWith(':model:0')
          ? { tool_choice: { type: 'function', name: options.firstTool } } : {}),
        background: true, store: true, max_output_tokens: maxTokens,
      });
      if (typeof response.id !== 'string' || !response.id.startsWith('resp_')) throw new Error('Missing response ID');
      return response.id;
    },
    async pollModel(id: string): Promise<ModelTurn | null> {
      if (!/^resp_[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid response ID');
      return parseCloudResponse(await request(`/${id}`));
    },
    async cancelModel(id: string): Promise<void> {
      if (!/^resp_[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid response ID');
      await request(`/${id}/cancel`, {});
    },
  };
}
