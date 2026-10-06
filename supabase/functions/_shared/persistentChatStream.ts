/** Keep ordinary chat execution independent of the subscriber's connection.
 * The caller owns acceptance, persistence and explicit cancellation. This
 * adapter forwards the existing chat events without adding tools or loops.
 */
export function persistentChatStream(options: {
  accepted: Record<string, unknown>;
  run: (emit: (event: Record<string, unknown>) => void, signal: AbortSignal) => Promise<Record<string, unknown>>;
  save: (result: Record<string, unknown>) => Promise<void>;
  fail: (error: unknown) => Promise<void>;
  waitUntil: (task: Promise<void>) => void;
  signal: AbortSignal;
  requestSignal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let connected = true;
  let detach: (() => void) | undefined;
  return new ReadableStream({
    start(controller) {
      const emit = (event: Record<string, unknown>) => {
        if (!connected) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { connected = false; }
      };
      detach = () => { connected = false; };
      options.requestSignal?.addEventListener('abort', detach, { once: true });
      if (options.requestSignal?.aborted) connected = false;
      emit({ type: 'accepted', ...options.accepted });
      const task = (async () => {
        try {
          const result = await options.run(emit, options.signal);
          if(options.signal.aborted)throw new Error('Chat stopped.');
          // Finish saving before advertising completion to any subscriber.
          await options.save(result);
          emit({ type: 'done', result });
        } catch (error) {
          try { await options.fail(error); }
          catch { /* The original failure must still terminate this stream. */ }
          emit({ type: 'error', message: error instanceof Error ? error.message : 'Chat failed.' });
        } finally {
          if (detach) options.requestSignal?.removeEventListener('abort', detach);
          try { controller.close(); } catch { /* Subscriber already detached. */ }
        }
      })();
      options.waitUntil(task);
    },
    cancel() { connected = false; },
  });
}
