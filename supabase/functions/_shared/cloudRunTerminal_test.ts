import { equal, rejects } from 'node:assert/strict';
import { initialEngineState, tickCloudRun, type EnginePorts } from './cloudRunEngine.ts';
import { parseCloudResponse } from './cloudRunProvider.ts';

for (const status of ['failed', 'cancelled', 'incomplete']) {
  Deno.test(`confirmed provider ${status} is persisted terminal without resubmit or tool execution`, async () => {
    const state = initialEngineState([], 0);
    state.responseId = 'resp_existing'; state.modelIntent = 'existing-intent';
    let writes = 0;
    const forbidden = () => { throw new Error('Unexpected action'); };
    const ports: EnginePorts = {
      now: () => 1, startModel: forbidden, complete: forbidden, executeTool: forbidden,
      approved: forbidden, toolPolicy: forbidden,
      pollModel: async id => { equal(id, 'resp_existing'); return parseCloudResponse({ status, error: { message: 'private provider payload' } }); },
      save: async (saved, result, reason) => {
        writes++; equal(result, 'failed'); equal(saved.responseId, 'resp_existing');
        equal(saved.modelIntent, 'existing-intent'); equal(reason?.includes('private provider payload'), false);
        return true;
      },
    };
    await tickCloudRun('run', state, ports); equal(writes, 1);
  });
}
Deno.test('transport failure remains recoverable polling, not a fabricated terminal result', async () => {
  const state = initialEngineState([], 0); state.responseId = 'resp_existing';
  let writes = 0;
  await rejects(tickCloudRun('run', state, {
    now: () => 1, pollModel: async () => { throw new Error('Network unavailable'); },
    save: async () => { writes++; return true; },
  } as unknown as EnginePorts), /Network unavailable/);
  equal(writes, 0);
});
