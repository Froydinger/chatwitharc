/** One bounded tool-loop tick. Persistence and provider adapters are injected so
 * execution has no dependency on a browser connection or in-memory continuation.
 * The store must fence every write with the worker's current lease token. */
import type { CloudPresentation, CloudToolOutput } from './cloudRunArtifacts.ts';
export type ToolCall = { id: string; name: string; arguments: string };
export type ModelTurn = { calls: ToolCall[]; text: string; tokens: number; outputItems?: unknown[] };
/** A confirmed terminal provider result is not a transport failure. Preserve
 * the response ID for diagnosis but stop polling rather than burning leases. */
export class CloudModelTerminalError extends Error {
  constructor(public readonly status: 'failed' | 'cancelled' | 'incomplete') {
    super(`Model response ${status}`);
    this.name = 'CloudModelTerminalError';
  }
}
/** Trusted adapters may yield after a durable side-effect boundary. The started
 * receipt survives; no tool output enters the transcript until final completion.
 * Only replay-safe tools can request automatic continuation. */
export class CloudToolContinuation extends Error {
  constructor(public readonly disposition: 'pending' | 'recovery_required') {
    super(disposition === 'pending' ? 'Tool is pending' : 'Tool requires recovery');
    this.name = 'CloudToolContinuation';
  }
}
export type EngineState = {
  version: 1;
  phase: 'model' | 'tools' | 'done';
  turns: number;
  tokens: number;
  deadline: number;
  transcript: unknown[];
  calls: ToolCall[];
  receipts: Record<string, {
    state: 'started' | 'done';
    output?: string;
    presentation?: CloudPresentation;
    toolName?: string;
    outcome?: 'completed' | 'blocked' | 'denied';
  }>;
  modelIntent?: string;
  responseId?: string;
  finalText?: string;
};
export interface EnginePorts {
  now(): number;
  // Return false on cancellation or lost lease. Never silently accept a write.
  save(state: EngineState, status: 'running' | 'queued' | 'awaiting_input' | 'failed', reason?: string): Promise<boolean>;
  startModel(transcript: unknown[], requestKey: string, maxTokens: number): Promise<string>;
  pollModel(responseId: string): Promise<ModelTurn | null>;
  complete(text: string, state: EngineState): Promise<boolean>;
  toolPolicy(call: ToolCall): { allowed: boolean; needsApproval: boolean; replaySafe: boolean };
  approved(call: ToolCall): boolean;
  executeTool(call: ToolCall, idempotencyKey: string): Promise<CloudToolOutput>;
}
export const CLOUD_LIMITS = { turns: 16, tokens: 64000, outputPerTurn: 8000, durationMs: 20 * 60 * 1000 };

export function initialEngineState(input: unknown[], now: number): EngineState {
  return { version: 1, phase: 'model', turns: 0, tokens: 0,
    deadline: now + CLOUD_LIMITS.durationMs, transcript: input, calls: [], receipts: {} };
}

