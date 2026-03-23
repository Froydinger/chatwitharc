import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, AlertCircle, ExternalLink, Globe, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VirtualFileSystem } from '@/types/ide';
import { bundleProject, generatePreviewHtml, initializeEsbuild } from '@/lib/esbuild';

interface IDEPreviewPanelProps {
  files: VirtualFileSystem;
  onError?: (error: string) => void;
}

type ViewMode = 'desktop' | 'phone';

export function IDEPreviewPanel({ files, onError }: IDEPreviewPanelProps) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initStatus, setInitStatus] = useState('Initializing build engine…');
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const buildTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const buildAbortRef = useRef<AbortController>();

  useEffect(() => {
    const t1 = setTimeout(() => setInitStatus('Downloading build engine (~8 MB)…'), 2000);
    const t2 = setTimeout(() => setInitStatus('Compiling WASM — almost there…'), 6000);

    initializeEsbuild()
      .then(() => { clearTimeout(t1); clearTimeout(t2); setIsInitializing(false); })
      .catch((err) => { clearTimeout(t1); clearTimeout(t2); setIsInitializing(false); setError(`Build engine failed: ${err.message}`); });

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (!onError) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'preview-error' && e.data.error) {
        onError(e.data.error);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onError]);

  const runBuild = useCallback(async () => {
    if (isInitializing) return;
    if (buildAbortRef.current) buildAbortRef.current.abort();
    const controller = new AbortController();
    buildAbortRef.current = controller;

    setIsBuilding(true);
    setError(null);
    try {
      const bundledCode = await bundleProject(files);
      if (controller.signal.aborted) return;
      setHtml(generatePreviewHtml(bundledCode));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Build failed');
    } finally {
      if (!controller.signal.aborted) setIsBuilding(false);
    }
  }, [files, isInitializing]);

  useEffect(() => {
    if (isInitializing) return;
    if (buildTimerRef.current) clearTimeout(buildTimerRef.current);
    buildTimerRef.current = setTimeout(runBuild, 600);
    return () => { if (buildTimerRef.current) clearTimeout(buildTimerRef.current); };
  }, [files, isInitializing, runBuild]);

  const openInNewTab = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-1.5 border-b border-border/30 flex items-center gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={runBuild} disabled={isBuilding || isInitializing}
          className="h-7 w-7 p-0 shrink-0" title="Refresh">
          <RefreshCw className={`h-3 w-3 ${isBuilding ? 'animate-spin' : ''}`} />
        </Button>
        <div className="flex-1 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-secondary/40 border border-border/30 text-xs text-muted-foreground">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono text-[11px]">Preview</span>
        </div>
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-secondary/40 border border-border/30 rounded-md p-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('desktop')}
            className={cn('h-6 w-6 p-0', viewMode === 'desktop' && 'bg-background shadow-sm text-foreground')}
            title="Desktop view"
          >
            <Monitor className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('phone')}
            className={cn('h-6 w-6 p-0', viewMode === 'phone' && 'bg-background shadow-sm text-foreground')}
            title="Phone view"
          >
            <Smartphone className="h-3 w-3" />
          </Button>
        </div>
        {html && (
          <Button size="sm" variant="ghost" onClick={openInNewTab} className="h-7 w-7 p-0 shrink-0" title="Open in new tab">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        {isInitializing ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs px-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">{initStatus}</p>
              <p className="text-[10px] text-muted-foreground/60">Cached for next time</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <h3 className="font-semibold text-sm text-destructive">Build Error</h3>
              <pre className="text-xs text-left bg-secondary/40 p-3 rounded-lg overflow-auto max-h-40 font-mono text-muted-foreground">{error}</pre>
              <Button variant="outline" size="sm" onClick={runBuild} className="text-xs">Retry</Button>
            </div>
          </div>
        ) : isBuilding && !html ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Building…</p>
            </div>
          </div>
        ) : html ? (
          viewMode === 'phone' ? (
            <div className="h-full flex items-center justify-center bg-secondary/20 py-4">
              <div className="relative flex flex-col items-center" style={{ height: '100%', maxHeight: '780px' }}>
                {/* Phone shell */}
                <div className="relative bg-zinc-900 rounded-[2.5rem] p-[10px] shadow-2xl ring-1 ring-white/10 flex flex-col"
                  style={{ width: '375px', height: '100%', maxHeight: '780px' }}>
                  {/* Top notch bar */}
                  <div className="flex items-center justify-center mb-1 shrink-0">
                    <div className="w-24 h-5 bg-zinc-800 rounded-full flex items-center justify-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                      <div className="w-3 h-3 rounded-full bg-zinc-700" />
                    </div>
                  </div>
                  {/* Screen */}
                  <div className="flex-1 rounded-[1.75rem] overflow-hidden bg-white">
                    <iframe
                      srcDoc={html}
                      className="w-full h-full bg-white"
                      title="Preview"
                      sandbox="allow-scripts allow-modals allow-same-origin"
                    />
                  </div>
                  {/* Home indicator */}
                  <div className="flex justify-center mt-1.5 shrink-0">
                    <div className="w-24 h-1 bg-zinc-600 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <iframe srcDoc={html} className="w-full h-full bg-white" title="Preview"
              sandbox="allow-scripts allow-modals allow-same-origin" />
          )
        ) : null}
      </div>
    </div>
  );
}
