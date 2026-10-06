/** Safe persisted reply metadata, matching the ordinary text composer. */
export function ordinaryChatMessage(result: Record<string, any>, id: string, timestamp: string) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Chat returned no reply.');
  const sources = result.web_sources;
  const memoryAction = result.memory_saved ? { type: 'context_saved', content: result.memory_saved.content }
    : sources?.length ? { type: 'web_searched', sources, searchProvider: result.search_provider } : undefined;
  return { id, timestamp, role: 'assistant', type: 'text', content,
    sourceModel: sources?.length ? result.search_provider === 'tavily' ? 'cloud-search-tavily' : 'cloud-search' : 'cloud-chat',
    modelUsed: result.model_used, toolsUsed: result.tool_calls_used,
    reasoningEffortUsed: result.reasoning_effort_used, memoryAction, webSources: sources,
    weatherData: result.weather_data, scheduledTask: result.scheduled_task,
    notificationDispatch: result.notification_dispatch, searchImages: result.search_images };
}

/** Consume the existing chat events exactly once; do not create another agent. */
export async function consumeOrdinaryChat(response: Response, emit: (event: Record<string, unknown>) => void) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Chat failed (${response.status}).`);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return await response.json();
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing chat event stream.');
  const decoder = new TextDecoder(); let buffer = ''; let result: Record<string, unknown> | undefined;
  const line = (value: string) => {
    if (!value.startsWith('data:')) return;
    const text = value.slice(5).trim(); if (!text || text === '[DONE]') return;
    const event = JSON.parse(text);
    if (event.type === 'done') result = event.result;
    else if (event.type === 'error') throw new Error(event.message || 'Chat failed.');
    else emit(event);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0,end).replace(/\r$/, '')); buffer = buffer.slice(end+1); }
      if (chunk.done) break;
    }
    if (buffer) line(buffer);
    if (!result) throw new Error('Chat ended without a complete reply.');
    return result;
  } finally { reader.releaseLock(); }
}
