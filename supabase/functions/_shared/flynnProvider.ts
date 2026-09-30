import type { ModelTurn } from './cloudRunEngine.ts';

/** Boost access is resolved from the authenticated user, never request profile data. */
export const FLYNN_MODEL = 'gemini-3.8-flash';
export const FLYNN_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export type FlynnUser = { id?: string; email?: string | null; is_anonymous?: boolean };

export async function getFlynnEntitlement(client: {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}, user: FlynnUser | null): Promise<boolean> {
  if (!user?.id || user.is_anonymous) return false;
  const { data, error } = await client.rpc('user_has_boost', { check_user_id: user.id });
  if (error) throw new Error('Flynn access could not be verified.');
  return data === true;
}

export function flynnAllowedForUser(user: FlynnUser | null, apiKey: string | undefined, accessGranted = false): boolean {
  return Boolean(user?.id && !user.is_anonymous && apiKey?.trim() && accessGranted === true);
}

/** Fail before any provider call, including forged selections or revoked access. */
export function requireFlynnAccess(user: FlynnUser | null, apiKey: string | undefined, accessGranted = false): string {
  if (!flynnAllowedForUser(user, apiKey, accessGranted)) throw new Error('Arc Flash access has not been authorized.');
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
  if (!calls.length && (typeof content !== 'string' || !content.trim())) throw new Error('Flynn returned no final answer.');
  return { calls, text: typeof content === 'string' ? content : '', tokens, outputItems: [result.message] };
}

/** One bounded compatible API turn. Preserve the entire assistant message in
 * execution history, including tool_calls[*].extra_content thought signatures.
 * It is execution state, not user-facing prose. Never retry an accepted POST. */
export async function requestFlynnCompletion(options: {
  user: FlynnUser | null;
  accessGranted?: boolean;
  apiKey: string | undefined;
  messages: readonly Json[];
  tools?: readonly Json[];
  toolChoice?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
  fetcher?: typeof fetch;
}): Promise<FlynnCompletion> {
  const key = requireFlynnAccess(options.user, options.apiKey, options.accessGranted);
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