export async function tickCloudRun(runId: string, previous: EngineState, ports: EnginePorts): Promise<void> {
  const state = structuredClone(previous);
  if (state.phase === 'done') {
    await ports.complete(state.finalText ?? '', state);
    return;
  }
  if (ports.now() >= state.deadline || state.tokens >= CLOUD_LIMITS.tokens) {
    await ports.save(state, 'failed', 'Run time or token limit reached');
    return;
  }
  if (state.phase === 'model') {
    if (!state.responseId) {
      if (state.turns >= CLOUD_LIMITS.turns) {
        await ports.save(state, 'failed', 'Run step limit reached');
        return;
      }
      // An accepted request whose response ID was not saved is ambiguous.
      // Do not assume provider POST retries are idempotent or bill again.
      if (state.modelIntent) {
        await ports.save(state, 'awaiting_input', 'Model submission outcome unknown; recovery required');
        return;
      }
      state.modelIntent = `${runId}:model:${state.turns}`;
      if (!await ports.save(state, 'running')) return;
      state.responseId = await ports.startModel(state.transcript, state.modelIntent,
        Math.min(CLOUD_LIMITS.outputPerTurn, CLOUD_LIMITS.tokens - state.tokens));
      await ports.save(state, 'queued');
      return;
    }
    let turn: ModelTurn | null;
    try {
      turn = await ports.pollModel(state.responseId);
    } catch (error) {
      if (!(error instanceof CloudModelTerminalError)) throw error;
      await ports.save(state, 'failed', error.status === 'incomplete'
        ? 'Model response stopped before completion; no partial tool actions were executed.'
        : `Model response ${error.status}; no new model request was submitted.`);
      return;
    }
    if (!turn) {
      await ports.save(state, 'queued');
      return;
    }
    if (!Number.isFinite(turn.tokens) || turn.tokens < 0) throw new Error('Invalid model usage');
    if (new Set(turn.calls.map(call => call.id)).size !== turn.calls.length) throw new Error('Duplicate tool call IDs');
    state.tokens += turn.tokens;
    if (state.tokens > CLOUD_LIMITS.tokens || ports.now() >= state.deadline) {
      await ports.save(state, 'failed', 'Run time or token limit reached');
      return;
    }
    state.turns += 1;
    state.modelIntent = undefined;
    state.responseId = undefined;
    state.calls = turn.calls;
    // Responses reasoning items must survive tool rounds alongside function calls.
    state.transcript.push(...(turn.outputItems ?? [{ role: 'assistant', content: turn.text, tool_calls: turn.calls }]));
    if (!turn.calls.length) {
      state.phase = 'done';
      state.finalText = turn.text;
      if (await ports.save(state, 'running')) await ports.complete(turn.text, state);
      return;
    }
    state.phase = 'tools';
    await ports.save(state, 'queued');
    return;
  }

  for (const call of state.calls) {
    const key = `${runId}:turn:${state.turns}:tool:${call.id}`;
    const receipt = state.receipts[key];
    if (receipt?.state === 'done') continue;
    const policy = ports.toolPolicy(call);
    if (!policy.allowed) {
      state.receipts[key] = {
        state: 'done',
        output: JSON.stringify({ error: 'Tool not authorized' }),
        toolName: call.name,
        outcome: 'blocked',
      };
      await ports.save(state, 'queued');
      return;
    }
    if (policy.needsApproval && !ports.approved(call)) {
      await ports.save(state, 'awaiting_input', `Approval required: ${call.name}`);
      return;
    }
    if (receipt?.state === 'started' && !policy.replaySafe) {
      await ports.save(state, 'awaiting_input', `Tool outcome unknown: ${call.name}. Verify before retrying.`);
      return;
    }
    state.receipts[key] = { state: 'started' };
    if (!await ports.save(state, 'running')) return;
    let result: CloudToolOutput;
    try {
      result = await ports.executeTool(call, key);
    } catch (error) {
      if (!(error instanceof CloudToolContinuation)) throw error;
      const requeue = error.disposition === 'pending' && policy.replaySafe;
      await ports.save(state, requeue ? 'queued' : 'awaiting_input',
        requeue ? 'Durable tool work pending' : 'Tool outcome requires recovery; do not resubmit');
      return;
    }
    state.receipts[key] = typeof result === 'string'
      ? { state: 'done', output: result, toolName: call.name, outcome: 'completed' }
      : {
        state: 'done',
        output: result.output,
        presentation: result.presentation,
        toolName: call.name,
        outcome: 'completed',
      };
    await ports.save(state, 'queued');
    return;
  }
  for (const call of state.calls) {
    const key = `${runId}:turn:${state.turns}:tool:${call.id}`;
    state.transcript.push({ role: 'tool', tool_call_id: call.id, content: state.receipts[key].output });
  }
  state.calls = [];
  state.phase = 'model';
  await ports.save(state, 'queued');
}
