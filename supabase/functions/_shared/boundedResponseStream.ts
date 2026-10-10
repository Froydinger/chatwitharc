type Json = Record<string, unknown>;

/** Display-only limits. Hitting one stops this reader, never the provider job or
 * its authoritative polling/accounting path. No request is made by this file. */
export const BOUNDED_RESPONSE_STREAM_LIMITS = Object.freeze({
  frameChars: 1_048_576,
  textChars: 200_000,
  streamBytes: 16_777_216,
  events: 65_536,
  items: 256,
  parts: 1_024,
  idChars: 256,
});

const LIMIT = BOUNDED_RESPONSE_STREAM_LIMITS;
const lifecycle = new Set([
  'response.created', 'response.queued', 'response.in_progress',
  'response.completed', 'response.failed', 'response.incomplete', 'response.cancelled',
]);
const terminal = new Set(['completed', 'failed', 'incomplete', 'cancelled']);
const asRecord = (value: unknown): Json | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= LIMIT.idChars && /^resp_[a-zA-Z0-9_-]+$/.test(value);
const itemId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= LIMIT.idChars;
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < LIMIT.parts;
const invalid = () => new Error('Invalid bounded model response stream.');
const exceeded = () => new Error('Bounded model response stream exceeded its display limit.');

type Message = {
  outputIndex: number;
  rank: number;
  parts: Map<number, string>;
  blockedParts: Set<number>;
};

/** Open the already-issued Responses request without generating or retrying
 * anything. A validated lifecycle response ID is returned before draining.
 * Only onText is display-safe; onTerminal receives the full provider response
 * for the caller's existing polling/cache path, including non-display output. */
