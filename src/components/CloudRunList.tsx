import { CloudRunStatus } from './CloudRunStatus';
import type { CloudRunsApi } from '@/hooks/useCloudRuns';
import { useRef, useState } from 'react';

/** The parent provider owns transport. This list never starts another observer,
 * writes an assistant message, or connects to voice mode. */
export function CloudRunList({ sessionId, cloud, enabled = false }: { sessionId: string | null; cloud: CloudRunsApi; enabled?: boolean }) {
  const restorePending = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    if (restorePending.current) return;
    restorePending.current = true;
    setRestoring(true);
    try { await cloud.restore(); }
    catch { /* The owner-bound hook publishes the error for this list. */ }
    finally { restorePending.current = false; setRestoring(false); }
  };
  const entries = cloud.entries.filter(entry => entry.sessionId === sessionId);
  const loading = enabled && !cloud.error && (!cloud.ready || cloud.restoring);
  if (loading) return <section aria-label="Loading cloud tasks" aria-busy="true" role="status"
    className="glass-card w-full max-w-xl rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/70" />
      <span>Loading cloud tasks…</span>
    </div>
    <div aria-hidden="true" className="mt-3 h-2 w-2/3 animate-pulse rounded-full bg-muted/60" />
  </section>;
  if (!entries.length && !cloud.error && !cloud.activeCursor && !cloud.historyCursor) return null;
  return <section aria-label="Cloud chat requests" className="space-y-3">
    {cloud.error && <div className="glass-card rounded-2xl p-4 text-sm">
      <p role="alert" className="text-muted-foreground">{cloud.error}</p>
      <button type="button" disabled={restoring || cloud.restoring}
        className="mt-2 rounded-full border border-border px-3 py-1.5 disabled:opacity-50"
        onClick={() => { void restore(); }}>{restoring || cloud.restoring ? 'Checking…' : 'Reconnect and reload replies'}</button>
    </div>}
    {entries.map(entry => entry.run
      ? <CloudRunStatus key={entry.id} run={entry.run} connection={entry.connection}
        observationError={entry.error}
        onApprove={response => cloud.respond(entry.id, response)}
        onDeny={response => cloud.respond(entry.id, response)}
        onCancel={() => cloud.cancel(entry.id)}
        onReconnect={() => cloud.reconnect(entry.id)} />
      : <div key={entry.id} className="glass-card rounded-2xl p-4 text-sm" role="status">
        <p>{entry.connection === 'uncertain'
          ? 'Submission not confirmed. Check its status before sending again.'
          : 'Submitting to the cloud…'}</p>
        {entry.error && <p className="mt-1 text-muted-foreground">{entry.error}</p>}
        {entry.connection === 'uncertain' && <button type="button"
          className="mt-2 rounded-full border border-border px-3 py-1.5"
          onClick={() => { void cloud.reconnect(entry.id).catch(() => {}); }}>Check status</button>}
      </div>)}
    {cloud.activeCursor && <button type="button" className="text-sm text-muted-foreground underline"
      onClick={() => { void cloud.loadMore(cloud.activeCursor!, false).catch(() => {}); }}>Load more active requests</button>}
    {cloud.historyCursor && <button type="button" className="block text-sm text-muted-foreground underline"
      onClick={() => { void cloud.loadMore(cloud.historyCursor!, true).catch(() => {}); }}>Recover older cloud replies</button>}
  </section>;
}
