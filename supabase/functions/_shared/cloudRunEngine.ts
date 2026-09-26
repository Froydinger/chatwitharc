/** One bounded tool-loop tick. Persistence and provider adapters are injected so
 * execution has no dependency on a browser connection or in-memory continuation.
 * The store must fence every write with the worker's current lease token. */
import type { CloudPresentation, CloudToolOutput } from './cloudRunArtifacts.ts';
export type ToolCall = { id: string; name: string; arguments: string; turnId?: string };
export type ModelTurn = {
  calls: ToolCall[];
  text: string;
  tokens: number;
  /** The provider is still working; this turn only checkpoints reported usage. */
  progressOnly?: boolean;
  /** True while an Agents session can still consume tokens or await our actions. */
  providerActive?: boolean;
  outputItems?: unknown[];
  /** Safe high-level reasoning summary, never private chain-of-thought. */
  reasoningSummary?: string;
};
export type AgentToolResult = {
  callId: string;
  turnId: string;
  success: boolean;
  output?: string;
  error?: string;
};
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
  /** Approval waits are user time, not agent runtime. Prevent extending twice on worker retries. */
  approvalWaitApplied?: string;
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
  /** Agents API session state is checkpointed with the rest of the run. */
  modelProvider?: 'responses' | 'agents';
  agentSessionId?: string;
  agentTurnId?: string;
  agentToolResultIntent?: string;
  finalText?: string;
  reasoningSummary?: string;
};
export interface EnginePorts {
  limits?: CloudRunLimits;
  now(): number;
  // Return false on cancellation or lost lease. Never silently accept a write.
  save(state: EngineState, status: 'running' | 'queued' | 'awaiting_input' | 'failed', reason?: string): Promise<boolean>;
  startModel(transcript: unknown[], requestKey: string, maxTokens: number): Promise<string>;
  pollModel(responseId: string): Promise<ModelTurn | null>;
  startAgentSession?(transcript: unknown[], requestKey: string, maxTokens: number): Promise<string>;
  pollAgentSession?(sessionId: string, previousUsageTokens?: number): Promise<ModelTurn | null>;
  submitAgentToolResults?(sessionId: string, results: AgentToolResult[], idempotencyKey: string): Promise<void>;
  cancelAgentSession?(sessionId: string, idempotencyKey: string): Promise<void>;
  complete(text: string, state: EngineState): Promise<boolean>;
  toolPolicy(call: ToolCall): { allowed: boolean; needsApproval: boolean; replaySafe: boolean };
  approved(call: ToolCall): boolean;
  executeTool(call: ToolCall, idempotencyKey: string): Promise<CloudToolOutput>;
}
export type EngineProvider = Pick<EnginePorts, 'startModel' | 'pollModel'> &
  Partial<Pick<EnginePorts, 'startAgentSession' | 'pollAgentSession' | 'submitAgentToolResults' | 'cancelAgentSession'>> & {
    cancelModel?(responseId: string): Promise<void>;
  };
export type CloudRunLimits = { turns: number; tokens: number; outputPerTurn: number; durationMs: number };
export const CLOUD_LIMITS: CloudRunLimits = { turns: 16, tokens: 64000, outputPerTurn: 8000, durationMs: 20 * 60 * 1000 };
export const CLOUD_APP_LIMITS: CloudRunLimits = { ...CLOUD_LIMITS, tokens: 512000 };

export function initialEngineState(input: unknown[], now: number, limits: CloudRunLimits = CLOUD_LIMITS): EngineState {
  return { version: 1, phase: 'model', turns: 0, tokens: 0,
    deadline: now + limits.durationMs, transcript: input, calls: [], receipts: {} };
}

