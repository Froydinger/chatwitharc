/** One account-scoped delivery loop shared by all mounted push controls. */
export type DesktopNotification = {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string | null;
};

type Stop = () => void;
type RealtimeCallbacks = {
  change: () => void;
  status: (status: string) => void;
  system: (message: { extension?: string; status?: string }) => void;
};

export type DesktopDeliveryPorts = {
  enabled: () => boolean;
  online: () => boolean;
  owner: () => Promise<string | null>;
  onOwner: (callback: (owner: string | null) => void) => Stop;
  onWake: (callback: () => void) => Stop;
  connect: (owner: string, callbacks: RealtimeCallbacks) => Stop;
  pending: (owner: string, limit: number, signal: AbortSignal) => Promise<DesktopNotification[]>;
  claim: (owner: string, id: string, signal: AbortSignal) => Promise<boolean>;
  show: (item: DesktopNotification) => Promise<unknown>;
  register?: (owner: string, signal: AbortSignal) => Promise<unknown>;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

type AccountRun = {
  owner: string;
  abort: AbortController;
  disconnect?: Stop;
  connection: number;
  timer?: ReturnType<typeof setTimeout>;
  ready: boolean;
  retry: boolean;
  attempt: number;
  running: boolean;
  dirty: boolean;
};

const BATCH_SIZE = 10;
const MAX_BATCHES = 5;
const FALLBACK_MIN_MS = 30_000;
const FALLBACK_MAX_MS = 300_000;

export class DesktopNotificationDelivery {
  private references = 0;
  private ownerId: string | null = null;
  private lifecycle = 0;
  private authRevision = 0;
  private run: AccountRun | null = null;
  private stopOwner?: Stop;
  private stopWake?: Stop;

  constructor(private readonly ports: DesktopDeliveryPorts) {}

  acquire(): Stop {
    if (++this.references === 1) {
      const lifecycle = ++this.lifecycle;
      const authRevision = this.authRevision;
      this.stopOwner = this.ports.onOwner((owner) => {
        if (lifecycle !== this.lifecycle || !this.references) return;
        this.authRevision++;
        this.setOwner(owner);
      });
      this.stopWake = this.ports.onWake(() => {
        this.refresh();
        if (this.run) {
          if (!this.run.disconnect) this.connect(this.run);
          this.request(this.run);
        }
      });
      void this.ports.owner().then((owner) => {
        if (lifecycle === this.lifecycle && authRevision === this.authRevision && this.references) {
          this.setOwner(owner);
        }
      }).catch(() => { /* The auth listener can recover a failed session read. */ });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.references) return;
      this.lifecycle++;
      this.stopOwner?.();
      this.stopWake?.();
      this.stopOwner = this.stopWake = undefined;
      this.ownerId = null;
      this.stopRun();
    };
  }

  /** Call after notification settings change; disabling fences in-flight work immediately. */
  refresh() {
    if (!this.references || !this.ownerId || !this.ports.enabled()) {
      this.stopRun();
      return;
    }
    if (this.run?.owner === this.ownerId) return;
    this.stopRun();
    const run: AccountRun = {
      owner: this.ownerId, abort: new AbortController(), ready: false, connection: 0,
      retry: false, attempt: 0, running: false, dirty: false,
    };
    this.run = run;
    this.connect(run);
    if (this.ports.register) {
      void this.ports.register(run.owner, run.abort.signal).catch(() => undefined);
    }
    this.request(run);
    this.schedule(run);
  }

  private connect(run: AccountRun) {
    if (!this.current(run) || !this.ports.online()) return;
    // Old callbacks may arrive during the previous channel's asynchronous removal.
    const connection = ++run.connection;
    const active = () => this.current(run) && connection === run.connection;
    run.ready = false;
    run.disconnect?.();
    run.disconnect = undefined;
    try {
      const disconnect = this.ports.connect(run.owner, {
        change: () => { if (active()) this.request(run); },
        status: (status) => {
          if (!active()) return;
          if (status === "SUBSCRIBED") {
            // Socket join is not proof that the Postgres replication subscription works.
            this.request(run);
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            run.ready = false;
            this.schedule(run);
          }
        },
        system: ({ extension, status }) => {
          if (!active() || extension !== "postgres_changes") return;
          run.ready = status === "ok";
          if (run.ready) {
            run.attempt = 0;
            this.clearTimer(run);
            // Read again after replication is ready to close the initial-read/join gap.
            this.request(run);
          } else {
            this.schedule(run);
          }
        },
      });
      if (active()) run.disconnect = disconnect;
      else disconnect();
    } catch {
      // A failed channel setup still gets the bounded outage recovery below.
    }
  }

  private setOwner(owner: string | null) {
    if (this.ownerId !== owner) this.stopRun();
    this.ownerId = owner;
    this.refresh();
  }

  private current(run: AccountRun) {
    return this.run === run && this.references > 0 && !run.abort.signal.aborted && this.ports.enabled();
  }

  private stopRun() {
    const run = this.run;
    this.run = null;
    if (!run) return;
    run.abort.abort();
    this.clearTimer(run);
    run.disconnect?.();
  }

  private clearTimer(run: AccountRun) {
    if (run.timer !== undefined) this.ports.clearTimer(run.timer);
    run.timer = undefined;
  }

  private schedule(run: AccountRun) {
    if (!this.current(run) || run.timer !== undefined || (run.ready && !run.retry)) return;
    // One backoff timer only during an outage/read failure; healthy idle costs no DB reads.
    const delay = Math.min(FALLBACK_MIN_MS * 2 ** Math.min(run.attempt, 4), FALLBACK_MAX_MS);
    run.timer = this.ports.setTimer(() => {
      run.timer = undefined;
      if (!this.current(run)) return;
      run.attempt++;
      if (!run.ready) this.connect(run);
      this.request(run);
    }, delay);
  }

  private request(run: AccountRun) {
    if (!this.current(run)) return;
    run.dirty = true;
    if (run.running) return;
    run.running = true;
    // Defer notification queries out of Supabase's synchronous auth callback.
    void Promise.resolve().then(() => this.drain(run)).finally(() => {
      run.running = false;
      if (!this.current(run)) return;
      this.schedule(run);
      if (run.dirty && !run.retry) this.request(run);
    });
  }

  private async drain(run: AccountRun) {
    run.retry = false;
    try {
      let batches = 0;
      while (this.current(run) && run.dirty && batches++ < MAX_BATCHES) {
        run.dirty = false;
        if (!this.ports.online()) {
          run.retry = true;
          return;
        }
        const items = await this.ports.pending(run.owner, BATCH_SIZE, run.abort.signal);
        if (!this.current(run)) return;
        for (const item of items) {
          // Owner filter is also enforced in SQL; this guards stale/malformed adapter results.
          if (item.user_id !== run.owner) continue;
          if (!this.current(run)) return;
          const claimed = await this.ports.claim(run.owner, item.id, run.abort.signal);
          if (!this.current(run)) return;
          if (!claimed) continue;
          // Claim first: an uncertain native show must never be retried as a duplicate OS alert.
          await this.ports.show(item).catch(() => undefined);
          if (!this.current(run)) return;
        }
        if (items.length === BATCH_SIZE) run.dirty = true;
      }
      run.retry = run.dirty;
      if (run.ready && !run.retry) this.clearTimer(run);
    } catch {
      if (this.current(run)) run.retry = true;
    }
  }
}
