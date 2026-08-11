import type { ThinkingActivity } from '@/hooks/useThinkingOrbConfig';

/**
 * Predict which activity a request will resolve to, from the message alone.
 *
 * The thinking indicator used to learn what Arc did from `tool_calls_used` on
 * the *completed* response — after the work was over — so every turn showed the
 * generic thinking animation and the real one flashed for 2s at the end.
 *
 * This closes that gap for the cases the server decides deterministically. The
 * chat function forces a specific tool from the message text before it ever
 * calls the model (see the `toolChoice` block and `explicitMemoryIntent` in
 * `supabase/functions/chat/index.ts`), so mirroring those exact rules here is a
 * prediction in name only — for these inputs the server's choice is already
 * fixed. Anything the model picks on its own still falls through to the
 * response-reported tools, which remain authoritative.
 *
 * KEEP IN SYNC with the regexes in `supabase/functions/chat/index.ts`. If a
 * rule there changes and this drifts, the indicator briefly shows the wrong
 * animation before the response corrects it — degraded, not broken.
 */

/** Mirrors `explicitMemoryIntent` in supabase/functions/chat/index.ts. */
const MEMORY_INTENT =
  /\b(remember (?:this|that|what|when|how|my)|save (?:this|that) (?:to|in) (?:memory|memories)|do you remember|can you remember|recall|past (?:chat|chats|conversation|conversations)|we (?:talked|spoke|discussed)|i (?:told|mentioned) you)\b/i;

/** Phrasings that read as recalling an earlier conversation rather than saving. */
const RECALL_INTENT =
  /\b(do you remember|can you remember|recall|past (?:chat|chats|conversation|conversations)|we (?:talked|spoke|discussed)|i (?:told|mentioned) you)\b/i;

/**
 * Self-referential questions — "what is my favorite movie?", "what do I do for
 * work?". These match nothing server-side because there is no lookup to force:
 * memories are attached to the prompt client-side before the request is sent
 * (useContextBlocks), so Arc answers straight from them.
 *
 * It still reads as a memory access to the person asking, and it genuinely is
 * one — the answer comes from stored memories and from nowhere else. Gated on
 * `hasMemoryContext` so it only claims memory when memories were actually
 * attached; with none, this is just an ordinary question Arc cannot answer.
 */
const PERSONAL_QUERY =
  /\b(?:what|which|who|when|where|how)\b[^?]*\b(?:my|i|i'm|i've|me)\b|\bdo you know\b[^?]*\bmy\b|\babout me\b/i;

/** Mirrors the weather regex used to force get_weather over web_search. */
const WEATHER =
  /\b(weather|forecast|temperature|temp|rain(ing|y)?|snow(ing|y)?|sunny|cloudy|humidity|wind|storm|hot|cold|degrees?|°[FC]?)\b/i;

export interface PredictOptions {
  /** The client already resolved a web search for this turn. */
  forceWebSearch?: boolean;
  /** The turn resolved to a code or writing Canvas. */
  canvasMode?: 'code' | 'writing' | null;
  /** Memory context blocks were attached to this request. */
  hasMemoryContext?: boolean;
}

/**
 * Returns the activity to show immediately, or null to keep the generic
 * thinking animation until the response reports what actually ran.
 */
export function predictActivity(
  message: string,
  { forceWebSearch, canvasMode, hasMemoryContext }: PredictOptions = {},
): ThinkingActivity | null {
  if (canvasMode === 'code') return 'code';
  if (canvasMode === 'writing') return 'writing';

  // Weather is forced over web_search server-side, but both are "reaching out",
  // and the indicator has no separate weather activity — web reads correctly.
  if (forceWebSearch) return 'web';
  if (WEATHER.test(message)) return 'web';

  // Recall phrasings search past chats; the remaining memory phrasings save.
  if (RECALL_INTENT.test(message)) return 'chats';
  if (MEMORY_INTENT.test(message)) return 'memory';

  if (hasMemoryContext && PERSONAL_QUERY.test(message)) return 'memory';

  return null;
}
