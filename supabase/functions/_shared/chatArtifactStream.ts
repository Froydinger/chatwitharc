type ArtifactResult = {
  choices?: ReadonlyArray<{ message?: { content?: string | null } }>;
  code_update?: { code: string; label?: string; language?: string } | null;
  canvas_update?: { content: string; label?: string } | null;
  model_used?: string;
  web_sources?: unknown[];
};

/** Preserve the legacy composer SSE contract for providers whose tool pipeline
 * delivers a completed artifact. Cancellation reaches the underlying request;
 * no partial tool arguments or execution state are emitted as display content. */
export function chatArtifactStream(options: {
  signal: AbortSignal;
  mode: 'code' | 'canvas' | 'text';
  run: (signal: AbortSignal) => Promise<ArtifactResult>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let gone = false;
  const cancel = () => { gone = true; abort.abort(); };
  return new ReadableStream({
    start(controller) {
      options.signal.addEventListener('abort', cancel, { once: true });
      if (options.signal.aborted) cancel();
      const emit = (event: unknown) => {
        if (gone) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { cancel(); }
      };
      void (async () => {
        try {
          abort.signal.throwIfAborted();
          emit({ type: 'start', mode: options.mode });
          const result = await options.run(abort.signal);
          abort.signal.throwIfAborted();
          const artifact = result.code_update
            ? { mode: 'code', content: result.code_update.code, label: result.code_update.label, language: result.code_update.language }
            : result.canvas_update ? { mode: 'canvas', content: result.canvas_update.content, label: result.canvas_update.label }
            : { mode: 'text', content: result.choices?.[0]?.message?.content ?? '' };
          emit({ type: 'delta', content: artifact.content });
          emit({ type: 'done', ...artifact, model_used: result.model_used, webSources: result.web_sources });
        } catch (error) {
          if (!abort.signal.aborted) emit({ type: 'error', message: error instanceof Error ? error.message : 'Chat request failed.' });
        } finally {
          options.signal.removeEventListener('abort', cancel);
          try { controller.close(); } catch { /* Reader already detached. */ }
        }
      })();
    },
    cancel,
  });
}
