import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { BOUNDED_RESPONSE_STREAM_LIMITS as LIMIT, openBoundedResponseStream } from './boundedResponseStream.ts';

type Json = Record<string, unknown>;
const encoder = new TextEncoder();
const created = { type: 'response.created', sequence_number: 0, response: { id: 'resp_fixture', status: 'in_progress' } };
const item = (id = 'msg_answer', phase: unknown = 'final_answer'): Json => ({
  id, type: 'message', role: 'assistant', ...(phase === undefined ? {} : { phase }), content: [],
});
const added = (message: Json = item(), output_index = 0) => ({ type: 'response.output_item.added', output_index, item: message });
const delta = (text: string, item_id = 'msg_answer', content_index = 0, output_index = 0) => ({
  type: 'response.output_text.delta', item_id, content_index, output_index, delta: text,
});
const completed = (output: unknown[] = []) => ({
  type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output, usage: { output_tokens: 5 } },
});
const frame = (value: unknown, extra = '') => `${extra}data: ${JSON.stringify(value)}\n\n`;

function controlled() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { cancelled++; },
  });
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } }),
    push(text: string, chunkSize = 7) {
      const bytes = encoder.encode(text);
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
    },
    close: () => controller.close(),
    error: () => controller.error(new Error('Connection interrupted.')),
    cancelled: () => cancelled,
    locked: () => body.locked,
  };
}

function stream(text: string, chunkSize = 7) {
  const source = controlled();
  source.push(text, chunkSize);
  source.close();
  return source.response;
}

function callbacks() {
  const text: string[] = [];
  const terminal: Json[] = [];
  return { text, terminal, onText: (value: string) => { text.push(value); }, onTerminal: (value: Json) => { terminal.push(value); } };
}

Deno.test('returns the created ID and emits partial text before a terminal event arrives', async () => {
  const source = controlled();
  const seen = callbacks();
  let partial!: () => void;
  const gotPartial = new Promise<void>(resolve => { partial = resolve; });
  const opening = openBoundedResponseStream(source.response, {
    ...seen, onText: value => { seen.onText(value); partial(); },
  });
  source.push(frame(created));
  const result = await opening;
  equal(result.initial.id, 'resp_fixture');
  equal(source.locked(), true);
  source.push(frame(added()) + frame(delta('Hello 🌎')));
  await gotPartial;
  deepStrictEqual(seen.text, ['Hello 🌎']);
  deepStrictEqual(seen.terminal, []);
  const done = completed([{ ...item(), content: [{ type: 'output_text', text: 'Hello 🌎!' }] }]);
  source.push(frame(delta('!')) + frame(done));
  await result.drain;
  deepStrictEqual(seen.text, ['Hello 🌎', 'Hello 🌎!']);
  deepStrictEqual(seen.terminal, [done.response]);
  equal(source.cancelled(), 1);
  equal(source.locked(), false);
});

Deno.test('handles split CRLF, lone CR, comments, multiline data and SSE event names', async () => {
  const initial = `: keep alive\r\n\r\nevent: response.created\r\nid: start\r\ndata: {"response":\r\ndata: {"id":"resp_fixture","status":"in_progress"}}\r\n\r\n`;
  const text = initial + frame(added()).replaceAll('\n', '\r') + frame(delta('Visible')).replaceAll('\n', '\r\n') + frame(completed());
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(text, 1), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Visible']);
  equal(seen.terminal.length, 1);
});

Deno.test('never displays reasoning, function arguments, commentary, refusals, non-assistant or child output', async () => {
  const events = [
    created,
    added({ ...item('reasoning'), type: 'reasoning', content: [{ type: 'output_text', text: 'secret reason' }] }),
    delta('reasoning text', 'reasoning'),
    added({ ...item('function'), type: 'function_call', arguments: '{"secret":"arguments"}' }),
    delta('function text', 'function'),
    added(item('comment', 'commentary')),
    delta('commentary text', 'comment'),
    added({ ...item('user'), role: 'user' }),
    delta('user text', 'user'),
    added({ ...item('child'), subagent_id: 'agent_child' }),
    delta('child text', 'child'),
    delta('unknown item', 'unknown'),
    { type: 'response.reasoning_text.delta', delta: 'private reasoning' },
    { type: 'response.reasoning_summary_text.delta', delta: 'reasoning summary' },
    { type: 'response.function_call_arguments.delta', delta: 'private arguments' },
    { type: 'response.refusal.delta', delta: 'refusal' },
    added(item('msg_answer', null)),
    { ...delta('private child'), subagent_id: 'agent_child' },
    { ...delta('commentary-marked delta'), phase: 'commentary' },
    delta('Only answer'),
    completed(),
  ];
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events.map(value => frame(value)).join('')), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Only answer']);
});

