import { persistentChatStream } from './persistentChatStream.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

Deno.test('accepts before generation; tab cancellation does not abort or rerun chat', async () => {
  const reply = deferred<Record<string, unknown>>();
  const browser = new AbortController(), execution = new AbortController();
  let task!: Promise<void>, runs = 0, saves = 0;
  const stream = persistentChatStream({
    accepted: { submissionId: 'one' }, signal: execution.signal, requestSignal: browser.signal,
    run: (_emit, signal) => { runs++; assert(!signal.aborted, 'execution must stay active'); return reply.promise; },
    save: async result => { saves++; assert(result.content === 'Same chat answer', 'save exact result'); },
    fail: async () => { throw new Error('unexpected failure'); }, waitUntil: p => { task = p; },
  });
  const reader = stream.getReader();
  const accepted = new TextDecoder().decode((await reader.read()).value);
  assert(accepted.includes('"type":"accepted"'), 'acknowledge before provider resolves');
  browser.abort(); await reader.cancel();
  assert(!execution.signal.aborted, 'closing browser must not cancel execution');
  reply.resolve({ content: 'Same chat answer' }); await task;
  assert(runs === 1 && saves === 1, 'exactly one pipeline execution and save');
});

Deno.test('completion is emitted only after durable save; preserves streamed events', async () => {
  const saved = deferred<void>(); let task!: Promise<void>;
  const stream = persistentChatStream({ accepted: {}, signal: new AbortController().signal,
    run: async emit => { emit({ type: 'answer', text: 'Hi' }); return { content: 'Hi' }; },
    save: () => saved.promise, fail: async () => {}, waitUntil: p => { task = p; },
  });
  const reader = stream.getReader(), decoder = new TextDecoder();
  assert(decoder.decode((await reader.read()).value).includes('accepted'), 'accepted first');
  assert(decoder.decode((await reader.read()).value).includes('"text":"Hi"'), 'same answer event');
  let completed = false; const next = reader.read().then(x => { completed = true; return x; });
  await Promise.resolve(); assert(!completed, 'must wait for save');
  saved.resolve(); await task;
  assert(decoder.decode((await next).value).includes('"type":"done"'), 'done after save');
});

Deno.test('pipeline failure is persisted once and does not trigger a second attempt', async () => {
  let task!: Promise<void>, failures = 0, runs = 0;
  const stream = persistentChatStream({ accepted: {}, signal: new AbortController().signal,
    run: async () => { runs++; throw new Error('Provider unavailable'); },
    save: async () => { throw new Error('unexpected save'); },
    fail: async () => { failures++; }, waitUntil: p => { task = p; },
  });
  const text = await new Response(stream).text(); await task;
  assert(text.includes('Provider unavailable'), 'preserve existing error');
  assert(failures === 1 && runs === 1, 'one failure, no hidden retry');
});

Deno.test('explicit execution cancellation fences an uninterruptible late provider response',async()=>{
 const execution=new AbortController();let saved=0,failed=0,task!:Promise<void>;
 const stream=persistentChatStream({accepted:{},signal:execution.signal,waitUntil:p=>{task=p;},run:async()=>{execution.abort();return {answer:'late'};},save:async()=>{saved++;},fail:async()=>{failed++;}});
 const text=await new Response(stream).text();await task;
 if(saved!==0 || failed!==1 || !text.includes('Chat stopped.'))throw Error('cancelled execution published a late result');
});
