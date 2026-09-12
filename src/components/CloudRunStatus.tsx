import { useId, useRef, useState } from 'react';
import type { CloudRun, CloudRunApproval, CloudRunCheckpoint } from '@/services/cloudRuns';

type Action = 'approve' | 'deny' | 'cancel' | 'reconnect';
type Callback = () => void | Promise<unknown>;
export interface CloudRunStatusProps {
  /** Text-chat observer data only. This card never reads or saves chat messages. */
  run: CloudRun<unknown, CloudRunCheckpoint>;
  connection?: 'idle' | 'observing' | 'detached' | 'uncertain';
  observationError?: string;
  onApprove: (response: CloudRunApproval) => void | Promise<unknown>;
  onDeny: (response: CloudRunApproval) => void | Promise<unknown>;
  onCancel: Callback;
  /** Resolve only after refreshing this run; reject if refresh fails. */
  onReconnect: Callback;
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

/** Standalone inline text-chat card. No timers, transport, modal, or voice integration. */
export function CloudRunStatus(props: CloudRunStatusProps) {
  const approval = props.run.checkpoint?.pendingApproval;
  // Reset action state on a different run/pause. Late callbacks from a previous
  // keyed card cannot unlock or show errors on the new approval.
  const key = JSON.stringify([props.run.id, props.run.status, approval?.callId, approval?.argumentsHash]);
  return <CloudRunStatusCard key={key} {...props} />;
}

function CloudRunStatusCard({ run, connection = 'idle', observationError, onApprove, onDeny, onCancel, onReconnect }: CloudRunStatusProps) {
  const titleId = useId();
  const argsId = useId();
  const [state, setState] = useState<ActionState>({ pending: null, error: null, reconnectRequired: false, submitted: false });
  const guardRef = useRef<ReturnType<typeof createCloudRunActionGuard> | null>(null);
  if (!guardRef.current) guardRef.current = createCloudRunActionGuard(setState);
  const invoke = (action: Action, callback: Callback) => void guardRef.current!.invoke(action, callback);
  const terminal = ['completed', 'failed', 'cancelled'].includes(run.status);
  const detached = connection === 'detached' || connection === 'uncertain';
  const approval = run.status === 'awaiting_input' ? run.checkpoint?.pendingApproval : null;
  const canDecide = !!approval?.callId && !!approval?.argumentsHash;
  const mutationDisabled = !!state.pending || state.submitted || state.reconnectRequired || detached;
  const title = {
    queued: 'Queued', running: 'Working on your reply', awaiting_input: canDecide ? 'Your approval is needed' : 'Run needs attention',
    completed: 'Reply ready', failed: 'Run failed', cancelled: 'Run cancelled',
  }[run.status];
  const description = terminal ? null : detached
    ? 'Updates are disconnected. Server work may still be running. Reconnect to check its status.'
    : run.status === 'awaiting_input'
      ? canDecide ? 'Review this exact action before approving or denying it.' : 'This run is paused. Check its status before trying again; an earlier action may already have happened.'
      : 'You can leave this chat. The submitted run continues in the cloud.';
  const error = state.error || observationError || (run.status === 'failed' || (run.status === 'awaiting_input' && !canDecide)
    ? typeof run.error === 'string' ? run.error : run.status === 'failed' ? 'The run could not finish.' : 'Recovery is required before this run can continue.' : null);
  const button = 'min-h-11 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';
  const decide = (decision: 'approve' | 'deny') => {
    if (!canDecide || mutationDisabled || !approval) return;
    const response: CloudRunApproval = { decision, callId: approval.callId, argumentsHash: approval.argumentsHash };
    invoke(decision, () => decision === 'approve' ? onApprove(response) : onDeny(response));
  };

  return (
    <section aria-labelledby={titleId} aria-busy={!!state.pending}
      className="glass-card w-full max-w-xl rounded-2xl border border-border/60 bg-background/80 p-4 text-foreground shadow-sm">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h3 id={titleId} className="text-sm font-semibold">{title}</h3>
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
      {run.status === 'completed' && (run.checkpoint?.activity?.length || run.checkpoint?.aiSummary) && (
        <div className="mt-4 space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
          {!!run.checkpoint.activity?.length && <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What Arc did</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {run.checkpoint.activity.map((item, index) => (
                <li key={`${item.tool}-${index}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{readableName(item.tool)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{activityOutcome(item.outcome)}</span>
                </li>
              ))}
            </ul>
          </div>}
          {run.checkpoint.aiSummary && <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI summary</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{run.checkpoint.aiSummary}</p>
          </div>}
        </div>
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