Deno.test('accepts absent phase, prefers final_answer, orders parts and never splices message items', async () => {
  const unphased = { id: 'fallback', type: 'message', role: 'assistant', content: [] };
  const events = [
    created, added(unphased, 0), delta('Fallback', 'fallback', 0, 0),
    added(item('first'), 1), delta('world', 'first', 1, 1), delta('Hello ', 'first', 0, 1),
    delta(' is still changing', 'fallback', 0, 0),
    added({ ...unphased, id: 'later_unphased' }, 2), delta('Later fallback', 'later_unphased', 0, 2),
    added(item('second'), 3), delta('Independent answer', 'second', 0, 3),
    delta('!', 'first', 1, 1), completed(),
  ];
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events.map(value => frame(value)).join('')), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Fallback', 'world', 'Hello world', 'Independent answer']);
});

Deno.test('deduplicates sequence numbers, payload event IDs and SSE frame IDs', async () => {
  const events = frame(created) + frame(added()) +
    frame({ ...delta('A'), sequence_number: 2 }) + frame({ ...delta('duplicate'), sequence_number: 2 }) +
    frame({ ...delta('B'), event_id: 'evt_b' }) + frame({ ...delta('duplicate'), event_id: 'evt_b' }) +
    frame(delta('C'), 'id: evt_c\n') + frame(delta('duplicate'), 'id: evt_c\n') +
    frame({ ...delta('D'), sequence_number: 3, event_id: 'evt_d' }) + frame(completed());
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['A', 'AB', 'ABC', 'ABCD']);
});

Deno.test('done text and item snapshots replace deltas without duplicating them', async () => {
  const events = [
    created, added(),
    { type: 'response.content_part.added', item_id: 'msg_answer', content_index: 0, part: { type: 'output_text', text: '' } },
    delta('Part'),
    { type: 'response.output_text.done', item_id: 'msg_answer', content_index: 0, text: 'Partial' },
    { type: 'response.content_part.done', item_id: 'msg_answer', content_index: 0, part: { type: 'output_text', text: 'Finished' } },
    { type: 'response.output_item.done', output_index: 0, item: { ...item(), content: [{ type: 'output_text', text: 'Complete' }] } },
    completed([{ ...item(), content: [{ type: 'output_text', text: 'Complete' }] }]),
  ];
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events.map(value => frame(value)).join('')), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Part', 'Partial', 'Finished', 'Complete']);
});

Deno.test('refusal/non-text content parts cannot acquire text via a mislabeled delta', async () => {
  const events = [created, added(),
    { type: 'response.content_part.added', item_id: 'msg_answer', content_index: 0, part: { type: 'refusal', refusal: 'hidden' } },
    delta('hidden'), delta('Visible', 'msg_answer', 1), completed()];
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events.map(value => frame(value)).join('')), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Visible']);
});

Deno.test('completed JSON compatibility returns its ID and full terminal record with safe text', async () => {
  const full = completed([
    { id: 'r', type: 'reasoning', summary: [{ text: 'Private' }] },
    { ...item('comment', 'commentary'), content: [{ type: 'output_text', text: 'Commentary' }] },
    { ...item(), content: [{ type: 'output_text', text: 'Answer' }] },
  ]).response;
  const seen = callbacks();
  const result = await openBoundedResponseStream(new Response(JSON.stringify(full)), seen);
  equal(result.initial.id, 'resp_fixture');
  await result.drain;
  deepStrictEqual(seen.text, ['Answer']);
  deepStrictEqual(seen.terminal, [full]);
});

Deno.test('queued JSON compatibility has no terminal callback', async () => {
  const seen = callbacks();
  const initial = { id: 'resp_fixture', status: 'queued' };
  const result = await openBoundedResponseStream(new Response(JSON.stringify(initial)), seen);
  await result.drain;
  deepStrictEqual(result.initial, initial);
  deepStrictEqual(seen.terminal, []);
});

Deno.test('all supported terminal statuses drain and preserve the full response', async () => {
  for (const status of ['completed', 'failed', 'incomplete', 'cancelled']) {
    const seen = callbacks();
    const full = { id: 'resp_fixture', status, usage: { output_tokens: 1 } };
    const result = await openBoundedResponseStream(stream(frame(created) + frame({ type: `response.${status}`, response: full })), seen);
    await result.drain;
    deepStrictEqual(seen.terminal, [full]);
  }
});

