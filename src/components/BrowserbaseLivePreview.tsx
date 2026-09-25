import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, LoaderCircle, Monitor, MousePointer2, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  browserbaseSessionRequest,
  type BrowserbaseActionResponse,
  type BrowserbaseDevice,
  type BrowserbaseSessionStatus,
} from '@/services/browserbaseSessionClient';

export interface BrowserbaseHandoffEvent {
  type: 'browser_session_handoff';
  sessionHandle: string;
}

interface BrowserbaseLivePreviewProps {
  sessionHandle: string;
  device: BrowserbaseDevice;
  expiresAt: string;
  title?: string;
  onHandoff?: (event: BrowserbaseHandoffEvent) => void;
  onClosed?: (sessionHandle: string) => void;
}

function statusText(status: BrowserbaseSessionStatus, device: BrowserbaseDevice): string {
  if (device === 'mobile') return 'View only';
  if (status === 'user_control') return 'You have control';
  if (status === 'handed_back') return 'Ready for Arc';
  if (status === 'release_requested' || status === 'closed' || status === 'expired') return 'Session ended';
  return 'Arc is using the browser';
}

function resultMessage(response: BrowserbaseActionResponse): string {
  if (response.available) return '';
  if (response.reason === 'disabled') return 'Browser sessions are unavailable right now.';
  if (response.reason === 'quota_exhausted') return 'Browser session time is used up for now. Arc can continue without it.';
  if (response.reason === 'concurrency_limit') return 'All browser sessions are busy right now.';
  if (response.reason === 'invalid_target') return 'That site address cannot be opened in a browser session.';
  return 'The browser session is unavailable. Arc can continue without it.';
}

export function BrowserbaseLivePreview({
  sessionHandle,
  device,
  expiresAt,
  title = 'Browser session',
  onHandoff,
  onClosed,
}: BrowserbaseLivePreviewProps) {
  const [open, setOpen] = useState(false);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<BrowserbaseSessionStatus>('agent_running');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isViewOnly = device === 'mobile';
  const userHasControl = !isViewOnly && status === 'user_control';

  const refreshView = useCallback(async () => {
    setLiveViewUrl(null);
    const response = await browserbaseSessionRequest({ action: 'view', sessionHandle });
    if (!response.available) {
      setLiveViewUrl(null);
      setError(resultMessage(response));
      return false;
    }
    setStatus(response.status);
    setLiveViewUrl(response.liveViewUrl ?? null);
    setError(response.liveViewUrl ? '' : 'A live view is not available.');
    return !!response.liveViewUrl;
  }, [sessionHandle]);

  useEffect(() => {
    let current = true;
    void browserbaseSessionRequest({ action: 'view', sessionHandle }).then(response => {
      if (!current) return;
      if (!response.available) {
        setError(resultMessage(response));
        setLiveViewUrl(null);
        onClosed?.(sessionHandle);
        return;
      }
      setStatus(response.status);
      setLiveViewUrl(response.liveViewUrl ?? null);
      setError(response.liveViewUrl ? '' : 'A live view is not available.');
    });
    return () => { current = false; };
  }, [onClosed, sessionHandle]);

  const handleTakeover = async () => {
    if (isViewOnly || busy) return;
    setBusy(true);
    setError('');
    const response = await browserbaseSessionRequest({ action: 'takeover', sessionHandle });
    if (response.available) {
      setStatus(response.status);
      setLiveViewUrl(response.liveViewUrl ?? null);
      if (!response.liveViewUrl) setError('The live view could not be refreshed.');
    } else {
      setError(resultMessage(response));
    }
    setBusy(false);
  };

  const handleHandoff = async () => {
    if (isViewOnly || busy) return;
    setBusy(true);
    setError('');
    const response = await browserbaseSessionRequest({ action: 'handoff', sessionHandle });
    if (!response.available || !response.handoffEvent) {
      setError(response.available ? 'Arc did not receive the handoff.' : resultMessage(response));
      setBusy(false);
      return;
    }
    setStatus(response.status);
    onHandoff?.(response.handoffEvent);
    await refreshView();
    setBusy(false);
  };

  const handleCloseSession = async () => {
    if (busy) return;
    setBusy(true);
    const response = await browserbaseSessionRequest({ action: 'close', sessionHandle });
    if (response.available) {
      setStatus(response.status);
      setLiveViewUrl(null);
      setError('');
      onClosed?.(sessionHandle);
    } else {
      setError(resultMessage(response));
    }
    setBusy(false);
  };

  const toggleOpen = (next: boolean) => {
    setOpen(next);
    if (next) void refreshView();
  };

  const renderFrame = (className: string) => liveViewUrl ? (
    <iframe
      src={liveViewUrl}
      title={`${title} live view`}
      sandbox={userHasControl ? 'allow-forms allow-same-origin allow-scripts' : 'allow-same-origin allow-scripts'}
      allow="clipboard-read; clipboard-write"
      referrerPolicy="no-referrer"
      className={`${className} border-0 bg-black`}
      style={{ pointerEvents: userHasControl ? 'auto' : 'none' }}
    />
  ) : (
    <div className={`${className} flex min-h-40 items-center justify-center gap-2 bg-black/70 text-sm text-muted-foreground`}>
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {error || 'Connecting to the live browser…'}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => toggleOpen(true)}
        className="group w-full overflow-hidden rounded-2xl border border-border/50 bg-card/70 text-left shadow-sm transition hover:border-primary/40 hover:bg-card"
        aria-label={`Open ${title}`}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {isViewOnly ? <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${liveViewUrl ? 'bg-emerald-400' : 'bg-muted-foreground/60'}`} />
            {statusText(status, device)}
            <ArrowUpRight className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
          </span>
        </div>
        <div className="relative h-48 overflow-hidden border-t border-border/40 bg-black">
          {!open ? renderFrame('h-full w-full') : <div className="h-full w-full bg-black" />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/45 to-transparent" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={toggleOpen}>
        <DialogContent className="flex h-[min(88dvh,900px)] max-w-6xl flex-col gap-3 p-3 sm:p-4">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              {isViewOnly ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              {title}
            </DialogTitle>
            <DialogDescription>
              {statusText(status, device)} · closes automatically at {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/50 bg-black">
            {open ? renderFrame('h-full w-full') : null}
          </div>

          {error ? <p role="status" className="px-1 text-sm text-muted-foreground">{error}</p> : null}

          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between sm:space-x-0">
            <p className="mr-auto text-xs text-muted-foreground">
              {isViewOnly ? 'Mobile preview is view only.' : userHasControl ? 'Your input is going to this browser.' : 'Arc is controlling this browser.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {!isViewOnly && !userHasControl ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleTakeover()}>
                  <MousePointer2 className="mr-1.5 h-4 w-4" /> Take over
                </Button>
              ) : null}
              {!isViewOnly && userHasControl ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleHandoff()}>
                  {busy ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Hand off to Arc
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void handleCloseSession()}>
                <X className="mr-1.5 h-4 w-4" /> End session
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BrowserbaseLivePreview;
