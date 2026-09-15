import { useState } from 'react';
import { ExternalLink, RefreshCw, ChevronDown, ChevronUp, Monitor } from 'lucide-react';

interface SandboxPreviewCardProps {
  url: string;
  title?: string;
}

export function SandboxPreviewCard({ url, title }: SandboxPreviewCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [key, setKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Extract port from URL if present (e.g. 5173-xxxx.e2b.app)
  const portMatch = url.match(/https?:\/\/(\d+)-/);
  const port = portMatch ? portMatch[1] : null;

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-primary/20 bg-background/80 backdrop-blur-md shadow-xl transition-all">
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <Monitor className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground tracking-tight">
            {title || 'Cloud Sandbox Live Preview'}
          </span>
          {port && (
            <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[10px] font-medium">
              :{port}
            </span>
          )}
          <span className="hidden sm:inline-block text-[11px] text-muted-foreground/80">
            • 20m persistent session
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setKey((k) => k + 1);
            }}
            title="Refresh preview"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new window"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? 'Collapse preview' : 'Expand preview'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="relative w-full h-[460px] bg-white dark:bg-zinc-950 overflow-hidden">
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
            onLoad={() => setIsLoading(false)}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      )}
    </div>
  );
}
