import { createContext, createElement, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createCloudRunLifecycle } from '@/services/cloudRunLifecycle';
import type { CloudRunLifecycle, CloudRunLifecycleEntry, CloudRunLifecycleOptions } from '@/services/cloudRunLifecycle';
import type { CloudRunApproval, CloudRunSubmission } from '@/services/cloudRuns';

export type TextCloudRunSubmission = Omit<CloudRunSubmission, 'id' | 'kind'>;
export type CloudRunResponseInput = CloudRunApproval | string | { text?: string; answers?: Record<string, string> };
type Factory = (options: CloudRunLifecycleOptions, owner: string) => Promise<CloudRunLifecycle>;
export interface CloudRunsSnapshot {
  ready: boolean;
  restoring: boolean;
  entries: CloudRunLifecycleEntry[];
  activeCursor: string | null;
  historyCursor: string | null;
  error: string | null;
}
const empty = (): CloudRunsSnapshot => ({ ready: false, restoring: false, entries: [], activeCursor: null, historyCursor: null, error: null });
const terminal = (entry: CloudRunLifecycleEntry) => ['completed', 'failed', 'cancelled'].includes(entry.run?.status ?? '');

export interface UseCloudRunsOptions {
  /** Default false: no initialization, discovery, listeners or API requests. */
  enabled?: boolean;
  ownerId: string | null;
  /** Display filter only. Submission always supplies its own captured sessionId. */
  sessionId: string | null;
  /** Read/reconcile authoritative session state. Never append another assistant.
   * Check signal after asynchronous reads before applying results to UI state.
   */
  onTerminal: (entry: CloudRunLifecycleEntry, context: {
    ownerId: string; sessionId: string; signal: AbortSignal;
  }) => void | Promise<void>;
  /** Injection for tests; production composes the real cloudRuns transport. */
  createLifecycle?: Factory;
}

/** Testable owner/session binding used by the hook. No message store or UI writes. */
export class CloudRunsBinding {
  private lifecycle: CloudRunLifecycle | null = null;
  private disposed = false;
  private scope = new AbortController();
  private entries = new Map<string, CloudRunLifecycleEntry>();
  private observations = new Map<string, Promise<CloudRunLifecycleEntry | undefined>>();
  private mutations = new Map<string, Promise<CloudRunLifecycleEntry | undefined>>();
  private terminalAttempts = new Set<string>();
  private terminalFailures = new Set<string>();
  private refreshTask: Promise<void> | null = null;
  private state = empty();
  private eventTarget?: EventTarget;
  private eventRefresh = () => { void this.restore().catch(() => {}); };

  constructor(private owner: string,
    private options: Pick<UseCloudRunsOptions, 'onTerminal' | 'createLifecycle'> & {
      onChange: (snapshot: CloudRunsSnapshot) => void;
      isCurrent?: () => boolean;
    }) {}

  private active() { return !this.disposed && (this.options.isCurrent?.() ?? true); }
  private publish() {
    if (this.active()) this.options.onChange(structuredClone({ ...this.state, entries: [...this.entries.values()] }));
  }
  private fail(error: unknown) {
    if (!this.active()) return;
    this.state.error = error instanceof Error ? error.message : 'Cloud run observation failed.';
    this.publish();
  }
  private client() {
    if (!this.active() || !this.lifecycle) throw new Error('Cloud runs are not enabled and ready for this owner/session.');
    return this.lifecycle;
  }
  private update = (entry: CloudRunLifecycleEntry) => {
    if (!this.active() || entry.kind !== 'chat') return;
    this.entries.set(entry.id, entry);
    this.publish();
    this.reconcile(entry);
  };
  private reconcile(entry: CloudRunLifecycleEntry) {
    if (!this.active() || !terminal(entry) || this.terminalAttempts.has(entry.id)) return;
    this.terminalAttempts.add(entry.id);
    // Promise boundary also catches synchronous reconciliation failures.
    void Promise.resolve().then(() => {
      if (!this.active()) return;
      return this.options.onTerminal(structuredClone(entry), {
        ownerId: this.owner, sessionId: entry.sessionId, signal: this.scope.signal,
      });
    }).catch(error => { this.terminalFailures.add(entry.id); this.fail(error); });
  }

