import { deepStrictEqual } from 'node:assert/strict';
import { streamAgentAnswer } from './cloudAgentAnswerStream.ts';
Deno.test('answer stream forwards only final root text, deduplicates events and replaces done text', async () => {
  const events = [
    { type: 'agent.session.turn.item.added', item: { id: 'comment', type: 'assistant_message', phase: 'commentary' } },
    { type: 'agent.session.turn.output_text.delta', item_id: 'comment', content_index: 0, delta: 'Commentary' },
    { type: 'agent.session.turn.reasoning_summary_text.delta', delta: 'Private reasoning' },
    { type: 'agent.session.turn.item.added', item: { id: 'answer', type: 'assistant_message', phase: 'final_answer' } },
    { type: 'agent.session.turn.output_text.delta', event_id: 'a', item_id: 'answer', content_index: 0, delta: 'Hello' },
    { type: 'agent.session.turn.output_text.delta', event_id: 'a', item_id: 'answer', content_index: 0, delta: 'Hello' },
    { type: 'agent.session.turn.output_text.delta', subagent_id: 'child', item_id: 'answer', content_index: 0, delta: 'child output' },
    { type: 'agent.session.turn.output_text.done', item_id: 'answer', content_index: 0, text: 'Hello world' },
  ];
  const text = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const seen: string[] = [];
  await streamAgentAnswer({ apiKey: 'fixture', sessionId: 'sess_test', signal: new AbortController().signal, onText: value => seen.push(value), fetcher: async () => new Response(new ReadableStream({ start(controller) {
    const bytes = new TextEncoder().encode(text);
    for (let i=0; i<bytes.length; i+=7) controller.enqueue(bytes.slice(i,i+7));
    controller.close();
  } })) });
  deepStrictEqual(seen, ['Hello', 'Hello world']);
});
