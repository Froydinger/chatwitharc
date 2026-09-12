export type AppProjectSnapshot = {
  files: Record<string, { content: string; language: string }>;
  messages: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number }[];
};
export type AppProjectRow = AppProjectSnapshot & {
  id: string; user_id: string; cloud_revision: number; cloud_managed: boolean;
  [key: string]: unknown;
};
type Intent = { operationId: string; expectedRevision: number | null; snapshot: AppProjectSnapshot };
export type AppProjectJournal = { ownerId: string; projectId: string; revision: number; pending: Intent[]; saved?: AppProjectSnapshot };
export type AppProjectSaveResult = { status: 'saved' | 'uncertain' | 'conflict' | 'rejected'; revision: number };
export interface AppProjectPorts {
  ownerId(): Promise<string | null>;
  read(projectId: string, ownerId: string): Promise<unknown>;
  save(args: { p_operation_id: string; p_project_id: string; p_expected_revision: number; p_files: AppProjectSnapshot['files']; p_messages: AppProjectSnapshot['messages'] }): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  persist(journal: AppProjectJournal): void;
  uuid?(): string;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeAppProjectSnapshot(raw: unknown): AppProjectSnapshot {
  const value = copy(raw) as AppProjectSnapshot;
  if (!value || !value.files || typeof value.files !== 'object' || Array.isArray(value.files) || !Array.isArray(value.messages)) throw new Error('Invalid app snapshot.');
  if (Object.keys(value.files).length > 200 || Object.values(value.files).some(file => !file || typeof file.content !== 'string')) throw new Error('Invalid app files.');
  const ids = new Set<string>();
  const messages = value.messages.map(message => {
    if (!message || !message.id || ids.has(message.id) || !['user','assistant'].includes(message.role) || typeof message.content !== 'string') throw new Error('Invalid app history.');
    ids.add(message.id);
    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.parse(String(message.timestamp));
    if (!Number.isFinite(timestamp)) throw new Error('Invalid app message timestamp.');
    return { ...message, timestamp };
  });
  const files = Object.fromEntries(Object.entries(value.files).map(([path, file]) => [path, {
    ...file, language: typeof file.language === 'string' ? file.language : 'typescript',
  }]));
  return { files, messages };
}

/** One owner/project outbox. Capture is synchronous and durable before network.
 * Recreate with the journal after refresh. No automatic retry, token storage,
 * global selection lookup, conflict rebase or journal deletion on signout.
 */
export class CloudAppProjectPersistence {
  private journal: AppProjectJournal;
  private active?: Promise<AppProjectSaveResult>;
  private blocked?: AppProjectSaveResult['status'];
  private epoch = 0;
  constructor(ownerId: string, projectId: string, revision: number, private ports: AppProjectPorts, restored?: AppProjectJournal) {
    if (!uuid.test(ownerId) || !uuid.test(projectId) || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid project identity/revision.');
    if (restored && (restored.ownerId !== ownerId || restored.projectId !== projectId)) throw new Error('Project journal owner mismatch.');
    this.journal = copy(restored ?? { ownerId, projectId, revision, pending: [] });
    if (!Array.isArray(this.journal.pending) || !Number.isSafeInteger(this.journal.revision) || this.journal.revision < 0) throw new Error('Invalid project journal.');
    const ids = new Set<string>();
    for (const item of this.journal.pending) {
      if (!uuid.test(item.operationId) || ids.has(item.operationId) || (item.expectedRevision !== null && (!Number.isSafeInteger(item.expectedRevision) || item.expectedRevision < 0))) throw new Error('Invalid save intent.');
      ids.add(item.operationId); item.snapshot = normalizeAppProjectSnapshot(item.snapshot);
    }
  }
  snapshot() { return copy(this.journal); }
  pendingSnapshot() { return copy(this.journal.pending.at(-1)?.snapshot ?? null); }
  capture(value: AppProjectSnapshot) {
    const snapshot = normalizeAppProjectSnapshot(value);
    const last = this.journal.pending.at(-1)?.snapshot ?? this.journal.saved;
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    const operationId = this.ports.uuid?.() ?? crypto.randomUUID();
    if (!uuid.test(operationId) || this.journal.pending.some(item => item.operationId === operationId)) throw new Error('Invalid save operation UUID.');
    this.journal.pending.push({ operationId, expectedRevision: null, snapshot });
    this.epoch++;
    this.ports.persist(this.snapshot()); // Storage failure is explicit; in-memory intent retained.
  }
  private async owner(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (await this.ports.ownerId() !== this.journal.ownerId) throw new Error('App project owner changed.');
    signal?.throwIfAborted();
  }
  flush(): Promise<AppProjectSaveResult> {
    if (this.active) return this.active;
    if (this.blocked) return Promise.resolve({ status: this.blocked, revision: this.journal.revision });
    this.active = this.drain().finally(() => { this.active = undefined; });
    return this.active;
  }
  private async drain(): Promise<AppProjectSaveResult> {
    await this.owner();
    while (this.journal.pending.length) {
      const item = this.journal.pending[0];
      item.expectedRevision ??= this.journal.revision;
      this.ports.persist(this.snapshot());
      await this.owner();
      let result: Awaited<ReturnType<AppProjectPorts['save']>>;
      try {
        result = await this.ports.save({ p_operation_id: item.operationId, p_project_id: this.journal.projectId,
          p_expected_revision: item.expectedRevision, p_files: copy(item.snapshot.files), p_messages: copy(item.snapshot.messages) });
      } catch { return { status: 'uncertain', revision: this.journal.revision }; }
      if (result.error) {
        const code = result.error.code;
        const status = code === '40001' || code === '23505' ? 'conflict' : code === '42501' || code === '22023' ? 'rejected' : 'uncertain';
        if (status !== 'uncertain') this.blocked = status;
        return { status, revision: this.journal.revision };
      }
      const receipt = result.data as { operationId?: string; revision?: number; replayed?: boolean } | null;
      if (!receipt || receipt.operationId !== item.operationId || !Number.isSafeInteger(receipt.revision) || receipt.revision! < item.expectedRevision || typeof receipt.replayed !== 'boolean') return { status: 'uncertain', revision: this.journal.revision };
      this.journal.revision = receipt.revision!;
      this.journal.saved = item.snapshot;
      this.journal.pending.shift();
      this.ports.persist(this.snapshot());
    }
    return { status: 'saved', revision: this.journal.revision };
  }
  async reload(signal?: AbortSignal, minRevision = 0): Promise<
    { status: 'reloaded'; project: AppProjectRow } | { status: 'pending'; snapshot: AppProjectSnapshot } | { status: 'stale' }
  > {
    if (!Number.isSafeInteger(minRevision) || minRevision < 0) throw new Error('Invalid minimum revision.');
    await this.owner(signal);
    const pending = this.pendingSnapshot();
    if (pending) return { status: 'pending', snapshot: pending };
    const epoch = this.epoch;
    const raw = await this.ports.read(this.journal.projectId, this.journal.ownerId) as AppProjectRow;
    await this.owner(signal);
    const next = this.pendingSnapshot();
    if (epoch !== this.epoch || next) return next ? { status: 'pending', snapshot: next } : { status: 'stale' };
    if (!raw || raw.id !== this.journal.projectId || raw.user_id !== this.journal.ownerId) throw new Error('Server project owner mismatch.');
    if (!Number.isSafeInteger(raw.cloud_revision) || raw.cloud_revision < Math.max(minRevision, this.journal.revision)) return { status: 'stale' };
    const normalized = normalizeAppProjectSnapshot(raw);
    this.journal.revision = raw.cloud_revision;
    this.journal.saved = normalized;
    this.ports.persist(this.snapshot());
    return { status: 'reloaded', project: { ...raw, ...normalized } };
  }
}

export const cloudAppJournalKey = (ownerId: string, projectId: string) => `arc-app-outbox-v1:${ownerId}:${projectId}`;
