import { useEffect, useId, useRef, useState } from 'react';
import type { CloudRun, CloudRunApproval, CloudRunCheckpoint, CloudRunMode } from '@/services/cloudRuns';

type Action = 'approve' | 'deny' | 'cancel' | 'reconnect';
type Callback = () => void | Promise<unknown>;
export interface CloudRunStatusProps {
  /** Text-chat observer data only. This card never reads or saves chat messages. */
  run: CloudRun<unknown, CloudRunCheckpoint>;
  /** Ask is the ordinary Chat path; auto is the durable Work path. */
  mode?: CloudRunMode;
  connection?: 'idle' | 'observing' | 'detached' | 'uncertain';
  observationError?: string;
  onApprove: (response: CloudRunApproval) => void | Promise<unknown>;
  onDeny: (response: CloudRunApproval) => void | Promise<unknown>;
  onCancel: Callback;
  /** Resolve only after refreshing this run; reject if refresh fails. */
  onReconnect: Callback;
  /** The parent decides when a newly completed Work result may open once. */
  autoOpenSummary?: boolean;
}

type ActionState = { pending: Action | null; error: string | null; reconnectRequired: boolean; submitted: boolean };

/** Synchronous guard also covers two clicks before React renders disabled buttons. */
// Exported for dependency-free callback regression tests alongside this component.
// eslint-disable-next-line react-refresh/only-export-components
export function createCloudRunActionGuard(update: (state: ActionState) => void) {
  let state: ActionState = { pending: null, error: null, reconnectRequired: false, submitted: false };
  return {
    async invoke(action: Action, callback: Callback) {
      if (state.pending || (action !== 'reconnect' && (state.reconnectRequired || state.submitted))) return;
      state = { ...state, pending: action, error: null };
      update({ ...state });
      try {
        await callback();
        state = { pending: null, error: null, reconnectRequired: false, submitted: action !== 'reconnect' };
      } catch (error) {
        const status = error && typeof error === 'object'
          ? ('httpStatus' in error ? error.httpStatus : 'status' in error ? error.status : undefined)
          : undefined;
        state = {
          pending: null,
          error: status === 409
            ? 'This request changed. Reconnect to review the current action before deciding.'
            : error instanceof Error ? error.message : 'The action could not be confirmed. Reconnect to check its status.',
          // A failed mutation may already have been accepted. Never repeat it
          // against stale props without an explicit refresh, even on a timeout.
          reconnectRequired: true,
          submitted: false,
        };
      }
      update({ ...state });
    },
  };
}

function readableName(name?: string) {
  return name?.replace(/[_-]+/g, ' ').replace(/\b\w/, char => char.toUpperCase()) || 'Requested action';
}
function readableArguments(args?: string) {
  if (!args) return 'No arguments provided.';
  try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
}
function activityOutcome(outcome: 'completed' | 'blocked' | 'denied') {
  return outcome === 'completed' ? 'Completed' : outcome === 'blocked' ? 'Blocked' : 'Declined';
}
function auditOutcome(outcome: 'working' | 'completed' | 'blocked' | 'denied') {
  return outcome === 'working' ? 'Working' : activityOutcome(outcome);
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s elapsed`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s elapsed`;
}

type SummaryLink = { url: string; title: string; snippet?: string };
type SummaryAsset = { kind: 'image' | 'file' | 'canvas' | 'code'; label: string; url?: string; detail?: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim()) : [];
}

