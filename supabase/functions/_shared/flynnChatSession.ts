import { flynnModelTurn, requestFlynnCompletion, type FlynnCompletion } from './flynnProvider.ts';
import type { FlynnUser } from './flynnProvider.ts';

type Json = Record<string, unknown>;
/** Request-scoped compatible tool conversation. No retries, fallback provider,
 * hidden server session, or stripped assistant execution metadata. */
export function flynnChatSession(options: {
  user: FlynnUser | null;
  accessGranted?: boolean;
  apiKey: string | undefined;
  tools: readonly Json[];
  signal: AbortSignal;
  tokenLimit: number;
  deadline: number;
  now?: () => number;
  fetcher?: typeof fetch;
}) {
  const now = options.now ?? Date.now;
  const toolNames = new Set(options.tools.map(tool => (tool.function as Json)?.name));
  let tokens = 0;
  let rounds = 0;
  function checkActive() {
    options.signal.throwIfAborted();
    if (now() >= options.deadline) throw new Error('Flynn could not finish this request in time. Check the chat before retrying.');
  }
  return {
    checkActive,
    async complete(messages: Json[], toolChoice: unknown = 'auto'): Promise<FlynnCompletion> {
      checkActive();
      if (rounds >= 8 || tokens >= options.tokenLimit) throw new Error('Flynn reached the safe request limit. Please ask it to continue.');
      rounds++;
      const result = await requestFlynnCompletion({ ...options, messages, toolChoice,
        maxTokens: options.tokenLimit - tokens,
        timeoutMs: Math.min(60_000, options.deadline - now()),
      });
      checkActive();
      const turn = flynnModelTurn(result);
      tokens += turn.tokens;
      if (tokens > options.tokenLimit || (tokens === options.tokenLimit && turn.calls.length)) throw new Error('Flynn reached the safe usage limit.');
      if (turn.calls.length > 16 || turn.calls.some(call => !toolNames.has(call.name))) throw new Error('Flynn requested an unavailable action.');
      const requiredName = toolChoice && typeof toolChoice === 'object'
        ? ((toolChoice as Json).function as Json)?.name : undefined;
      if ((toolChoice === 'required' && !turn.calls.length)
        || (requiredName && turn.calls[0]?.name !== requiredName)) throw new Error('Flynn could not safely start the requested action.');
      return result;
    },
    get tokens() { return tokens; },
  };
}