export async function tickCloudRun(runId: string, previous: EngineState, ports: EnginePorts): Promise<void> {
  const limits = ports.limits ?? CLOUD_LIMITS;
  const state = structuredClone(previous);
  const failForLimit = async (reason: string) => {
    let cancellationUnconfirmed = false;
    if (state.agentSessionId && ports.cancelAgentSession) {
      try {
        await ports.cancelAgentSession(state.agentSessionId, `${runId}:agent-cancel`);
      } catch {
        cancellationUnconfirmed = true;
        console.error('Agents API limit cancellation was not confirmed.');
      }
    }
    await ports.save(state, 'failed', cancellationUnconfirmed ? `${reason}; provider cancellation was not confirmed` : reason);
  };
  if (state.phase === 'done') {
    await ports.complete(state.finalText ?? '', state);
    return;
  }
  if (ports.now() >= state.deadline || state.tokens >= limits.tokens) {
    await failForLimit('Run time or token limit reached');
    return;
  }
  if (state.phase === 'model') {
    if (!state.responseId && !state.agentSessionId) {
      if (state.turns >= limits.turns) {
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
      const maxTokens = Math.min(limits.outputPerTurn, limits.tokens - state.tokens);
      if (ports.startAgentSession) {
        state.modelProvider = 'agents';
        state.agentSessionId = await ports.startAgentSession(state.transcript, state.modelIntent, maxTokens);
      } else {
        state.modelProvider = 'responses';
        state.responseId = await ports.startModel(state.transcript, state.modelIntent, maxTokens);
      }
      await ports.save(state, 'queued');
      return;
    }
    let turn: ModelTurn | null;
    try {
      turn = state.modelProvider === 'agents'
        ? await ports.pollAgentSession?.(state.agentSessionId!, state.tokens) ?? null
        : await ports.pollModel(state.responseId!);
    } catch (error) {
      if (!(error instanceof CloudModelTerminalError)) throw error;
      await ports.save(state, 'failed', error.status === 'incomplete'
        ? 'Model response stopped before completion; no partial tool actions were executed.'
        : `Model response ${error.status}; no new model request was submitted.`);
      return;
    }
    if (!turn) {
      if (ports.now() >= state.deadline) {
        await failForLimit('Run time or token limit reached');
        return;
      }
      await ports.save(state, 'queued');
      return;
    }
    if (!Number.isFinite(turn.tokens) || turn.tokens < 0) throw new Error('Invalid model usage');
    if (new Set(turn.calls.map(call => call.id)).size !== turn.calls.length) throw new Error('Duplicate tool call IDs');
    state.tokens += turn.tokens;
    if (state.tokens > limits.tokens || ports.now() >= state.deadline ||
      (state.tokens >= limits.tokens && (turn.providerActive || turn.progressOnly))) {
      if (turn.providerActive || (turn.progressOnly && state.tokens >= limits.tokens)) {
        await failForLimit('Run time or token limit reached');
      } else {
        await ports.save(state, 'failed', 'Run time or token limit reached');
      }
      return;
    }
    if (turn.progressOnly) {
      await ports.save(state, 'queued');
      return;
    }
    state.turns += 1;
    state.modelIntent = undefined;
    state.responseId = undefined;
    if (turn.reasoningSummary) state.reasoningSummary = turn.reasoningSummary;
    state.calls = turn.calls;
    // Responses reasoning items must survive tool rounds alongside function calls.
    state.transcript.push(...(turn.outputItems ?? [{ role: 'assistant', content: turn.text, tool_calls: turn.calls }]));
    if (!turn.calls.length) {
      state.phase = 'done';
      state.finalText = turn.text;
      state.agentTurnId = undefined;
      if (await ports.save(state, 'running')) await ports.complete(turn.text, state);
      return;
    }
    if (state.modelProvider === 'agents') {
      const turnIds = new Set(turn.calls.map(call => call.turnId).filter((id): id is string => !!id));
      if (turnIds.size !== 1 || turn.calls.some(call => !call.turnId)) {
        throw new Error('Agents API returned incomplete function actions');
      }
      state.agentTurnId = [...turnIds][0];
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
  if (state.modelProvider === 'agents') {
    if (!state.agentSessionId || !state.agentTurnId || !ports.submitAgentToolResults) {
      throw new Error('Agents API tool-result adapter is unavailable');
    }
    // Persist the stable intent before posting to OpenAI. A retry uses the same
    // idempotency key and the same receipt-backed outputs, so a lost worker
    // cannot execute a side effect twice or submit a different result.
    const intent = state.agentToolResultIntent ?? `${runId}:agent-results:${state.turns}`;
    if (!state.agentToolResultIntent) {
      state.agentToolResultIntent = intent;
      if (!await ports.save(state, 'running')) return;
    }
    const results = state.calls.map(call => {
      const key = `${runId}:turn:${state.turns}:tool:${call.id}`;
      const receipt = state.receipts[key];
      if (!receipt || receipt.state !== 'done' || !call.turnId) throw new Error('Missing durable tool receipt');
      if (receipt.outcome === 'blocked' || receipt.outcome === 'denied') {
        return { callId: call.id, turnId: call.turnId, success: false,
          error: 'Arc did not run this action because it was not authorized or was declined.' };
      }
      return { callId: call.id, turnId: call.turnId, success: true, output: receipt.output ?? '' };
    });
    await ports.submitAgentToolResults(state.agentSessionId, results, intent);
    state.agentToolResultIntent = undefined;
    state.agentTurnId = undefined;
    state.calls = [];
    state.phase = 'model';
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
