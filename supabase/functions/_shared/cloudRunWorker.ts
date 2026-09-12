import { initialEngineState, tickCloudRun, type EngineState, type ToolCall } from './cloudRunEngine.ts';
import type { cloudResponseProvider } from './cloudRunProvider.ts';
import { cloudMessagePresentation, cloudPresentation, type CloudToolOutput } from './cloudRunArtifacts.ts';

export type ClaimedCloudRun = {
  id: string; user_id: string; session_id: string; mode: 'ask' | 'auto';
  lease_token: string; created_at: string;
  // Real SQL claims require these fields; the store validates them. Optional
  // here preserves existing pure-worker fixtures and checkpoint-only callers.
  session_sequence?: number; execution_messages?: unknown[];
  input_revision?: number; started_at?: string;
  request: { messages: unknown[] };
  checkpoint: { engine?: EngineState; [key: string]: unknown };
};
export type CloudWorkerStore = {
  claim(id: string): Promise<ClaimedCloudRun | null>;
  checkpoint(run: ClaimedCloudRun, checkpoint: Record<string, unknown>, status: string, reason?: string): Promise<boolean>;
  complete(run: ClaimedCloudRun, result: unknown, message: unknown): Promise<boolean>;
};
export type RegisteredCloudTool = {
  // Determined by trusted server registration, never by model-supplied metadata.
  approval: 'never' | 'ask-mode' | 'always';
  replaySafe: boolean;
  authorize(run: ClaimedCloudRun, call: ToolCall): Promise<boolean>;
  execute(run: ClaimedCloudRun, call: ToolCall, receiptKey: string): Promise<CloudToolOutput>;
};
export type CloudWorkerContext = {
  provider: ReturnType<typeof cloudResponseProvider>;
  tools: Record<string, RegisteredCloudTool>;
};
export type CloudWorkerOptions = {
  store: CloudWorkerStore;
  now?: () => number;
} & (CloudWorkerContext | {
  /** Resolve trusted instructions, tools and entitlements only AFTER the claim.
   * Context is ephemeral: never save credentials in the durable checkpoint. */
  prepare(run: ClaimedCloudRun): Promise<CloudWorkerContext>;
});

export async function cloudCallHash(call: ToolCall): Promise<string> {
  const bytes = new TextEncoder().encode(`${call.name}\n${call.arguments}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** One scheduler invocation claims one job and advances one durable boundary.
 * No browser request, auth token, or global mutable user state is retained. */
export async function processCloudRun(id: string, options: CloudWorkerOptions): Promise<boolean> {
  const run = await options.store.claim(id);
  if (!run) return false;
  const context = 'prepare' in options ? await options.prepare(run) : options;
  const now = options.now ?? Date.now;
  const engine = run.checkpoint.engine ?? initialEngineState(
    run.execution_messages ?? run.request.messages, Date.parse(run.started_at ?? run.created_at));
  const authorized = new Set<string>();
  const hashes = new Map<string, string>();
  const approval = run.checkpoint.pendingApproval as { callId?: string; argumentsHash?: string } | undefined;
  const response = run.checkpoint.inputResponse as { decision?: string; callId?: string; argumentsHash?: string } | undefined;
  const approvedCalls = new Set<string>();
  // Model names are untrusted. Inherited Object members are not registered tools.
  const registeredTool = (name: string): RegisteredCloudTool | undefined =>
    Object.prototype.hasOwnProperty.call(context.tools, name) ? context.tools[name] : undefined;
  // Re-evaluate current entitlements on EVERY tool attempt/resume.
  for (const call of engine.calls) {
    const tool = registeredTool(call.name);
    if (tool && await tool.authorize(run, call)) authorized.add(call.id);
    const hash = await cloudCallHash(call);
    hashes.set(call.id, hash);
    if (approval?.callId === call.id && approval.argumentsHash === hash &&
        response?.callId === call.id && response.argumentsHash === hash) {
      if (response.decision === 'approve') approvedCalls.add(call.id);
      if (response.decision === 'deny') {
        engine.receipts[`${id}:turn:${engine.turns}:tool:${call.id}`] = {
          state: 'done', output: JSON.stringify({ error: 'User declined this action. Do not repeat it.' }),
        };
      }
    }
  }
  await tickCloudRun(id, engine, {
    now,
    save: (state, status, reason) => {
      const checkpoint: Record<string, unknown> = { ...run.checkpoint, engine: state };
      if (status === 'awaiting_input' && reason?.startsWith('Approval required:')) {
        const call = state.calls.find(call => {
          const tool = registeredTool(call.name);
          return state.receipts[`${id}:turn:${state.turns}:tool:${call.id}`]?.state !== 'done' &&
            !approvedCalls.has(call.id) && tool &&
            (tool.approval === 'always' || (tool.approval === 'ask-mode' && run.mode === 'ask'));
        });
        checkpoint.pendingApproval = call ? {
          callId: call.id, argumentsHash: hashes.get(call.id), name: call.name, arguments: call.arguments,
        } : null;
        checkpoint.inputResponse = null;
      }
      // Consume approvals after their receipt is saved, but preserve them while
      // a started operation is being reconciled after a worker interruption.
      if (approval?.callId && state.receipts[`${id}:turn:${state.turns}:tool:${approval.callId}`]?.state === 'done') {
        checkpoint.pendingApproval = null;
        checkpoint.inputResponse = null;
      }
      return options.store.checkpoint(run, checkpoint, status, reason);
    },
    startModel: context.provider.startModel,
    pollModel: context.provider.pollModel,
    complete: (text, state) => options.store.complete(run,
      { choices: [{ message: { role: 'assistant', content: text } }], model_used: 'gpt-5.6-luna', cloud_run_id: id,
        ...cloudPresentation(state.receipts) },
      { id: `cloud-${id}`, role: 'assistant', content: text, timestamp: run.created_at,
        ...cloudMessagePresentation(cloudPresentation(state.receipts)), sourceModel: 'cloud-chat', modelUsed: 'gpt-5.6-luna',
        metadata: { cloudRunId: id, modelTurns: state.turns } }),
    toolPolicy: (call) => {
      const tool = registeredTool(call.name);
      return {
        allowed: !!tool && authorized.has(call.id),
        needsApproval: !!tool && (tool.approval === 'always' || (tool.approval === 'ask-mode' && run.mode === 'ask')),
        replaySafe: tool?.replaySafe ?? false,
      };
    },
    approved: call => approvedCalls.has(call.id),
    executeTool: async (call, key) => {
      const tool = registeredTool(call.name);
      if (!tool || !await tool.authorize(run, call)) throw new Error('Tool authorization changed');
      return tool.execute(run, call, key);
    },
  });
  return true;
}