  async start(target?: EventTarget) {
    if (!this.active()) return;
    const lifecycle = await (this.options.createLifecycle ?? createCloudRunLifecycle)({ onChange: this.update }, this.owner);
    if (!this.active()) { lifecycle.detachAll(); return; }
    this.lifecycle = lifecycle;
    this.eventTarget = target;
    target?.addEventListener('focus', this.eventRefresh);
    target?.addEventListener('online', this.eventRefresh);
    this.state.ready = true;
    this.publish();
    await this.restore();
  }

  /** Each event: at most two 25-row pages, never automatic pagination. */
  restore(): Promise<void> {
    if (!this.active() || !this.lifecycle) return Promise.resolve();
    if (this.refreshTask) return this.refreshTask;
    const client = this.client();
    this.state.restoring = true;
    this.state.error = null;
    for (const id of this.terminalFailures) this.terminalAttempts.delete(id);
    this.terminalFailures.clear();
    this.publish();
    const task = (async () => {
      try {
        // Active jobs get their own page so older completions cannot hide them.
        const active = await client.restore({ limit: 25 });
        if (!this.active()) return;
        this.state.activeCursor = active.nextCursor;
        this.resumeKnown();
        // Recover completions missed while closed. Pagination is caller driven.
        const history = await client.restore({ limit: 25, includeTerminal: true });
        if (!this.active()) return;
        this.state.historyCursor = history.nextCursor;
        this.resumeKnown();
      } catch (error) { this.fail(error); throw error; }
      finally {
        this.state.restoring = false;
        this.publish();
        if (this.refreshTask === task) this.refreshTask = null;
      }
    })();
    this.refreshTask = task;
    return task;
  }

  async loadMore(cursor: string, includeTerminal = false) {
    if (!cursor) throw new Error('A discovery cursor is required.');
    try {
      const page = await this.client().restore({ cursor, includeTerminal, limit: 25 });
      if (!this.active()) return;
      if (includeTerminal) this.state.historyCursor = page.nextCursor;
      else this.state.activeCursor = page.nextCursor;
      this.resumeKnown(); this.publish();
      return page.nextCursor;
    } catch (error) { this.fail(error); throw error; }
  }

  private resumeKnown() {
    for (const entry of this.entries.values()) {
      if (terminal(entry)) { this.reconcile(entry); continue; }
      if (entry.run || entry.connection === 'uncertain' || entry.connection === 'detached') {
        void this.reconnect(entry.id).catch(() => {});
      }
    }
  }

  prepare(input: TextCloudRunSubmission) {
    return this.client().prepare({ ...input, kind: 'chat' });
  }
  private assertRun(id: string) {
    this.client();
    if (!this.entries.has(id)) throw new Error('Unknown run for this text-chat session.');
  }
  reconnect(id: string): Promise<CloudRunLifecycleEntry | undefined> {
    this.assertRun(id);
    const mutation = this.mutations.get(id);
    if (mutation) return mutation;
    const observing = this.observations.get(id);
    if (observing) return observing;
    const entry = this.entries.get(id)!;
    if (terminal(entry)) { this.reconcile(entry); return Promise.resolve(entry); }
    const promise = this.client().reconnect(id).catch(error => { this.fail(error); throw error; })
      .finally(() => { if (this.observations.get(id) === promise) this.observations.delete(id); });
    this.observations.set(id, promise);
    return promise;
  }
  private mutate(id: string, action: (client: CloudRunLifecycle) => Promise<CloudRunLifecycleEntry | undefined>, observeAfter: boolean) {
    this.assertRun(id);
    if (this.mutations.has(id)) return Promise.reject(new Error('An action is already pending for this run.'));
    const client = this.client();
    client.detach(id);
    this.observations.delete(id);
    const promise = Promise.resolve().then(() => this.active() ? action(this.client()) : undefined).catch(error => { this.fail(error); throw error; }).finally(() => {
      if (this.mutations.get(id) === promise) this.mutations.delete(id);
    }).then(entry => {
      if (this.active() && observeAfter && entry?.run && !terminal(entry)) void this.reconnect(id).catch(() => {});
      return entry;
    });
    this.mutations.set(id, promise);
    return promise;
  }
  /** Prepare once, then submit that ID. An uncertain failure is reconnect-only. */
  submit(id: string) { return this.mutate(id, client => client.submit(id), true); }
  cancel(id: string) { return this.mutate(id, client => client.cancel(id), false); }
  respond(id: string, response: CloudRunResponseInput) {
    return this.mutate(id, client => typeof response === 'object' && 'decision' in response
      ? client.approve(id, response) : client.respond(id, response), true);
  }
  detach(id: string) { this.assertRun(id); this.client().detach(id); this.observations.delete(id); }
  dispose() {
    this.disposed = true;
    this.scope.abort();
    this.eventTarget?.removeEventListener('focus', this.eventRefresh);
    this.eventTarget?.removeEventListener('online', this.eventRefresh);
    this.lifecycle?.detachAll(true);
    this.entries.clear();
  }
}

