import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, AlertCircle, ExternalLink, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VirtualFileSystem } from '@/types/ide';
import { bundleProject, generatePreviewHtml, initializeEsbuild } from '@/lib/esbuild';

interface IDEPreviewPanelProps {
  files: VirtualFileSystem;
}

export function IDEPreviewPanel({ files }: IDEPreviewPanelProps) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initStatus, setInitStatus] = useState('Initializing build engine…');
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
        {html && (
          <Button size="sm" variant="ghost" onClick={openInNewTab} className="h-7 w-7 p-0 shrink-0" title="Open in new tab">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex-1 relative">
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
          <iframe srcDoc={html} className="w-full h-full bg-white" title="Preview"
            sandbox="allow-scripts allow-modals allow-same-origin" />
        ) : null}
      </div>
    </div>
  );
}