Deno.test('malformed JSON, lifecycle IDs, SSE type conflicts and error events reject before acceptance', async () => {
  const payloads = [
    'data: not-json\n\n', 'data: []\n\n',
    frame({ ...created, response: {} }),
    ...['not_a_response', 'resp_', 'resp_has/slash', 'resp_has space', `resp_${'a'.repeat(256)}`].map(id => frame({ ...created, response: { id } })),
    frame({ ...created, sequence_number: -1 }),
    frame({ ...created, sequence_number: 1.5 }),
    frame({ ...created, event_id: '' }),
    frame(created, 'event: response.completed\n'),
    frame({ type: 'error', message: 'Provider secret must not be echoed.' }),
  ];
  for (const payload of payloads) {
    const seen = callbacks();
    await rejects(openBoundedResponseStream(stream(payload), seen), error =>
      error instanceof Error && !error.message.includes('Provider secret'));
    deepStrictEqual(seen.text, []);
    deepStrictEqual(seen.terminal, []);
  }
});

Deno.test('arbitrary events cannot supply the initial ID and EOF reports an unknown submission', async () => {
  const response = stream(frame({ type: 'unrecognized', response: { id: 'resp_fixture' } }) + frame(delta('No known message')));
  await rejects(openBoundedResponseStream(response, callbacks()), /outcome is unknown/);
});

Deno.test('malformed or missing JSON IDs reject and non-success HTTP responses are cancelled', async () => {
  for (const raw of ['[]', '{}', '{broken', '{"id":"chatcmpl_other"}']) {
    await rejects(openBoundedResponseStream(new Response(raw), callbacks()), /Invalid/);
  }
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await rejects(openBoundedResponseStream(new Response(body, { status: 500 }), callbacks()), /unavailable/);
  equal(cancelled, true);
});

Deno.test('EOF after acceptance rejects only the drain and releases the reader', async () => {
  const response = stream(frame(created) + frame(added()) + frame(delta('Partial')));
  const seen = callbacks();
  const result = await openBoundedResponseStream(response, seen);
  equal(result.initial.id, 'resp_fixture');
  await rejects(result.drain, /disconnected/);
  deepStrictEqual(seen.text, ['Partial']);
  deepStrictEqual(seen.terminal, []);
  equal(response.body!.locked, false);
});

Deno.test('changed response IDs, terminal status mismatches, DONE and provider error frames reject the drain', async () => {
  for (const text of [
    frame({ ...completed(), response: { id: 'resp_different', status: 'completed' } }),
    frame({ ...completed(), response: { id: 'resp_fixture', status: 'in_progress' } }),
    'data: [DONE]\n\n',
    frame({ type: 'error', message: 'Secret provider details.' }),
  ]) {
    const seen = callbacks();
    const result = await openBoundedResponseStream(stream(frame(created) + text), seen);
    await rejects(result.drain, error => error instanceof Error && !error.message.includes('Secret provider details'));
    deepStrictEqual(seen.terminal, []);
  }
});

Deno.test('a network failure after initial acceptance rejects the drain without making requests', async () => {
  const source = controlled();
  const resultPromise = openBoundedResponseStream(source.response, callbacks());
  source.push(frame(created));
  const result = await resultPromise;
  source.error();
  await rejects(result.drain, /Connection interrupted/);
  equal(source.locked(), false);
});

Deno.test('abort before an ID cancels a blocked reader and rejects opening', async () => {
  const source = controlled();
  const controller = new AbortController();
  const opening = openBoundedResponseStream(source.response, { ...callbacks(), signal: controller.signal });
  controller.abort();
  await rejects(opening, { name: 'AbortError' });
  equal(source.cancelled(), 1);
  equal(source.locked(), false);
});

Deno.test('an already-aborted signal cancels the reader for SSE and JSON', async () => {
  for (const type of ['text/event-stream', 'application/json']) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const controller = new AbortController();
    controller.abort();
    await rejects(openBoundedResponseStream(new Response(body, { headers: { 'content-type': type } }), {
      ...callbacks(), signal: controller.signal,
    }), { name: 'AbortError' });
    equal(cancelled, true);
    equal(body.locked, false);
  }
});

Deno.test('abort after an ID cancels a blocked reader and rejects only its drain', async () => {
  const source = controlled();
  const controller = new AbortController();
  const opening = openBoundedResponseStream(source.response, { ...callbacks(), signal: controller.signal });
  source.push(frame(created));
  const result = await opening;
  controller.abort();
  await rejects(result.drain, { name: 'AbortError' });
  equal(result.initial.id, 'resp_fixture');
  equal(source.cancelled(), 1);
  equal(source.locked(), false);
});

Deno.test('frame and pending-line bounds cancel rather than retaining an unbounded buffer', async () => {
  for (const oversized of ['data: ' + 'a'.repeat(LIMIT.frameChars), (': comment\n').repeat(Math.ceil(LIMIT.frameChars / 10))]) {
    const source = controlled();
    const opening = openBoundedResponseStream(source.response, callbacks());
    source.push(frame(created));
    const result = await opening;
    source.push(oversized, 16_384);
    await rejects(result.drain, /display limit/);
    equal(source.cancelled(), 1);
    equal(source.locked(), false);
  }
});