/** Opt-in only. The caller provides identity from its existing auth/session state. */
export function useCloudRunCoordinator(options: UseCloudRunsOptions) {
  const current = useRef(options);
  current.current = options;
  const binding = useRef<CloudRunsBinding | null>(null);
  const [view, setView] = useState<{ scope: string; state: CloudRunsSnapshot }>({ scope: '', state: empty() });
  const enabled = options.enabled === true && !!options.ownerId;
  const scope = JSON.stringify([enabled, options.ownerId]);

  useEffect(() => {
    if (!enabled) { binding.current = null; return; }
    const owner = options.ownerId!;
    let cancelled = false;
    const isCurrent = () => current.current.enabled === true && current.current.ownerId === owner;
    const instance = new CloudRunsBinding(owner, {
      createLifecycle: options.createLifecycle,
      isCurrent,
      onChange: state => { if (isCurrent()) setView({ scope, state }); },
      onTerminal: (entry, context) => current.current.onTerminal(entry, context),
    });
    binding.current = instance;
    void instance.start(typeof window === 'undefined' ? undefined : window).catch(error => {
      if (!cancelled && isCurrent()) setView(previous => ({ scope, state: { ...(previous.scope === scope ? previous.state : empty()), error: error instanceof Error ? error.message : 'Cloud runs unavailable.' } }));
    });
    return () => { cancelled = true; instance.dispose(); if (binding.current === instance) binding.current = null; };
  }, [enabled, options.ownerId, options.createLifecycle, scope]);

  useEffect(() => {
    if (enabled && binding.current) void binding.current.restore().catch(() => {});
  }, [enabled, options.sessionId]);

  const getBinding = () => {
    if (!enabled || !binding.current || view.scope !== scope || current.current.enabled !== true
      || current.current.ownerId !== options.ownerId) {
      throw new Error('Cloud runs are not enabled and ready.');
    }
    return binding.current;
  };
  const state = enabled && view.scope === scope ? view.state : empty();
  return {
    ...state,
    allEntries: state.entries,
    entries: state.entries.filter(entry => entry.sessionId === options.sessionId),
    prepare: (input: TextCloudRunSubmission) => getBinding().prepare(input),
    submit: (id: string) => getBinding().submit(id),
    cancel: (id: string) => getBinding().cancel(id),
    respond: (id: string, response: CloudRunResponseInput) => getBinding().respond(id, response),
    reconnect: (id: string) => getBinding().reconnect(id),
    restore: () => getBinding().restore(),
    loadMore: (cursor: string, includeTerminal = false) => getBinding().loadMore(cursor, includeTerminal),
    detach: (id: string) => getBinding().detach(id),
  };
}

export type CloudRunsApi = ReturnType<typeof useCloudRunCoordinator>;
export type { CloudRunLifecycleEntry, CloudRunApproval };

const CloudRunsContext = createContext<CloudRunsApi | null>(null);
const unavailable = (): never => { throw new Error('Cloud runs are not enabled and ready.'); };
const inactiveApi: CloudRunsApi = { ...empty(), allEntries: [], prepare: unavailable, submit: unavailable,
  cancel: unavailable, respond: unavailable, reconnect: unavailable, restore: unavailable,
  loadMore: unavailable, detach: unavailable };
export type CloudRunsProviderProps = UseCloudRunsOptions & { children?: ReactNode };
/** Mount once above composer and list; session changes preserve owner observations. */
export function CloudRunsProvider({ children, ...options }: CloudRunsProviderProps) {
  const api = useCloudRunCoordinator(options);
  return createElement(CloudRunsContext.Provider, { value: api }, children);
}
const disabledOptions: UseCloudRunsOptions = { ownerId: null, sessionId: null, onTerminal: () => {} };
/** Pass options ONCE in the parent and pass its API to children; alternatively,
 * mount a provider and use no-argument consumers. Consumers perform no IO.
 */
export function useCloudRuns(options?: UseCloudRunsOptions): CloudRunsApi {
  const context = useContext(CloudRunsContext);
  const owned = useCloudRunCoordinator(options ?? disabledOptions);
  return options ? owned : context ?? inactiveApi;
}