function workSummary(run: CloudRun<unknown, CloudRunCheckpoint>) {
  const result = record(run.result);
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const firstMessage = record(record(choices[0]).message);
  const response = [firstMessage.content, result.content, run.checkpoint?.aiSummary]
    .find((value): value is string => typeof value === 'string' && value.trim()) ?? '';
  const sourceValue = result.web_sources ?? result.webSources;
  const links: SummaryLink[] = Array.isArray(sourceValue)
    ? sourceValue.flatMap(value => {
      const item = record(value);
      return typeof item.url === 'string' && item.url.trim()
        ? [{ url: item.url, title: typeof item.title === 'string' && item.title.trim() ? item.title : item.url,
            ...(typeof item.snippet === 'string' && item.snippet.trim() ? { snippet: item.snippet } : {}) }]
        : [];
    }).slice(0, 24)
    : [];
  const assets: SummaryAsset[] = [];
  const image = record(result.generated_image);
  const imageUrls = [...strings(image.imageUrls), ...(typeof image.imageUrl === 'string' ? [image.imageUrl] : [])]
    .filter((url, index, all) => all.indexOf(url) === index).slice(0, 8);
  imageUrls.forEach((url, index) => assets.push({ kind: 'image', label: imageUrls.length > 1 ? `Generated image ${index + 1}` : 'Generated image', url }));
  const files = [result.generated_file, ...(Array.isArray(result.generated_files) ? result.generated_files : [])]
    .flatMap(value => {
      const item = record(value);
      return typeof item.fileUrl === 'string' && item.fileUrl.trim()
        ? [{ kind: 'file' as const, label: typeof item.fileName === 'string' && item.fileName.trim() ? item.fileName : 'Generated file', url: item.fileUrl }]
        : [];
    });
  files.forEach(file => { if (!assets.some(asset => asset.url === file.url)) assets.push(file); });
  const canvas = record(result.canvas_update);
  if (Object.keys(canvas).length) assets.push({ kind: 'canvas', label: typeof canvas.label === 'string' && canvas.label.trim() ? canvas.label : 'Canvas update', detail: 'Canvas content created or updated' });
  const code = record(result.code_update);
  if (Object.keys(code).length) assets.push({ kind: 'code', label: typeof code.label === 'string' && code.label.trim() ? code.label : 'Code block', detail: typeof code.language === 'string' ? code.language : 'Code content created' });
  strings(result.search_images).slice(0, 8).forEach((url, index) => assets.push({ kind: 'image', label: `Search image ${index + 1}`, url }));
  return { response, links, assets };
}

/**
 * Plain Work replies already render through the normal chat transcript. Keep
 * the extra completion tile/modal for actual multi-step work or created
 * material, where the audit and asset list add information the chat bubble
 * does not contain.
 */
export function hasWorkCompletionSummary(run: CloudRun<unknown, CloudRunCheckpoint>) {
  if (run.status !== 'completed') return false;
  const summary = workSummary(run);
  const audit = run.checkpoint?.audit ?? (run.checkpoint?.activity ?? []).map(item => ({
    kind: 'tool' as const, label: item.tool, status: item.outcome,
  }));
  return summary.links.length > 0 || summary.assets.length > 0 || audit.length > 1;
}

function assetIcon(kind: SummaryAsset['kind']) {
  return kind === 'image' ? 'Image' : kind === 'file' ? 'File' : kind === 'canvas' ? 'Canvas' : 'Code';
}

