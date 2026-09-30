import type { EngineProvider } from './cloudRunEngine.ts';
import type { CloudToolDefinition } from './cloudRunProvider.ts';
import { flynnModelTurn, requestFlynnCompletion, requireFlynnAccess } from './flynnProvider.ts';

type Json = Record<string, unknown>;
function record(raw: unknown): Json {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid Flynn execution history.');
  return raw as Json;
}

/** Adapt owned, expanded media input without changing durable history or
 * stripping the signed assistant tool-call metadata required by Gemini. */
export function flynnMessages(transcript: unknown[]): Json[] {
  return transcript.map(raw => {
    const item = record(raw);
    if (item.type === 'function_call_output') return { role: 'tool', tool_call_id: item.call_id, content: item.output };
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(String(item.role))) throw new Error('Unsupported Flynn history item.');
    if (!Array.isArray(item.content)) return item;
    return { ...item, content: item.content.map(rawPart => {
      const part = record(rawPart);
      if (part.type === 'input_text' || part.type === 'output_text') return { type: 'text', text: part.text };
      if (part.type === 'input_image') return { type: 'image_url', image_url: { url: part.image_url } };
      if (part.type === 'input_file') return { type: 'file', file: { filename: part.filename, file_data: part.file_data } };
      if (part.type === 'text' || part.type === 'image_url' || part.type === 'file') return part;
      throw new Error('Unsupported Flynn attachment.');
    }) };
  });
}

export function flynnCloudProvider(options: {
  user: { email?: string | null } | null;
  apiKey: string | undefined;
  instructions: string;
  tools: CloudToolDefinition[];
  firstTool?: string;
  expandInput?: (transcript: unknown[]) => Promise<unknown[]>;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): EngineProvider {
  requireFlynnAccess(options.user, options.apiKey);
  if (options.firstTool && !options.tools.some(tool => tool.name === options.firstTool)) throw new Error('Requested initial tool is not registered');
  return {
    startModel: () => Promise.reject(new Error('Flynn requires durable completion checkpoints.')),
    pollModel: () => Promise.reject(new Error('Flynn does not expose response polling.')),
    async completeModel(transcript, requestKey, maxTokens) {
      const input = options.expandInput ? await options.expandInput(transcript) : transcript;
      const result = await requestFlynnCompletion({
        user: options.user, apiKey: options.apiKey,
        messages: [{ role: 'system', content: options.instructions }, ...flynnMessages(input)],
        tools: options.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
        ...(options.firstTool && requestKey.endsWith(':model:0')
          ? { toolChoice: { type: 'function', function: { name: options.firstTool } } } : {}),
        maxTokens, timeoutMs: 25_000, signal: options.signal, fetcher: options.fetcher,
      });
      return flynnModelTurn(result);
    },
  };
}