export async function openBoundedResponseStream(response: Response, options: {
  onText: (cumulative: string) => void;
  onTerminal: (full: Json) => void;
  signal?: AbortSignal;
}): Promise<{ initial: Json; drain: Promise<void> }> {
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('Bounded model response stream is unavailable.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const messages = new Map<string, Message>();
  let textChars = 0;
  let partCount = 0;
  let displayed = '';
  let responseId = '';
  let finished = false;
  let bytes = 0;
  const abort = () => { void reader.cancel(options.signal?.reason).catch(() => undefined); };
  options.signal?.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    options.signal?.removeEventListener('abort', abort);
    // Do not wait for a remote cancellation acknowledgement to release the lock.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  };
  const checkAbort = () => options.signal?.throwIfAborted();
  const countBytes = (chunk: Uint8Array) => {
    bytes += chunk.byteLength;
    if (bytes > LIMIT.streamBytes) throw exceeded();
  };

  function publish() {
    checkAbort();
    let selected: Message | undefined;
    for (const message of messages.values()) {
      if (![...message.parts.values()].some(text => text.length > 0)) continue;
      if (!selected || message.rank > selected.rank ||
        (message.rank === selected.rank && message.outputIndex > selected.outputIndex)) selected = message;
    }
    // One assistant message at a time: never concatenate separate output items.
    const text = selected ? [...selected.parts].sort(([a], [b]) => a - b).map(([, text]) => text).join('') : '';
    if (text !== displayed) { displayed = text; options.onText(text); }
  }

  function replaceParts(message: Message, parts: Map<number, string>, blockedParts: Set<number>) {
    const nextChars = textChars - [...message.parts.values()].reduce((n, text) => n + text.length, 0) +
      [...parts.values()].reduce((n, text) => n + text.length, 0);
    const nextCount = partCount - message.parts.size - message.blockedParts.size + parts.size + blockedParts.size;
    if (nextChars > LIMIT.textChars || nextCount > LIMIT.parts) throw exceeded();
    textChars = nextChars;
    partCount = nextCount;
    message.parts = parts;
    message.blockedParts = blockedParts;
  }

  function acceptItem(raw: unknown, outputIndex: unknown) {
    const item = asRecord(raw);
    if (!item || !itemId(item.id) || !index(outputIndex)) return;
    const phase = item.phase;
    const allowed = item.type === 'message' && item.role === 'assistant' && item.subagent_id == null &&
      (phase == null || phase === 'final_answer');
    let message = messages.get(item.id);
    if (message && message.outputIndex !== outputIndex) throw invalid();
    if (!allowed) {
      if (message) { replaceParts(message, new Map(), new Set()); messages.delete(item.id); publish(); }
      return;
    }
    if (!message) {
      if (messages.size >= LIMIT.items) throw exceeded();
      message = { outputIndex, rank: 0, parts: new Map(), blockedParts: new Set() };
      messages.set(item.id, message);
    }
    // A later snapshot may omit an optional phase already explicitly received.
    message.rank = phase === 'final_answer' ? 2 : message.rank || 1;
    if (Array.isArray(item.content)) {
      if (item.content.length > LIMIT.parts) throw exceeded();
      const parts = new Map<number, string>();
      const blockedParts = new Set<number>();
      item.content.forEach((rawPart, i) => {
        const part = asRecord(rawPart);
        if (part?.type === 'output_text' && typeof part.text === 'string') parts.set(i, part.text);
        else blockedParts.add(i);
      });
      replaceParts(message, parts, blockedParts);
    }
    publish();
  }

  function acceptText(event: Json) {
    if (event.phase != null && event.phase !== 'final_answer') return;
    if (!itemId(event.item_id) || !index(event.content_index)) return;
    const message = messages.get(event.item_id);
    if (!message || (event.output_index !== undefined && event.output_index !== message.outputIndex)) return;
    const parts = new Map(message.parts);
    const blockedParts = new Set(message.blockedParts);
    const i = event.content_index;
    if (event.type === 'response.content_part.added' || event.type === 'response.content_part.done') {
      const part = asRecord(event.part);
      if (part?.type !== 'output_text' || typeof part.text !== 'string') {
        parts.delete(i); blockedParts.add(i);
      } else {
        blockedParts.delete(i); parts.set(i, part.text);
      }
    } else {
      if (blockedParts.has(i)) return;
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        parts.set(i, (parts.get(i) ?? '') + event.delta);
      } else if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
        parts.set(i, event.text);
      } else return;
    }
    replaceParts(message, parts, blockedParts);
    publish();
  }

  function acceptResponse(full: Json, eventType?: string) {
    checkAbort();
    if (!validId(full.id) || (responseId && responseId !== full.id)) throw invalid();
    responseId = full.id;
    if (eventType && terminal.has(eventType.slice('response.'.length)) &&
      full.status !== eventType.slice('response.'.length)) throw invalid();
    if (typeof full.status === 'string' && terminal.has(full.status)) {
      // Terminal evidence must survive a later display callback/size failure.
      options.onTerminal(full);
      finished = true;
      if (Array.isArray(full.output)) {
        if (full.output.length > LIMIT.parts) throw exceeded();
        full.output.forEach((item, i) => acceptItem(item, i));
      }
    }
  }

  // Non-streaming JSON is supported for compatible transports and test fetchers.
  if (!/^text\/event-stream(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '')) {
    let json = '';
    try {
      while (true) {
        checkAbort();
        const { value, done } = await reader.read();
        checkAbort();
        if (done) break;
        countBytes(value);
        if (bytes > LIMIT.frameChars) throw exceeded();
        json += decoder.decode(value, { stream: true });
      }
      json += decoder.decode();
      let initial: Json | null;
      try { initial = asRecord(JSON.parse(json)); } catch { throw invalid(); }
      if (!initial || !validId(initial.id)) throw invalid();
      // Deliver the ID even if a display callback or a display size limit fails.
      const drain = Promise.resolve().then(() => { checkAbort(); acceptResponse(initial); });
      void drain.catch(() => undefined);
      return { initial, drain };
    } finally { cleanup(); }
  }

  let resolveInitial!: (initial: Json) => void;
  let rejectInitial!: (reason: unknown) => void;
  const initial = new Promise<Json>((resolve, reject) => { resolveInitial = resolve; rejectInitial = reject; });
  let accepted = false;
  let pending = '';
  let frameChars = 0;
  let data: string[] = [];
  let eventName = '';
  let frameId = '';
  let events = 0;
  const sequences = new Set<number>();
  const eventIds = new Set<string>();

  function dispatch() {
    checkAbort();
    const payload = data.join('\n');
    const name = eventName;
    const id = frameId;
    frameChars = 0; data = []; eventName = ''; frameId = '';
    if (!payload) return;
    if (++events > LIMIT.events) throw exceeded();
    if (payload === '[DONE]') throw new Error('Bounded model response stream ended before its terminal response.');
    let event: Json | null;
    try { event = asRecord(JSON.parse(payload)); } catch { throw invalid(); }
    if (!event) throw invalid();
    if (name && event.type !== undefined && event.type !== name) throw invalid();
    if (event.type === undefined && name) event.type = name;
    const sequence = event.sequence_number;
    if (sequence !== undefined && (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0)) throw invalid();
    if (event.event_id !== undefined && !itemId(event.event_id)) throw invalid();
    const ids = [id ? `sse:${id}` : '', typeof event.event_id === 'string' ? `event:${event.event_id}` : ''].filter(Boolean);
    if ((typeof sequence === 'number' && sequences.has(sequence)) || ids.some(value => eventIds.has(value))) return;
    if (typeof sequence === 'number') sequences.add(sequence);
    ids.forEach(value => eventIds.add(value));
    if (event.subagent_id != null) return;
    if (event.type === 'error') throw new Error('Bounded model response stream reported an error.');
    if (typeof event.type === 'string' && lifecycle.has(event.type)) {
      const full = asRecord(event.response);
      if (!full || !validId(full.id) || (responseId && responseId !== full.id)) throw invalid();
      if (!accepted) { accepted = true; responseId = full.id; resolveInitial(full); }
      acceptResponse(full, event.type);
    } else if (accepted && (event.type === 'response.output_item.added' || event.type === 'response.output_item.done')) {
      acceptItem(event.item, event.output_index);
    } else if (accepted && (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done' ||
      event.type === 'response.content_part.added' || event.type === 'response.content_part.done')) {
      acceptText(event);
    }
  }

  function append(text: string, eof = false) {
    pending += text;
    let end: number;
    while (!finished && (end = pending.search(/[\r\n]/)) >= 0) {
      if (!eof && pending[end] === '\r' && end === pending.length - 1) break;
      const line = pending.slice(0, end);
      const width = pending[end] === '\r' && pending[end + 1] === '\n' ? 2 : 1;
      pending = pending.slice(end + width);
      frameChars += line.length + width;
      if (frameChars > LIMIT.frameChars) throw exceeded();
      if (!line) { dispatch(); continue; }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') data.push(value);
      else if (field === 'event') eventName = value;
      else if (field === 'id' && !value.includes('\0')) {
        if (value.length > LIMIT.idChars) throw exceeded();
        frameId = value;
      }
    }
    if (!finished && frameChars + pending.length > LIMIT.frameChars) throw exceeded();
  }

  const drain = (async () => {
    try {
      while (!finished) {
        checkAbort();
        const { value, done } = await reader.read();
        checkAbort();
        if (done) {
          append(decoder.decode(), true);
          if (!finished) throw new Error(accepted
            ? 'Bounded model response stream disconnected before its terminal response.'
            : 'The model submission outcome is unknown: no response ID was received.');
          break;
        }
        countBytes(value);
        // Slice unusually large network chunks so pending/frame buffers remain bounded.
        for (let offset = 0; offset < value.length && !finished; offset += 16_384) {
          append(decoder.decode(value.subarray(offset, offset + 16_384), { stream: true }));
          // Even a large buffered chunk must let the caller persist its ID promptly.
          if (accepted) await Promise.resolve();
        }
      }
    } catch (error) { rejectInitial(error); throw error; }
    finally { cleanup(); }
  })();
  // A disconnect can race the caller attaching its drain handler; retain the
  // rejection for that caller without producing an unhandled rejection meanwhile.
  void drain.catch(() => undefined);
  return { initial: await initial, drain };
}
