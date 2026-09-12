import { transcriptChanges, type TranscriptSnapshot, type TranscriptOperation } from './cloudSessionChanges';

export type SessionOperation = { id: string; operation: TranscriptOperation };
export type SessionOutbox = { ownerId: string; sessionId: string; pending: SessionOperation[] };
export type SessionPersistenceResult = {
  status: 'complete' | 'uncertain' | 'conflict' | 'rejected' | 'owner-mismatch';
  applied: number;
  operationId?: string;
  revision?: number;
  code?: string;
};
export interface SessionOperationClient {
  rpc(name: 'apply_chat_session_operation', args: {
    p_operation_id: string; p_session_id: string; p_operation: TranscriptOperation;
  }): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inert, text-only integration boundary. One instance per owner/session.
 * Capture BEFORE/AFTER at the local mutation, not hydration or remote refresh.
 * The session row must already exist; title/resources/creation remain separate.
 * No auth tokens or browser storage are read, written, or cleared here.
 *
 * persistOutbox must durably save the supplied owner-scoped journal before
 * resolving. Restore it on reload, including after a lost acknowledgement.
 * A failed journal write prevents the next RPC. Never recreate operation IDs
 * to retry an uncertain operation. Call flush explicitly; there is no timer.
 */
export function createCloudSessionPersistence(options: {
  ownerId: string;
  sessionId: string;
  client: SessionOperationClient;
  currentOwnerId: () => Promise<string | null>;
  persistOutbox: (outbox: SessionOutbox) => Promise<void>;
  restored?: SessionOutbox;
  randomUUID?: () => string;
}) {
  const { ownerId, sessionId } = options;
  if (!uuid.test(ownerId) || !uuid.test(sessionId)) throw new Error('Invalid owner/session UUID');
  if (options.restored && (options.restored.ownerId !== ownerId || options.restored.sessionId !== sessionId)) {
    throw new Error('Outbox owner/session mismatch');
  }
  const pending = copy(options.restored?.pending ?? []);
  const used = new Set<string>();
  for (const item of pending) {
    if (!uuid.test(item.id) || used.has(item.id) || !item.operation ||
      !['append', 'replace', 'remove', 'canvas'].includes(item.operation.kind)) throw new Error('Invalid outbox');
    used.add(item.id);
  }
  const snapshot = (): SessionOutbox => copy({ ownerId, sessionId, pending });
  let active: Promise<SessionPersistenceResult> | undefined;
  let stopped: SessionPersistenceResult | undefined;

  function enqueue(before: TranscriptSnapshot, after: TranscriptSnapshot): string[] {
    // Allocate the complete batch before appending; failed preparation sends nothing.
    const batch = transcriptChanges(before, after).map(operation => ({
      id: (options.randomUUID ?? (() => crypto.randomUUID()))(), operation,
    }));
    const ids = new Set(used);
    for (const item of batch) {
      if (!uuid.test(item.id) || ids.has(item.id)) throw new Error('Invalid/duplicate operation UUID');
      ids.add(item.id);
    }
    for (const item of batch) { used.add(item.id); pending.push(item); }
    return batch.map(item => item.id);
  }

  async function drain(): Promise<SessionPersistenceResult> {
    let applied = 0;
    let revision: number | undefined;
    while (pending.length) {
      const item = pending[0];
      if (await options.currentOwnerId() !== ownerId) return { status: 'owner-mismatch', applied, operationId: item.id };
      // Includes every newly enqueued intent. If saving fails, retain IDs in memory.
      await options.persistOutbox(snapshot());
      if (await options.currentOwnerId() !== ownerId) return { status: 'owner-mismatch', applied, operationId: item.id };
      let response: Awaited<ReturnType<SessionOperationClient['rpc']>>;
      try {
        response = await options.client.rpc('apply_chat_session_operation', {
          p_operation_id: item.id, p_session_id: sessionId, p_operation: copy(item.operation),
        });
      } catch {
        return { status: 'uncertain', applied, revision, operationId: item.id };
      }
      if (response.error) {
        const code = response.error.code;
        const status = code === '40001' || code === '23505' ? 'conflict'
          : code === '42501' || code === '22023' ? 'rejected' : 'uncertain';
        const result: SessionPersistenceResult = { status, applied, revision, operationId: item.id, code };
        if (status !== 'uncertain') stopped = { ...result, applied: 0 };
        return result;
      }
      const receipt = response.data as Record<string, unknown> | null;
      if (!receipt || receipt.operation_id !== item.id || typeof receipt.replayed !== 'boolean' ||
        !Number.isSafeInteger(receipt.session_revision) || (receipt.session_revision as number) < 0) {
        return { status: 'uncertain', applied, revision, operationId: item.id };
      }
      revision = receipt.session_revision as number;
      pending.shift();
      applied++;
      // If this write fails, restored journal replays the SAME UUID harmlessly.
      await options.persistOutbox(snapshot());
    }
    return { status: 'complete', applied, revision };
  }

  function flush(): Promise<SessionPersistenceResult> {
    if (active) return active;
    if (stopped) return Promise.resolve({ ...stopped });
    active = drain().finally(() => { active = undefined; });
    return active;
  }
  // Conflicts deliberately have no automatic rebase/drop API. The caller must
  // surface partial progress and reconcile explicitly before replacing this outbox.
  return { enqueue, flush, snapshot };
}
