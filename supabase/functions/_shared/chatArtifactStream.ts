type ArtifactResult = {
  choices?: ReadonlyArray<{ message?: { content?: string | null } }>;
  code_update?: { code: string; label?: string; language?: string } | null;
  canvas_update?: { content: string; label?: string } | null;
  model_used?: string;
  reasoning_effort_used?: string;
  model_switch_notice?: string;
  tool_calls_used?: string[];
  web_sources?: unknown[];
  search_provider?: string;
  search_images?: string[];
  memory_saved?: unknown;
  weather_data?: unknown;
  scheduled_task?: unknown;
  notification_dispatch?: unknown;
};

/** Preserve the legacy composer SSE contract for providers whose tool pipeline
 * delivers a completed artifact. Cancellation reaches the underlying request;
 * no partial tool arguments or execution state are emitted as display content. */
export function chatArtifactStream(options: {
  signal: AbortSignal;
  mode: 'code' | 'canvas' | 'text';
  run: (signal: AbortSignal, onText?: (text: string) => void) => Promise<ArtifactResult>;
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
          let emittedText = '';
          const result = await options.run(abort.signal, options.mode === 'text' ? text => {
            if (!text.startsWith(emittedText)) return; // Final done content remains authoritative after replacement.
            const delta = text.slice(emittedText.length);
            if (delta) { emit({ type: 'delta', content: delta }); emittedText = text; }
          } : undefined);
          abort.signal.throwIfAborted();
          const artifact = result.code_update
            ? { mode: 'code', content: result.code_update.code, label: result.code_update.label, language: result.code_update.language }
            : result.canvas_update ? { mode: 'canvas', content: result.canvas_update.content, label: result.canvas_update.label }
            : { mode: 'text', content: result.choices?.[0]?.message?.content ?? '' };
          if (!emittedText) emit({ type: 'delta', content: artifact.content });
          else if (artifact.content.startsWith(emittedText) && artifact.content.length > emittedText.length)
            emit({ type: 'delta', content: artifact.content.slice(emittedText.length) });
          // Carry the same public artifacts and server-selected metadata as the
          // nonstreaming result. Never spread raw provider output: tool arguments,
          // internal state, usage details and reasoning items are not display data.
          emit({ type: 'done', ...artifact,
            choices: result.choices?.map(choice => ({ message: { role: 'assistant', content: choice.message?.content ?? '' } })),
            code_update: result.code_update, canvas_update: result.canvas_update,
            model_used: result.model_used, reasoning_effort_used: result.reasoning_effort_used,
            model_switch_notice: result.model_switch_notice, tool_calls_used: result.tool_calls_used,
            webSources: result.web_sources, web_sources: result.web_sources,
            search_provider: result.search_provider, search_images: result.search_images,
            memory_saved: result.memory_saved, weather_data: result.weather_data,
            scheduled_task: result.scheduled_task, notification_dispatch: result.notification_dispatch,
          });
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
