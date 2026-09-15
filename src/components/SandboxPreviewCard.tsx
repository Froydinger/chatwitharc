import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw, ChevronDown, ChevronUp, Monitor, ArrowUpRight } from 'lucide-react';
import { useSandboxStore } from '@/store/useSandboxStore';
import { SandboxClosedPortState } from '@/components/SandboxClosedPortState';
import { cn } from '@/lib/utils';

interface SandboxPreviewCardProps {
  url: string;
  title?: string;
}

export function SandboxPreviewCard({ url, title }: SandboxPreviewCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [key, setKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPortClosed, setIsPortClosed] = useState(false);

  // Extract port from URL if present (e.g. 5173-xxxx.e2b.app)
  const portMatch = url.match(/https?:\/\/(\d+)-/);
  const port = portMatch ? portMatch[1] : null;

  // Clean concise display title (removes awkward "Open " prefix and avoids wrapping)
  const displayTitle = title?.replace(/^Open\s+/i, '').trim() || 'Live Preview';

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status === 502 || res.status === 503) {
        setIsPortClosed(true);
        setIsLoading(false);
        return;
      }
      const data = await res.clone().json().catch(() => null);
      if (data && (data.code === 502 || (typeof data.message === 'string' && data.message.toLowerCase().includes('not open')))) {
        setIsPortClosed(true);
        setIsLoading(false);
        return;
      }
      setIsPortClosed(false);
    } catch {
      // Network or CORS blip: if already closed, keep polling, else let iframe attempt
    }
  }, [url]);

  useEffect(() => {
    setIsPortClosed(false);
    checkHealth();
  }, [checkHealth, key]);

  // Background auto-polling when port is detected offline to auto-connect once Arc starts it
  useEffect(() => {
    if (!isPortClosed) return;
    const interval = setInterval(() => {
      checkHealth();
    }, 3500);
    return () => clearInterval(interval);
  }, [isPortClosed, checkHealth]);

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-primary/20 bg-background/80 backdrop-blur-md shadow-xl transition-all">
      <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 bg-primary/5 border-b border-border/40 select-none">
        {/* Left Side: Pulse dot + Clean Title + Port Badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", isPortClosed ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-ping")}></span>
            <span className={cn("relative inline-flex rounded-full h-2 w-2", isPortClosed ? "bg-amber-500" : "bg-emerald-500")}></span>
          </span>
          <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground tracking-tight truncate whitespace-nowrap">
            {displayTitle}
          </span>
          {port && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] font-medium shrink-0">
              :{port}
            </span>
          )}
          <span className="hidden lg:inline-flex items-center text-[10px] text-muted-foreground/70 bg-muted/40 px-1.5 py-0.5 rounded font-mono shrink-0">
            20m session
          </span>
        </div>

        {/* Right Side: Actions (Float pill + Refresh + Open tab + Toggle) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              useSandboxStore.getState().openPreview(url, undefined, port ? parseInt(port, 10) : undefined);
            }}
            title="Pop out into floating window above chat"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:text-primary hover:bg-primary/15 bg-primary/10 border border-primary/20 transition-colors cursor-pointer"
          >
            <span>Float</span>
            <ArrowUpRight className="h-3 w-3 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              checkHealth();
              setKey((k) => k + 1);
            }}
            title="Refresh preview"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new browser tab"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? 'Collapse preview' : 'Expand preview'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          >
            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="relative w-full min-h-[380px] h-[460px] bg-white dark:bg-zinc-950 overflow-hidden">
          {isPortClosed ? (
            <SandboxClosedPortState
              url={url}
              port={port}
              onRetry={() => {
                setIsLoading(true);
                checkHealth();
              }}
            />
          ) : (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10 text-xs text-muted-foreground gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span>Connecting to live cloud preview...</span>
                </div>
              )}
              <iframe
                key={key}
                src={url}
                title="Sandbox Live Preview"
                onLoad={() => {
                  setIsLoading(false);
                  checkHealth();
                }}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
