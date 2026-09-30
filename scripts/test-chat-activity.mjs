import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild-wasm';

// Exercise the production SSE reader instead of maintaining a test copy. The
// extracted block contains returns, so it must be wrapped in an async function
// before TypeScript is transpiled.
const aiSource = await readFile(new URL('../src/services/ai.ts', import.meta.url), 'utf8');
const blockStart = aiSource.indexOf('          let data: any = null;');
const blockEnd = aiSource.indexOf('        } catch (err: any) {', blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, 'production chat reader block must be extractable');

const wrapped = `
async function readChatResponse(response, options = {}) {
  const {
    timeoutMs = 100,
    abortSignal,
    onStatus,
    onToolUsage,
    latestUserMessage = 'test message',
    usedLocation = null,
    sessionId = 'session-test',
    forceCanvas = false,
    forceCode = false,
    reasoningEffort = 'low',
  } = options;
  const liveRequestId = crypto.randomUUID();
  let streamedAnswer = false;
  let browserSession;
${aiSource.slice(blockStart, blockEnd)}
}
globalThis.__readChatResponse = readChatResponse;
`;
const transpiled = await transform(wrapped, { loader: 'ts', format: 'esm', target: 'es2022' });

const originalWindow = globalThis.window;
globalThis.window = { dispatchEvent() {} };
let liveAnswer = null;
globalThis.useLiveAnswerStore = { getState: () => ({
  show: (requestId, sessionId, content) => { liveAnswer = { requestId, sessionId, content }; },
  clear: requestId => { if (liveAnswer?.requestId === requestId) liveAnswer = null; },
}) };
await import(`data:text/javascript;base64,${Buffer.from(transpiled.code).toString('base64')}`);
const readChatResponse = globalThis.__readChatResponse;

const fetchWithTimeout = async (factory, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      factory(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const run = (response, options = {}) => readChatResponse.call(
  { fetchWithTimeout },
  response,
  options,
);

const encoder = new TextEncoder();
function eventResponse(events, splitEvery = 7) {
  const bytes = encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
  return new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += splitEvery) {
        controller.enqueue(bytes.slice(offset, offset + splitEvery));
      }
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
}

try {
  const statuses = [];
  const tools = [];
  const finalResult = {
    choices: [{ message: { content: 'Found it.' } }],
    web_sources: [{ url: 'https://example.com', title: 'Example', snippet: 'Evidence' }],
    search_images: ['https://example.com/image.jpg'],
    search_provider: 'tavily',
    tool_calls_used: ['web_search'],
  };
  const result = await run(eventResponse([
    { type: 'status', activity: 'web', tool: 'web_search' },
    { type: 'done', result: finalResult },
  ], 3), {
    onStatus: (event) => statuses.push(event.activity),
    onToolUsage: (used) => tools.push(...used),
  });
  assert.equal(result.content, 'Found it.');
  assert.deepEqual(result.webSources, finalResult.web_sources, 'byte-split SSE must preserve web sources');
  assert.deepEqual(result.searchImages, finalResult.search_images, 'byte-split SSE must preserve search images');
  assert.deepEqual(statuses, ['web']);
  assert.deepEqual(tools, ['web_search', 'web_search']);
  const streamed = await run(eventResponse([
    { type: 'answer', text: 'Provisional answer.' },
    { type: 'done', result: finalResult },
  ]), { onStatus() {} });
  assert.equal(streamed.content, 'Found it.', 'only authoritative done is returned');
  assert.equal(streamed.streamedAnswer, true);
  assert.equal(liveAnswer, null, 'partial answer clears on completion');

  const voiceWireValue = JSON.parse(JSON.stringify(result));
  assert.equal(voiceWireValue.content, 'Found it.', 'chat result must remain JSON-compatible for voice tool output');
  assert.deepEqual(voiceWireValue.webSources, finalResult.web_sources);

  await assert.rejects(
    run(eventResponse([{ type: 'error', message: '{"error":"provider unavailable","code":503}' }])),
    /provider unavailable/,
    'server error messages containing JSON must be surfaced, not swallowed as malformed SSE',
  );

  let stalledCancelled = false;
  const stalled = new Response(new ReadableStream({
    cancel() { stalledCancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } });
  const stalledAt = Date.now();
  await assert.rejects(run(stalled, { timeoutMs: 30 }), /timed out/);
  assert.ok(Date.now() - stalledAt < 500, 'a stalled stream read must remain bounded');
  assert.equal(stalledCancelled, true, 'bounded read failure must cancel the stream');

  const pendingAbort = new AbortController();
  const pending = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('data: {"type":"answer","text":"Partial"}\n\n'));
  } }), { headers: { 'content-type': 'text/event-stream' } });
  const pendingResult = run(pending, { abortSignal: pendingAbort.signal, onStatus() {}, timeoutMs: 1000 });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(liveAnswer?.content, 'Partial');
  pendingAbort.abort();
  assert.deepEqual(await pendingResult, { content: '', webSources: [] });
  assert.equal(liveAnswer, null, 'abort clears partial answer during a pending read');

  const controller = new AbortController();
  controller.abort();
  const cancelled = await run(eventResponse([]), { abortSignal: controller.signal });
  assert.deepEqual(cancelled, { content: '', webSources: [] });

  console.log('PASS: production chat SSE reader preserves activity/results, errors, timeout bounds, and cancellation');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  delete globalThis.__readChatResponse;
  delete globalThis.useLiveAnswerStore;
}

// Exercise the actual edge SSE wrapper: cancellation must not wait for the
// pipeline's start promise, and must reach the running provider poll loop.
const edgeSource = await readFile(new URL('../supabase/functions/chat/index.ts', import.meta.url), 'utf8');
const edgeStart = edgeSource.lastIndexOf('    if (streamEvents) {');
const edgeEnd = edgeSource.indexOf('    const finalResponse = await runChatPipeline();', edgeStart);
assert.ok(edgeStart > 0 && edgeEnd > edgeStart);
const edgeWrapped = `async function edgeResponse(runChatPipeline, req) {
 const streamEvents = true; const corsHeaders = {}; const forceWebSearch = false;
 ${edgeSource.slice(edgeStart, edgeEnd)}
}
globalThis.__edgeResponse = edgeResponse;`;
const edgeJs = await transform(edgeWrapped, { loader: 'ts', format: 'esm', target: 'es2022' });
await import(`data:text/javascript;base64,${Buffer.from(edgeJs.code).toString('base64')}`);
let providerSignal;
const edge = await globalThis.__edgeResponse(async (_send, signal) => {
  providerSignal = signal;
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  return {};
}, new Request('https://example.com/chat'));
const edgeReader = edge.body.getReader();
await edgeReader.read();
await Promise.race([
  edgeReader.cancel(),
  new Promise((_, reject) => setTimeout(() => reject(Error('edge cancellation blocked on pipeline')), 100)),
]);
assert.equal(providerSignal.aborted, true);
delete globalThis.__edgeResponse;
console.log('PASS: edge stream cancellation immediately reaches the chat pipeline');
