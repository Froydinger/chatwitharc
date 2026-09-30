import type { ModelTurn } from './cloudRunEngine.ts';

/** Owner preview only. Call with the authenticated user's email, never request data. */
export const FLYNN_MODEL = 'gemini-3.8-flash';
export const FLYNN_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export function flynnAllowedForUser(user: { email?: string | null } | null, apiKey: string | undefined): boolean {
  return Boolean(apiKey?.trim()) && user?.email?.trim().toLowerCase() === 'jakefroydinger@gmail.com';
}

/** Fail before any provider call, including when a client forges a Flynn selection. */
export function requireFlynnAccess(user: { email?: string | null } | null, apiKey: string | undefined): string {
  if (!flynnAllowedForUser(user, apiKey)) throw new Error('Flynn is unavailable for this account.');
  return apiKey!;
}

type Json = Record<string, unknown>;
export type FlynnCompletion = {
  message: Json;
  finishReason: 'stop' | 'tool_calls';
  usage: Json | undefined;
};

/** Convert to Arc's existing tool contract without flattening provider metadata. */
export function flynnModelTurn(result: FlynnCompletion): ModelTurn {
  const rawCalls = result.message.tool_calls;
  if (rawCalls !== undefined && !Array.isArray(rawCalls)) throw new Error('Invalid Flynn tool calls.');
  const calls = (rawCalls ?? []).map((raw: unknown) => {
    const call = raw as Json;
    const fn = call?.function as Json | undefined;
    if (call?.type !== 'function' || typeof call.id !== 'string' || !call.id
      || typeof fn?.name !== 'string' || !fn.name || typeof fn.arguments !== 'string') throw new Error('Invalid Flynn tool call.');
    return { id: call.id, name: fn.name, arguments: fn.arguments };
  });
  if (new Set(calls.map(call => call.id)).size !== calls.length) throw new Error('Duplicate Flynn tool call IDs.');
  if ((result.finishReason === 'tool_calls') !== (calls.length > 0)) throw new Error('Inconsistent Flynn completion.');
  const tokens = result.usage?.total_tokens;
  if (typeof tokens !== 'number' || !Number.isSafeInteger(tokens) || tokens < 0) throw new Error('Missing Flynn model usage.');
  const content = result.message.content;
  if (content !== null && content !== undefined && typeof content !== 'string') throw new Error('Invalid Flynn answer.');
  return { calls, text: typeof content === 'string' ? content : '', tokens, outputItems: [result.message] };
}

/** One bounded compatible API turn. Preserve the entire assistant message in
 * execution history, including tool_calls[*].extra_content thought signatures.
 * It is execution state, not user-facing prose. Never retry an accepted POST. */
export async function requestFlynnCompletion(options: {
  user: { email?: string | null } | null;
  apiKey: string | undefined;
  messages: readonly Json[];
  tools?: readonly Json[];
  toolChoice?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
  fetcher?: typeof fetch;
}): Promise<FlynnCompletion> {
  const key = requireFlynnAccess(options.user, options.apiKey);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxTokens = options.maxTokens ?? 65_536;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > 65_536) throw new Error('Invalid Flynn output budget.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) throw new Error('Invalid Flynn request timeout.');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  const timer = setTimeout(() => controller.abort(new DOMException('Flynn request timed out.', 'TimeoutError')), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(`${FLYNN_OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: FLYNN_MODEL, messages: options.messages, reasoning_effort: 'low',
        max_completion_tokens: maxTokens, stream: false,
        ...(options.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Flynn provider HTTP ${response.status}.`);
    const data = await response.json();
    signal.throwIfAborted();
    const choice = data?.choices?.[0];
    if (!choice?.message || typeof choice.message !== 'object' || Array.isArray(choice.message)
      || choice.message.role !== 'assistant') throw new Error('Invalid Flynn provider result.');
    if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') throw new Error('Flynn response did not complete.');
    return { message: choice.message, finishReason: choice.finish_reason,
      usage: data.usage && typeof data.usage === 'object' && !Array.isArray(data.usage) ? data.usage : undefined };
  } finally {
    clearTimeout(timer);
  }
}
