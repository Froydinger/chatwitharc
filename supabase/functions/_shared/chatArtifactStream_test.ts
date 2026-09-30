import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { chatArtifactStream } from './chatArtifactStream.ts';
const events = async (stream: ReadableStream<Uint8Array>) => (await new Response(stream).text()).split('\n\n')
  .filter(Boolean).map(line => JSON.parse(line.slice('data: '.length)));

Deno.test('artifact SSE preserves completed code/canvas/text and actual model without exposing tool state', async () => {
  for (const [mode, result, content] of [
    ['code', { code_update: { code: 'const answer = 42;', language: 'js', label: 'Code' } }, 'const answer = 42;'],
    ['canvas', { canvas_update: { content: 'Completed draft', label: 'Draft' } }, 'Completed draft'],
    ['text', { choices: [{ message: { content: 'Answer' } }] }, 'Answer'],
  ] as const) {
    const output = await events(chatArtifactStream({ mode, signal: new AbortController().signal,
      run: () => Promise.resolve({ ...result, model_used: 'gpt-6.1-sol', tool_state: 'private-fixture' }) }));
    deepStrictEqual(output.map(event => event.type), ['start', 'delta', 'done']);
    equal(output[2].mode, mode);
    equal(output[2].content, content);
    equal(output[2].model_used, 'gpt-6.1-sol');
    ok(!JSON.stringify(output).includes('private-fixture'));
  }
});

Deno.test('artifact SSE propagates Stop and suppresses any late completed artifact', async () => {
  let release!: (result: { code_update: { code: string } }) => void;
  let providerSignal!: AbortSignal;
  const stream = chatArtifactStream({ mode: 'code', signal: new AbortController().signal, run: signal => {
    providerSignal = signal;
    return new Promise(resolve => { release = resolve; });
  } });
  const reader = stream.getReader();
  equal(new TextDecoder().decode((await reader.read()).value).includes('start'), true);
  await reader.cancel();
  equal(providerSignal.aborted, true);
  release({ code_update: { code: 'Late artifact' } });
  equal((await reader.read()).done, true);
});

Deno.test('artifact SSE never submits a pre-cancelled request and reports failure without a done event', async () => {
  const controller = new AbortController(); controller.abort();
  let submissions = 0;
  deepStrictEqual(await events(chatArtifactStream({ mode: 'text', signal: controller.signal,
    run: () => { submissions++; return Promise.resolve({}); } })), []);
  equal(submissions, 0);
  const output = await events(chatArtifactStream({ mode: 'text', signal: new AbortController().signal,
    run: () => Promise.reject(new Error('Provider unavailable')) }));
  deepStrictEqual(output, [{ type: 'start', mode: 'text' }, { type: 'error', message: 'Provider unavailable' }]);
});
