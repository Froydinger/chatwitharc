import { deepStrictEqual, equal, throws } from 'node:assert/strict';
import { flynnCloudProvider, flynnMessages } from './flynnCloudProvider.ts';

Deno.test('Flynn cloud adapter preserves signed tool messages and converts expanded media without mutation', () => {
  const signed = { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', extra_content: { google: { thought_signature: 'fixture' } } }] };
  const input = [signed, { role: 'user', content: [{ type: 'input_text', text: 'Inspect' }, { type: 'input_image', image_url: 'data:image/png;base64,fixture' }, { type: 'input_file', filename: 'fixture.pdf', file_data: 'data:application/pdf;base64,fixture' }] }];
  const before = structuredClone(input);
  const messages = flynnMessages(input);
  deepStrictEqual(messages[0], signed);
  deepStrictEqual(messages[1].content, [{ type: 'text', text: 'Inspect' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }, { type: 'file', file: { filename: 'fixture.pdf', file_data: 'data:application/pdf;base64,fixture' } }]);
  deepStrictEqual(input, before);
  throws(() => flynnMessages([{ type: 'reasoning', summary: [] }]));
});

Deno.test('Flynn cloud adapter enforces engine budget and forces registered first tool only on first turn', async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = flynnCloudProvider({ user: { email: 'jakefroydinger@gmail.com' }, apiKey: 'fixture-key', instructions: 'fixture-instructions',
    tools: [{ type: 'function', name: 'lookup', description: 'Read', parameters: { type: 'object' } }], firstTool: 'lookup',
    fetcher: (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Promise.resolve(Response.json({ choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }], usage: { total_tokens: 12 } })); },
  });
  await provider.completeModel!([{ role: 'user', content: 'hey' }], 'run:model:0', 8000);
  await provider.completeModel!([{ role: 'user', content: 'hey' }], 'run:model:1', 4000);
  equal(bodies[0].max_completion_tokens, 8000);
  equal(bodies[1].max_completion_tokens, 4000);
  deepStrictEqual(bodies[0].tool_choice, { type: 'function', function: { name: 'lookup' } });
  equal(bodies[1].tool_choice, 'auto');
  throws(() => flynnCloudProvider({ user: { email: 'another@example.com' }, apiKey: 'fixture-key', instructions: '', tools: [] }));
});
