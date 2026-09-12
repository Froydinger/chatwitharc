import type {
  CloudRun, CloudRunApproval, CloudRunCheckpoint, CloudRunKind, CloudRunMode,
  CloudRunList, CloudRunListOptions, CloudRunRequestOptions, CloudRunSubmission,
} from './cloudRuns';

export type LifecycleRun = CloudRun<unknown, CloudRunCheckpoint>;
export interface CloudRunLifecyclePorts {
  /** Must resolve the CURRENT authenticated owner, not a captured auth snapshot. */
  ownerId(): Promise<string | null>;
  submit(input: CloudRunSubmission, options: CloudRunRequestOptions): Promise<LifecycleRun>;
  status(id: string, options: CloudRunRequestOptions): Promise<LifecycleRun>;
  list(query: CloudRunListOptions, options: CloudRunRequestOptions): Promise<CloudRunList>;
  cancel(id: string, options: CloudRunRequestOptions): Promise<LifecycleRun>;
  respond(id: string, response: unknown, options: CloudRunRequestOptions): Promise<LifecycleRun>;
  uuid?(): string;
}
export interface CloudRunLifecycleEntry {
  id: string;
  sessionId: string;
  kind: CloudRunKind;
  mode: CloudRunMode;
  connection: 'idle' | 'observing' | 'detached' | 'uncertain';
  run?: LifecycleRun;
  error?: string;
}
type InternalEntry = CloudRunLifecycleEntry & { submission?: CloudRunSubmission; attempted: boolean };
type Observation = { controller: AbortController; ownerVerified: boolean };
export interface CloudRunLifecycleOptions {
  intervalMs?: number;
  maxPolls?: number;
  requestTimeoutMs?: number;
  onChange?: (entry: CloudRunLifecycleEntry) => void;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Owner-bound, in-memory observation only. No message saves, provider calls,
 * automatic retry, global timers or background discovery. Recreate on login change.
 * Save returned IDs in the caller's durable navigation state if desired; discovery
 * can restore accepted runs even if the tab disappeared before keeping those IDs.
 */
export class CloudRunLifecycle {
  private entries = new Map<string, InternalEntry>();
  private observations = new Map<string, Observation>();
  private discovery = new Set<AbortController>();
  private readonly interval: number;
  private readonly maxPolls: number;

  constructor(private readonly owner: string, private readonly ports: CloudRunLifecyclePorts,
    private readonly options: CloudRunLifecycleOptions = {}) {
    if (!owner) throw new Error('An authenticated owner is required.');
    this.interval = options.intervalMs ?? 1500;
    // ~25 minutes of active observation: server's 20-minute budget plus recovery.
    this.maxPolls = options.maxPolls ?? 1000;
    if (!Number.isFinite(this.interval) || this.interval < 1 || this.interval > 60_000
      || !Number.isInteger(this.maxPolls) || this.maxPolls < 1 || this.maxPolls > 1000) {
      throw new RangeError('Polling must be bounded: interval 1–60000ms, maxPolls 1–1000.');
    }
  }

