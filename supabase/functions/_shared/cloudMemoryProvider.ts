import { cleanMemorySummary, type MemorySynthesis } from './cloudMemoryTool.ts';

/** One attempt per durably recorded synthesis intent. The memory adapter owns
 * checkpoint/recovery; this transport must never add a retry loop. */
export function cloudMemorySynthesis(apiKey: string, fetcher: typeof fetch = fetch) {
  return async (request: MemorySynthesis): Promise<string> => {
    if (!apiKey || request.model !== 'gpt-5.6-luna' || request.reasoningEffort !== 'low'
      || request.maxOutputTokens !== 4000 || typeof request.input !== 'string'
      || typeof request.system !== 'string') throw new Error('Invalid memory synthesis configuration');
    const response = await fetcher('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: request.model, reasoning_effort: request.reasoningEffort,
        max_completion_tokens: request.maxOutputTokens,
        messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.input }] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Memory synthesis request failed');
    }
    const data = await response.json();
    const choice = data?.choices?.[0];
    // Never commit a truncated or refused memory rewrite as the user's new
    // canonical summary. Retain the prior summary and the recovery receipt.
    if (choice?.finish_reason !== 'stop' || choice?.message?.refusal
      || typeof choice?.message?.content !== 'string') throw new Error('Memory synthesis did not complete');
    return cleanMemorySummary(choice.message.content);
  };
}
