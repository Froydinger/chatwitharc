import { deepStrictEqual, equal } from 'node:assert/strict';
import { cloudCanvasTools } from './cloudRunCanvasTools.ts';
import { cloudMessagePresentation, cloudPresentation } from './cloudRunArtifacts.ts';
import { initialEngineState, tickCloudRun, type EnginePorts, type EngineState } from './cloudRunEngine.ts';
import type { ClaimedCloudRun } from './cloudRunWorker.ts';

const run = { id: 'fixture', user_id: 'owner', session_id: 'session' } as ClaimedCloudRun;

Deno.test('canvas tools: generated artifacts have explicit content without claiming execution', async () => {
  const tools = cloudCanvasTools(() => Promise.resolve(true));
  const output = await tools.update_code.execute(run, { id: 'code', name: 'update_code', arguments: JSON.stringify({ code: 'console.log(1)', language: 'javascript', label: 'Demo' }) }, 'key');
  if (typeof output === 'string') throw new Error('missing presentation');
  equal(JSON.parse(output.output).executed, false);
  deepStrictEqual(cloudMessagePresentation(output.presentation), { type: 'code', codeContent: 'console.log(1)', codeLanguage: 'javascript', codeLabel: 'Demo' });
});

Deno.test('canvas tools: reject identity overrides and malformed artifact content', async () => {
  const tools = cloudCanvasTools(() => Promise.resolve(true));
  for (const payload of [{ content: 'draft', label: 'x', user_id: 'other' }, { content: 1, label: 'x' }, { content: 'draft' }, null]) {
    const output = await tools.update_canvas.execute(run, { id: 'draft', name: 'update_canvas', arguments: JSON.stringify(payload) }, 'key');
    equal(typeof output, 'string');
    equal(JSON.parse(output as string).error, 'Invalid artifact arguments. Supply only the required string fields.');
  }
});

Deno.test('canvas tools: draft and revision survive worker reconstruction and completion', async () => {
  const tools = cloudCanvasTools(() => Promise.resolve(true));
  let state = initialEngineState([], 0);
  state.phase = 'tools'; state.turns = 1;
  state.calls = [{ id: 'draft', name: 'update_canvas', arguments: JSON.stringify({ content: 'Original', label: 'Draft' }) }];
  let completed: EngineState | undefined;
  let executions = 0;
  const ports: EnginePorts = {
    now: () => 1,
    save: (next) => { state = structuredClone(next); return Promise.resolve(true); },
    startModel: () => Promise.resolve('response'),
    pollModel: () => Promise.resolve({ calls: [], text: 'Done', tokens: 1 }),
    complete: (_text, final) => { completed = structuredClone(final); return Promise.resolve(true); },
    approved: () => true, toolPolicy: () => ({ allowed: true, replaySafe: true, needsApproval: false }),
    executeTool: (call, key) => { executions++; return tools[call.name].execute(run, call, key); },
  };
  await tickCloudRun(run.id, structuredClone(state), ports);
  await tickCloudRun(run.id, structuredClone(state), ports);
  equal(executions, 1);
  // Simulate the next model requesting a revision after a restart.
  state.phase = 'tools'; state.turns = 2;
  state.calls = [{ id: 'revision', name: 'update_canvas', arguments: JSON.stringify({ content: 'Revised', label: 'Final' }) }];
  for (let i = 0; i < 4; i++) await tickCloudRun(run.id, structuredClone(state), ports);
  if (!completed) throw new Error('not completed');
  equal(executions, 2);
  deepStrictEqual(cloudPresentation(completed.receipts), { canvas_update: { content: 'Revised', label: 'Final' } });
  deepStrictEqual(cloudMessagePresentation(cloudPresentation(completed.receipts)), { type: 'canvas', canvasContent: 'Revised', canvasLabel: 'Final' });
});
