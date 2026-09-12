export type WireMessage = { id: string; role: 'user' | 'assistant'; [key: string]: unknown };
export type TranscriptSnapshot = { messages: WireMessage[]; canvasContent?: string | null };
export type TranscriptOperation =
  | { kind: 'append'; message: WireMessage }
  | { kind: 'replace'; id: string; expected: WireMessage; message: WireMessage }
  | { kind: 'remove'; id: string; expected: WireMessage }
  | { kind: 'canvas'; expected: string | null; value: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value);
}
function wire(snapshot: TranscriptSnapshot): TranscriptSnapshot {
  // Store timestamps are Dates; database JSON uses ISO strings. Normalize only
  // the captured local snapshot, never mutate live Zustand state.
  const value = JSON.parse(JSON.stringify(snapshot)) as TranscriptSnapshot;
  if (!Array.isArray(value.messages)) throw new Error('Missing transcript');
  const ids = new Set<string>();
  for (const message of value.messages) {
    if (!message || typeof message.id !== 'string' || !message.id || ids.has(message.id) ||
      !['user', 'assistant'].includes(message.role)) throw new Error('Invalid or duplicate message identity');
    ids.add(message.id);
  }
  return value;
}

/** Compute intent from the local state BEFORE a mutation and its result. Never
 * infer deletions by diffing a stale browser snapshot against fresh server data.
 * RPCs must check expected old values/version atomically before applying these.
 * This helper does not save, retry, merge remote arrays, or change voice code. */
export function transcriptChanges(beforeSnapshot: TranscriptSnapshot, afterSnapshot: TranscriptSnapshot): TranscriptOperation[] {
  const before = wire(beforeSnapshot);
  const after = wire(afterSnapshot);
  const previous = new Map(before.messages.map(message => [message.id, message]));
  const next = new Map(after.messages.map(message => [message.id, message]));
  const operations: TranscriptOperation[] = [];
  const oldSurvivors = before.messages.filter(message => next.has(message.id)).map(message => message.id);
  const newSurvivors = after.messages.filter(message => previous.has(message.id)).map(message => message.id);
  if (canonical(oldSurvivors) !== canonical(newSurvivors)) throw new Error('Transcript reordering needs an explicit versioned operation');
  let appended = false;
  for (const message of after.messages) {
    const old = previous.get(message.id);
    if (!old) { appended = true; operations.push({ kind: 'append', message }); }
    else {
      if (appended) throw new Error('Insertion before existing messages is not an append');
      if (canonical(old) !== canonical(message)) operations.push({ kind: 'replace', id: message.id, expected: old, message });
    }
  }
  for (const message of before.messages) {
    if (!next.has(message.id)) operations.push({ kind: 'remove', id: message.id, expected: message });
  }
  const oldCanvas = before.canvasContent ?? null;
  const newCanvas = after.canvasContent ?? null;
  if (oldCanvas !== newCanvas) operations.push({ kind: 'canvas', expected: oldCanvas, value: newCanvas });
  return operations;
}