Deno.test('text is bounded across individual parts and separate message items', async () => {
  const cases = [
    [added(), delta('x'.repeat(LIMIT.textChars + 1))],
    [added(item('one'), 0), delta('x'.repeat(120_000), 'one', 0, 0), added(item('two'), 1), delta('y'.repeat(120_000), 'two', 0, 1)],
  ];
  for (const events of cases) {
    const seen = callbacks();
    const result = await openBoundedResponseStream(stream([created, ...events].map(value => frame(value)).join(''), 16_384), seen);
    await rejects(result.drain, /display limit/);
    equal(seen.text.every(text => text.length <= LIMIT.textChars), true);
    deepStrictEqual(seen.terminal, []);
  }
});

Deno.test('JSON fallback is bounded before parsing', async () => {
  await rejects(openBoundedResponseStream(new Response('x'.repeat(LIMIT.frameChars + 1)), callbacks()), /display limit/);
});

Deno.test('item and content-part counts are bounded even when text is empty', async () => {
  const cases = [
    Array.from({ length: LIMIT.items + 1 }, (_, i) => added(item(`msg_${i}`), i)),
    [added({ ...item(), content: Array.from({ length: LIMIT.parts + 1 }, () => ({ type: 'output_text', text: '' })) })],
  ];
  for (const events of cases) {
    const result = await openBoundedResponseStream(stream([created, ...events].map(value => frame(value)).join(''), 16_384), callbacks());
    await rejects(result.drain, /display limit/);
  }
});

Deno.test('malformed UTF-8 rejects and releases the body lock', async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
  await rejects(openBoundedResponseStream(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), callbacks()));
  equal(body.locked, false);
});

Deno.test('display callback failures retain an accepted ID and release the reader', async () => {
  const response = stream([created, added(), delta('Answer')].map(value => frame(value)).join(''));
  const result = await openBoundedResponseStream(response, { onText() { throw new Error('Display failed'); }, onTerminal() {} });
  equal(result.initial.id, 'resp_fixture');
  await rejects(result.drain, /Display failed/);
  equal(response.body!.locked, false);
});

Deno.test('completed response evidence is cached even when its display text is too large', async () => {
  const full = completed([{ ...item(), content: [{ type: 'output_text', text: 'x'.repeat(LIMIT.textChars + 1) }] }]).response;
  for (const response of [new Response(JSON.stringify(full)), stream(frame({ type: 'response.completed', response: full }), 16_384)]) {
    const seen = callbacks();
    const result = await openBoundedResponseStream(response, seen);
    equal(result.initial.id, 'resp_fixture');
    await rejects(result.drain, /display limit/);
    deepStrictEqual(seen.terminal, [full]);
    deepStrictEqual(seen.text, []);
  }
});

Deno.test('abort during a text callback prevents later events in the same network chunk', async () => {
  const controller = new AbortController();
  const seen = callbacks();
  const events = [created, added(), delta('First'), delta('Second'), completed()].map(value => frame(value)).join('');
  const result = await openBoundedResponseStream(stream(events, events.length), {
    ...seen, signal: controller.signal, onText: value => { seen.onText(value); controller.abort(); },
  });
  await rejects(result.drain, { name: 'AbortError' });
  deepStrictEqual(seen.text, ['First']);
  deepStrictEqual(seen.terminal, []);
});

Deno.test('large chunks with many small valid frames do not exceed the frame buffer cap', async () => {
  const text = frame(created) + (':' + 'x'.repeat(32_000) + '\n\n').repeat(40) + frame(added()) + frame(delta('Answer')) + frame(completed());
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(text, text.length), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Answer']);
  equal(seen.terminal.length, 1);
});

Deno.test('total stream bytes and dedup event memory are bounded', async () => {
  for (const oversized of [
    (':' + 'x'.repeat(65_532) + '\n\n').repeat(257),
    frame({ type: 'unrecognized' }).repeat(LIMIT.events),
  ]) {
    const source = controlled();
    const opening = openBoundedResponseStream(source.response, callbacks());
    source.push(frame(created));
    const result = await opening;
    source.push(oversized, 65_536);
    await rejects(result.drain, /display limit/);
    equal(source.cancelled(), 1);
    equal(source.locked(), false);
  }
});

Deno.test('a later snapshot omitting the phase retains an explicit final-answer preference', async () => {
  const events = [created, added(), delta('Final'),
    { type: 'response.output_item.done', output_index: 0, item: { id: 'msg_answer', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final' }] } },
    added({ id: 'other', type: 'message', role: 'assistant', content: [] }, 1),
    delta('Fallback', 'other', 0, 1), completed()];
  const seen = callbacks();
  const result = await openBoundedResponseStream(stream(events.map(value => frame(value)).join('')), seen);
  await result.drain;
  deepStrictEqual(seen.text, ['Final']);
});