  get(id: string): CloudRunLifecycleEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const { submission: _submission, attempted: _attempted, ...view } = entry;
    return structuredClone(view);
  }
  private emit(entry: InternalEntry) { this.options.onChange?.(this.get(entry.id)!); }
  private entry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Unknown run. Prepare or restore it first.');
    return entry;
  }
  private async assertOwner() {
    if (await this.ports.ownerId() !== this.owner) {
      // Do not emit the previous owner's cached data after an account switch.
      for (const controller of this.discovery) controller.abort();
      for (const observation of this.observations.values()) observation.controller.abort();
      this.observations.clear();
      this.entries.clear();
      throw new Error('Cloud run owner changed; create a new coordinator.');
    }
  }

  /** No network. Capture explicit session and immutable request before any await. */
  prepare(input: Omit<CloudRunSubmission, 'id'>): CloudRunLifecycleEntry {
    if (!input.sessionId) throw new Error('An explicit session is required.');
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !input.userMessage?.id || input.userMessage.role !== 'user' || input.userMessage.type !== 'text'
      || typeof input.userMessage.timestamp !== 'string') {
      throw new Error('Atomic submission requires a stable user message and expected revision.');
    }
    const submission = structuredClone({ ...input, id: this.ports.uuid?.() ?? crypto.randomUUID() });
    if (this.entries.has(submission.id)) throw new Error('Duplicate run UUID.');
    const entry: InternalEntry = { id: submission.id, sessionId: submission.sessionId,
      kind: submission.kind, mode: submission.mode, connection: 'idle', submission, attempted: false };
    this.entries.set(entry.id, entry);
    this.emit(entry);
    return this.get(entry.id)!;
  }

  private begin(id: string, observation: Observation): void {
    observation.ownerVerified = true;
    const entry = this.entry(id);
    entry.connection = 'observing';
    delete entry.error;
    this.emit(entry);
  }
  private async operation(id: string, work: (options: CloudRunRequestOptions) => Promise<LifecycleRun>): Promise<CloudRunLifecycleEntry | undefined> {
    const entry = this.entry(id);
    // Reserve cancellation synchronously, but never publish cached state until
    // the current owner is verified. Unmount can detach during this auth await.
    this.observations.get(id)?.controller.abort();
    const observation: Observation = { controller: new AbortController(), ownerVerified: false };
    this.observations.set(id, observation);
    try {
      await this.assertOwner();
      observation.controller.signal.throwIfAborted();
      this.begin(id, observation);
      const run = await work({ signal: observation.controller.signal, timeoutMs: this.options.requestTimeoutMs });
      await this.assertOwner();
      if (observation.controller.signal.aborted) return observation.ownerVerified ? this.get(id) : undefined;
      if (run.id !== id) throw new Error('Run identity mismatch.');
      entry.run = run;
      entry.connection = 'idle';
      this.emit(entry);
    } catch (error) {
      if (observation.controller.signal.aborted) return observation.ownerVerified ? this.get(id) : undefined;
      if (!observation.ownerVerified) throw error;
      entry.connection = entry.run ? 'detached' : 'uncertain';
      entry.error = error instanceof Error ? error.message : 'Observation failed.';
      this.emit(entry);
      // No resubmit or retries. Caller chooses when to reconnect.
      throw error;
    } finally {
      if (this.observations.get(id) === observation) this.observations.delete(id);
    }
    return this.get(id);
  }

  /** At most one submit attempt per prepared ID, including uncertain responses. */
  submit(id: string) {
    const entry = this.entry(id);
    if (!entry.submission || entry.attempted) throw new Error('Submission already attempted; reconnect by id.');
    entry.attempted = true;
    return this.operation(id, options => this.ports.submit(structuredClone(entry.submission!), options));
  }

  /** Explicit bounded status observation. Stops at awaiting_input or any terminal
   * state, first error, detach, or maxPolls. Exhaustion requires explicit reconnect.
   */
  reconnect(id: string) {
    return this.operation(id, async options => {
      let run: LifecycleRun;
      for (let i = 0; i < this.maxPolls; i++) {
        await this.assertOwner();
        options.signal!.throwIfAborted();
        run = await this.ports.status(id, options);
        await this.assertOwner();
        options.signal!.throwIfAborted();
        if (run.id !== id) throw new Error('Run identity mismatch.');
        const entry = this.entry(id);
        entry.run = run;
        this.emit(entry);
        if (run.status !== 'queued' && run.status !== 'running') return run;
        if (i + 1 < this.maxPolls) await pause(this.interval, options.signal!);
      }
      // Represent a still-running server job as detached when the poll budget ends.
      this.detach(id);
      return run!;
    });
  }

  /** Exactly one bounded discovery page; does not start polling discovered runs.
   * includeTerminal can recover completions missed while closed. Pass nextCursor
   * explicitly for further pages; no automatic scan or idle API loop.
   */
  async restore(query: CloudRunListOptions = {}): Promise<CloudRunList> {
    const controller = new AbortController();
    this.discovery.add(controller);
    try {
      await this.assertOwner();
      controller.signal.throwIfAborted();
      const page = await this.ports.list(query, { signal: controller.signal, timeoutMs: this.options.requestTimeoutMs });
      await this.assertOwner();
      controller.signal.throwIfAborted();
      for (const run of page.runs) {
        const existing = this.entries.get(run.id);
        if (query.sessionId && run.sessionId !== query.sessionId) throw new Error('Discovery session mismatch.');
        if (existing && existing.sessionId !== run.sessionId) throw new Error('Run session mismatch.');
        // A discovery snapshot must not replace an actively observed/newer run.
        if (existing) continue;
        const entry: InternalEntry = { id: run.id, sessionId: run.sessionId, kind: run.kind,
          mode: run.mode, run, attempted: true, connection: 'detached' };
        this.entries.set(run.id, entry);
        this.emit(entry);
      }
      return page;
    } finally { this.discovery.delete(controller); }
  }

  detach(id: string) {
    const observation = this.observations.get(id);
    observation?.controller.abort();
    this.observations.delete(id);
    const entry = this.entries.get(id);
    if (entry) {
      entry.connection = 'detached';
      if (!observation || observation.ownerVerified) this.emit(entry);
    }
  }
  detachAll() {
    for (const controller of this.discovery) controller.abort();
    for (const id of this.observations.keys()) this.detach(id);
  }
  /** Explicit server cancellation only. Detach never calls this port. */
  cancel(id: string) { return this.operation(id, options => this.ports.cancel(id, options)); }

  respond(id: string, response: string | { text?: string; answers?: Record<string, string> }) {
    if (this.entry(id).run?.checkpoint?.pendingApproval) throw new Error('Use an exact approval decision for this run.');
    return this.resume(id, response);
  }
  approve(id: string, decision: CloudRunApproval) {
    const pending = this.entry(id).run?.checkpoint?.pendingApproval;
    if (!pending || !['approve', 'deny'].includes(decision.decision)
      || pending.callId !== decision.callId || pending.argumentsHash !== decision.argumentsHash) {
      throw new Error('Approval does not match the pending call. Reconnect first.');
    }
    return this.resume(id, { decision: decision.decision, callId: pending.callId, argumentsHash: pending.argumentsHash });
  }
  private resume(id: string, response: unknown) {
    if (this.entry(id).run?.status !== 'awaiting_input') throw new Error('Run is not awaiting input.');
    const captured = structuredClone(response);
    return this.operation(id, options => this.ports.respond(id, captured, options));
  }
}

/** Lazy default adapter keeps imports side-effect free for tests and non-UI callers. */
export async function createCloudRunLifecycle(options: CloudRunLifecycleOptions = {}, expectedOwner?: string) {
  const [transport, { supabase }] = await Promise.all([
    import('./cloudRuns'), import('@/integrations/supabase/client'),
  ]);
  const ownerId = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    return error ? null : session?.user.id ?? null;
  };
  const owner = await ownerId();
  if (!owner) throw new Error('Sign in before restoring cloud runs.');
  if (expectedOwner !== undefined && owner !== expectedOwner) throw new Error('Cloud run owner changed before initialization.');
  return new CloudRunLifecycle(owner, {
    ownerId, submit: transport.submitCloudRun, status: transport.getCloudRunStatus,
    list: transport.listCloudRuns, cancel: transport.cancelCloudRun, respond: transport.respondToCloudRun,
  }, options);
}