function WorkCompletionSummary({ run, onClose }: { run: CloudRun<unknown, CloudRunCheckpoint>; onClose: () => void }) {
  const summary = workSummary(run);
  const audit = run.checkpoint?.audit ?? (run.checkpoint?.activity ?? []).map(item => ({
    kind: 'tool' as const, label: item.tool, status: item.outcome,
  }));
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/55 p-4 backdrop-blur-sm" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="work-complete-title"
      className="glass-card max-h-[min(86dvh,48rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/70 bg-background/95 p-5 text-foreground shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arc Work</p>
          <h2 id="work-complete-title" className="mt-1 text-xl font-semibold">Work complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">Here’s the finished result and everything Arc created.</p>
        </div>
        <button type="button" aria-label="Close work summary" onClick={onClose}
          className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Done</button>
      </div>
      <section className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">Chat response</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{summary.response || 'Arc completed the requested work.'}</p>
      </section>
      {!!summary.links.length && <section className="mt-4">
        <h3 className="text-sm font-semibold">Links &amp; references</h3>
        <ul className="mt-2 space-y-2">
          {summary.links.map((link, index) => <li key={`${link.url}-${index}`} className="min-w-0 rounded-xl border border-border/50 bg-muted/15 px-3 py-2">
            <a href={link.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-primary underline-offset-4 hover:underline">{link.title}</a>
            {link.snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{link.snippet}</p>}
          </li>)}
        </ul>
      </section>}
      {!!summary.assets.length && <section className="mt-4">
        <h3 className="text-sm font-semibold">Created</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {summary.assets.map((asset, index) => <div key={`${asset.kind}-${asset.url ?? asset.label}-${index}`} className="min-w-0 rounded-xl border border-border/50 bg-muted/15 p-3">
            {asset.kind === 'image' && asset.url && <a href={asset.url} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-lg border border-border/50 bg-muted/30">
              <img src={asset.url} alt={asset.label} className="h-28 w-full object-cover" loading="lazy" />
            </a>}
            {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-primary underline-offset-4 hover:underline">{assetIcon(asset.kind)} · {asset.label}</a>
              : <p className="text-sm font-medium">{assetIcon(asset.kind)} · {asset.label}</p>}
            {asset.detail && <p className="mt-1 text-xs text-muted-foreground">{asset.detail}</p>}
          </div>)}
        </div>
      </section>}
      {!!audit.length && <details className="mt-5 rounded-2xl border border-border/60 bg-muted/15 p-4">
        <summary className="cursor-pointer text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Audit trail <span className="ml-1 font-normal text-muted-foreground">{audit.length} step{audit.length === 1 ? '' : 's'}</span></summary>
        <ol className="mt-3 space-y-2 text-sm">
          {audit.map((item, index) => <li key={`${item.kind}-${item.label}-${index}`} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{item.kind === 'tool' ? readableName(item.label) : item.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{auditOutcome(item.status)}</span>
          </li>)}
        </ol>
        {run.checkpoint?.reasoningSummary && <p className="mt-3 whitespace-pre-wrap break-words border-t border-border/50 pt-3 text-xs text-muted-foreground">{run.checkpoint.reasoningSummary}</p>}
      </details>}
    </div>
  </div>;
}

/** Standalone inline text-chat card. No timers, transport, modal, or voice integration. */
export function CloudRunStatus(props: CloudRunStatusProps) {
  const approval = props.run.checkpoint?.pendingApproval;
  // Reset action state on a different run/pause. Late callbacks from a previous
  // keyed card cannot unlock or show errors on the new approval.
  const key = JSON.stringify([props.run.id, props.run.status, approval?.callId, approval?.argumentsHash]);
  return <CloudRunStatusCard key={key} {...props} />;
}

function CloudRunStatusCard({ run, mode = 'auto', connection = 'idle', observationError, onApprove, onDeny, onCancel, onReconnect, autoOpenSummary = true }: CloudRunStatusProps) {
  const titleId = useId();
  const argsId = useId();
  const [state, setState] = useState<ActionState>({ pending: null, error: null, reconnectRequired: false, submitted: false });
  const [summaryOpen, setSummaryOpen] = useState(autoOpenSummary && run.status === 'completed' && mode === 'auto');
  const [clock, setClock] = useState(() => Date.now());
  const guardRef = useRef<ReturnType<typeof createCloudRunActionGuard> | null>(null);
  if (!guardRef.current) guardRef.current = createCloudRunActionGuard(setState);
  const invoke = (action: Action, callback: Callback) => void guardRef.current!.invoke(action, callback);
  const terminal = ['completed', 'failed', 'cancelled'].includes(run.status);
  const elapsedStart = run.startedAt ?? run.createdAt;
  const elapsedEnd = terminal ? (run.updatedAt ?? run.startedAt ?? run.createdAt) : undefined;
  const elapsedStartMs = elapsedStart ? Date.parse(elapsedStart) : NaN;
  const elapsedEndMs = elapsedEnd ? Date.parse(elapsedEnd) : NaN;
  useEffect(() => {
    if (terminal || !Number.isFinite(elapsedStartMs)) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [terminal, elapsedStartMs]);
  useEffect(() => {
    if (autoOpenSummary && run.status === 'completed' && mode === 'auto') setSummaryOpen(true);
  }, [autoOpenSummary, mode, run.status]);
  const elapsedMs = Number.isFinite(elapsedStartMs)
    ? Math.max(0, (Number.isFinite(elapsedEndMs) ? elapsedEndMs : clock) - elapsedStartMs)
    : null;
  const detached = connection === 'detached' || connection === 'uncertain';
  const approval = run.status === 'awaiting_input' ? run.checkpoint?.pendingApproval : null;
  const canDecide = !!approval?.callId && !!approval?.argumentsHash;
  const mutationDisabled = !!state.pending || state.submitted || state.reconnectRequired || detached;
  const progress = run.checkpoint?.progress;
  const hasWorkerProgress = run.status === 'queued' && progress?.phase !== null && progress?.phase !== undefined;
  const title = {
    queued: hasWorkerProgress ? 'Working on the next step' : 'Queued', running: 'Working on your reply', awaiting_input: canDecide ? 'Your approval is needed' : 'Run needs attention',
    completed: mode === 'auto' ? 'Work complete' : 'Cloud reply complete', failed: 'Run failed', cancelled: 'Run cancelled',
  }[run.status];
  const description = terminal ? null : detached
    ? 'Updates are disconnected. Server work may still be running. Reconnect to check its status.'
    : run.status === 'awaiting_input'
      ? canDecide ? 'Review this exact action before approving or denying it.' : 'This run is paused. Check its status before trying again; an earlier action may already have happened.'
      : hasWorkerProgress
        ? 'The cloud worker is processing this step. You can leave this chat and come back later.'
        : 'You can leave this chat. The submitted run continues in the cloud.';
  const error = state.error || observationError || (run.status === 'failed' || (run.status === 'awaiting_input' && !canDecide)
    ? typeof run.error === 'string' ? run.error : run.status === 'failed' ? 'The run could not finish.' : 'Recovery is required before this run can continue.' : null);
  const audit = run.checkpoint?.audit ?? [];
  const displayAudit = audit.length ? audit : (run.checkpoint?.activity ?? []).map(item => ({
    kind: 'tool' as const, label: item.tool, status: item.outcome,
  }));
  const hasAudit = displayAudit.length > 1 || !!run.checkpoint?.reasoningSummary ||
    (!!run.checkpoint?.activity?.length && run.status === 'completed' && displayAudit.length > 1);
  const button = 'min-h-11 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';
  const decide = (decision: 'approve' | 'deny') => {
    if (!canDecide || mutationDisabled || !approval) return;
    const response: CloudRunApproval = { decision, callId: approval.callId, argumentsHash: approval.argumentsHash };
    invoke(decision, () => decision === 'approve' ? onApprove(response) : onDeny(response));
  };

  // Arc Chat uses the direct response path. Historical ask-mode cloud runs may
  // still be observed, but their completed result is already rendered by the
  // normal message/search UI and must not create a second Work card.
  if (mode === 'ask' && run.status === 'completed') return null;
  if (mode === 'ask' && (run.status === 'queued' || run.status === 'running')) return (
    <section aria-live="polite" aria-busy="true"
      className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-foreground shadow-sm">
      <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/70" />
      <div className="min-w-0">
        <p className="text-sm font-medium">Thinking…</p>
        {elapsedMs !== null && <p className="text-xs text-muted-foreground">{formatElapsed(elapsedMs)}</p>}
      </div>
    </section>
  );
  if (mode === 'auto' && run.status === 'completed') return <>
    {!hasWorkCompletionSummary(run) ? null : <>
    <section className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 text-foreground shadow-sm">
      <div><p className="text-sm font-semibold">Work complete</p><p className="text-xs text-muted-foreground">Your response, links, created assets, and audit trail are ready.</p></div>
      <button type="button" className={button} onClick={() => setSummaryOpen(true)}>View summary</button>
    </section>
    {summaryOpen && <WorkCompletionSummary run={run} onClose={() => setSummaryOpen(false)} />}
    </>}
  </>;

  return (
    <section aria-labelledby={titleId} aria-busy={!!state.pending}
      className="glass-card w-full max-w-xl rounded-2xl border border-border/60 bg-background/80 p-4 text-foreground shadow-sm">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h3 id={titleId} className="text-sm font-semibold">{title}
          {elapsedMs !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatElapsed(elapsedMs)}</span>}
        </h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {state.pending && <p className="mt-2 text-sm text-muted-foreground">{state.pending === 'reconnect' ? 'Reconnecting…' : 'Sending your choice…'}</p>}
        {state.submitted && <p className="mt-2 text-sm text-muted-foreground">Choice sent. Waiting for updated status.</p>}
      </div>
      {canDecide && approval && (
        <div className="mt-3 min-w-0 rounded-xl border border-border/60 bg-muted/40 p-3">
          <p className="break-words text-sm font-medium">{readableName(approval.name)}</p>
          <p id={argsId} className="mt-2 text-xs text-muted-foreground">Action details</p>
          {/* React text children escape markup; never interpret arguments as HTML or permission. */}
          <pre aria-labelledby={argsId} tabIndex={0}
            className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {readableArguments(approval.arguments)}
          </pre>
        </div>
      )}
      {error && <p role="alert" className="mt-3 break-words text-sm text-foreground">{error}</p>}
      {hasAudit && (
        <details className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-3">
          <summary className="cursor-pointer list-inside text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {run.status === 'completed' ? 'Audit trail' : 'Working…'}
            {displayAudit.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">
              {displayAudit.filter(item => item.kind === 'tool').length} step{displayAudit.filter(item => item.kind === 'tool').length === 1 ? '' : 's'}
            </span>}
          </summary>
          <div className="mt-3 space-y-3">
            {!!displayAudit.length && <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{run.status === 'completed' ? 'What Arc did' : 'What Arc is doing'}</p>
              <ol className="mt-2 space-y-1.5 text-sm">
                {displayAudit.map((item, index) => (
                  <li key={`${item.kind}-${item.label}-${index}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{item.kind === 'tool' ? readableName(item.label) : item.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{auditOutcome(item.status)}</span>
                  </li>
                ))}
              </ol>
            </div>}
            {run.checkpoint?.reasoningSummary && <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">High-level model summary</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{run.checkpoint.reasoningSummary}</p>
            </div>}
            {run.checkpoint?.aiSummary && <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI summary</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{run.checkpoint.aiSummary}</p>
            </div>}
          </div>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canDecide && <>
          <button type="button" className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
            disabled={mutationDisabled} onClick={() => decide('approve')}>Approve action</button>
          <button type="button" className={button} disabled={mutationDisabled} onClick={() => decide('deny')}>Deny action</button>
        </>}
        {!terminal && <button type="button" className={button}
          disabled={!!state.pending || state.submitted || state.reconnectRequired}
          onClick={() => invoke('cancel', onCancel)}>Cancel run</button>}
        {(detached || state.reconnectRequired || state.submitted || (!terminal && !!error)) && (
          <button type="button" className={button} disabled={!!state.pending}
            onClick={() => invoke('reconnect', onReconnect)}>Reconnect</button>
        )}
      </div>
    </section>
  );
}

export default CloudRunStatus;
