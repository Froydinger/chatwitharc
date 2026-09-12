import type { CloudRunLifecycle, CloudRunLifecycleEntry } from './cloudRunLifecycle';
import type { CloudRun, CloudRunMode } from './cloudRuns';
import type { AppProjectSnapshot } from './cloudAppProjects';

export interface CloudAppRunPorts {
  ownerId(): Promise<string | null>;
  lifecycle(onChange: (entry: CloudRunLifecycleEntry) => void): Promise<CloudRunLifecycle>;
  prepareProject(snapshot: AppProjectSnapshot, signal: AbortSignal): Promise<void>;
  prepareSession(snapshot: AppProjectSnapshot, signal: AbortSignal, sessionId?: string): Promise<{ id: string; revision: number }>;
  reconcile(run: CloudRun, signal: AbortSignal): Promise<unknown>;
  remember(runId: string, sessionId: string): void;
  uuid?(): string;
}
export interface CloudAppRunView {
  entry?: CloudRunLifecycleEntry;
  busy: boolean;
  error?: string;
  nextCursor?: string | null;
}

/** App-only owner/project scope. Closing detaches observation, never cancels work.
 * No selected chat/project lookup, paid provider access or automatic resubmission.
 */
export class CloudAppRuns {
  private scope = new AbortController();
  private lifecycle?: CloudRunLifecycle;
  private initializing?: Promise<CloudRunLifecycle>;
  private sessionId?: string;
  private pendingId?: string;
  private terminal = new Set<string>();
  private view: CloudAppRunView = { busy: false };
  constructor(private owner: string, private projectId: string, private enabled: boolean,
    private ports: CloudAppRunPorts, private onChange: (view: CloudAppRunView) => void) {}
  snapshot() { return structuredClone(this.view); }
  private emit() { if (!this.scope.signal.aborted) this.onChange(this.snapshot()); }
  private async guard() {
    this.scope.signal.throwIfAborted();
    if (!this.enabled) throw new Error('Cloud App Builder is not enabled.');
    if (await this.ports.ownerId() !== this.owner) { this.close(); throw new Error('App owner changed.'); }
    this.scope.signal.throwIfAborted();
  }
  private async init() {
    await this.guard();
    this.initializing ??= this.ports.lifecycle(entry => {
      if (this.scope.signal.aborted || entry.kind !== 'app') return;
      if (entry.run?.projectId !== this.projectId && entry.id !== this.pendingId) return;
      if (entry.run?.projectId && entry.run.projectId !== this.projectId) {
        this.view.error = 'Cloud run project mismatch.'; this.emit(); return;
      }
      // Discovery is newest-first. Do not let older terminal history replace an active run.
      if (this.view.entry && this.view.entry.id !== entry.id) return;
      this.sessionId = entry.sessionId;
      this.view.entry = entry;
      if (entry.error) this.view.error = entry.error;
      this.emit();
      if (entry.run?.status === 'completed' && !this.terminal.has(entry.id)) {
        this.terminal.add(entry.id);
        void this.ports.reconcile(entry.run, this.scope.signal).catch(error => this.fail(error));
      }
    });
    const lifecycle = await this.initializing;
    if (this.scope.signal.aborted) { lifecycle.detachAll(); this.scope.signal.throwIfAborted(); }
    this.lifecycle = lifecycle;
    return lifecycle;
  }
  private fail(error: unknown) {
    if (!this.scope.signal.aborted) {
      this.view.error = error instanceof Error ? error.message : 'Cloud app operation failed.';
      this.emit();
    }
  }
  async restore(cursor?: string) {
    const lifecycle = await this.init();
    const page = await lifecycle.restore({ includeTerminal: true, limit: 100, ...(cursor ? { cursor } : {}) });
    await this.guard();
    this.view.nextCursor = page.nextCursor; this.emit();
    return page;
  }
  async start(prompt: string, mode: CloudRunMode, snapshot: AppProjectSnapshot) {
    if (this.view.busy || (this.view.entry && !['completed', 'failed', 'cancelled'].includes(this.view.entry.run?.status ?? 'unknown'))) {
      throw new Error('Reconnect or finish the current app run before starting another.');
    }
    if (!prompt.trim() || prompt.length > 200000 || !['ask', 'auto'].includes(mode)) throw new Error('Invalid app prompt or mode.');
    const captured = structuredClone(snapshot);
    this.view.busy = true; delete this.view.error; this.emit();
    try {
      const lifecycle = await this.init();
      await this.ports.prepareProject(captured, this.scope.signal);
      await this.guard();
      const session = await this.ports.prepareSession(captured, this.scope.signal, this.sessionId);
      await this.guard();
      this.view.entry = undefined;
      const entry = lifecycle.prepare({ sessionId: session.id, kind: 'app', mode,
        expectedRevision: session.revision,
        userMessage: { id: this.ports.uuid?.() ?? crypto.randomUUID(), role: 'user', type: 'text', content: prompt, timestamp: new Date().toISOString() },
        request: { projectId: this.projectId, messages: [...captured.messages.slice(-199).map(({ role, content }) => ({ role, content })), { role: 'user', content: prompt }] },
      });
      this.pendingId = entry.id;
      this.view.entry = entry; this.emit();
      // Persist IDs before submitting. Never persist bearer credentials.
      this.ports.remember(entry.id, session.id);
      await lifecycle.submit(entry.id);
      await this.guard();
      this.observe(entry.id);
      return entry.id;
    } catch (error) { this.fail(error); throw error; }
    finally { this.view.busy = false; this.emit(); }
  }
  private observe(id: string) {
    if (this.scope.signal.aborted) return;
    const status = this.lifecycle?.get(id)?.run?.status;
    if (status === 'queued' || status === 'running') void this.lifecycle!.reconnect(id).catch(error => this.fail(error));
  }
  async reconnect() {
    const lifecycle = await this.init();
    const id = this.view.entry?.id;
    if (!id) return this.restore();
    delete this.view.error;
    try { return await lifecycle.reconnect(id); } catch (error) { this.fail(error); throw error; }
  }
  async decide(decision: 'approve' | 'deny') {
    const lifecycle = await this.init();
    const entry = this.view.entry;
    const pending = entry?.run?.checkpoint?.pendingApproval;
    if (!entry || !pending || this.view.busy) throw new Error('Reconnect to load the current approval.');
    const captured = { decision, callId: pending.callId, argumentsHash: pending.argumentsHash };
    this.view.busy = true; this.emit();
    try { await lifecycle.approve(entry.id, captured); await this.guard(); this.observe(entry.id); }
    catch (error) { this.fail(error); throw error; }
    finally { this.view.busy = false; this.emit(); }
  }
  async cancel() {
    const lifecycle = await this.init();
    if (this.view.entry) await lifecycle.cancel(this.view.entry.id);
  }
  close() { this.scope.abort(); this.lifecycle?.detachAll(); }
}
