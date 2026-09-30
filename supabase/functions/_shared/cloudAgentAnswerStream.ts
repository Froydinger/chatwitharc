/** Display-only Agents events. Polling and saved items remain authoritative.
 * Never expose reasoning, function arguments, commentary or subagent output. */
export async function streamAgentAnswer(options: {
  apiKey: string; sessionId: string; signal: AbortSignal;
  onText(text: string): void; fetcher?: typeof fetch;
}) {
  if (!/^sess_[a-zA-Z0-9_-]+$/.test(options.sessionId)) throw new Error('Invalid agent session');
  const response = await (options.fetcher ?? fetch)(`https://api.openai.com/v1/agents/sessions/${options.sessionId}/events?stream=true`, {
    headers: { Authorization: `Bearer ${options.apiKey}`, 'OpenAI-Beta': 'agents=v1', Accept: 'text/event-stream' }, signal: options.signal,
  });
  if (!response.ok || !response.body) throw new Error('Answer stream unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const finals = new Set<string>();
  const parts = new Map<string, string>();
  const seen = new Set<string>();
  let activeItem = '';
  let buffer = '';
  const event = (payload: string) => {
    let value: Record<string, unknown>;
    try { value = JSON.parse(payload); } catch { return; }
    if (typeof value.event_id === 'string') {
      if (seen.has(value.event_id)) return;
      seen.add(value.event_id);
    }
    if (typeof value.subagent_id === 'string') return;
    if (value.type === 'agent.session.turn.item.added' || value.type === 'agent.session.turn.item.done') {
      const item = value.item as Record<string, unknown> | undefined;
      if (item && typeof item.id === 'string' && item.phase === 'final_answer' &&
        (item.type === 'assistant_message' || (item.type === 'message' && item.role === 'assistant')) && !item.subagent_id) {
        finals.add(item.id);
      }
    }
    if (value.type !== 'agent.session.turn.output_text.delta' && value.type !== 'agent.session.turn.output_text.done') return;
    if (typeof value.item_id !== 'string' || !finals.has(value.item_id) || !Number.isSafeInteger(value.content_index)) return;
    const key = `${value.item_id}:${value.content_index}`;
    if (value.type.endsWith('.delta') && typeof value.delta === 'string') parts.set(key, (parts.get(key) ?? '') + value.delta);
    else if (typeof value.text === 'string') parts.set(key, value.text);
    activeItem = value.item_id;
    const text = [...parts].filter(([key]) => key.startsWith(`${activeItem}:`))
      .sort(([a], [b]) => Number(a.split(':').at(-1)) - Number(b.split(':').at(-1))).map(([,text]) => text).join('');
    if (text && text.length <= 200_000) options.onText(text);
  };
  try {
    while (!options.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      if (buffer.length > 1_000_000) throw new Error('Answer stream frame too large');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        event(frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'));
      }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
