import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, RefreshCw, X, Minus, Maximize2, Minimize2, 
  Monitor, Smartphone, Globe, AlertCircle, ArrowUpRight, Play
} from 'lucide-react';
import { useSandboxStore } from '@/store/useSandboxStore';
import { cn } from '@/lib/utils';

export function FloatingSandboxPreview() {
  const {
    isOpen,
    isMinimized,
    isExpanded,
    previewUrl,
    repo,
    port,
    deviceMode,
    closePreview,
    toggleMinimize,
    toggleExpanded,
    setDeviceMode,
  } = useSandboxStore();

  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [previewUrl, iframeKey]);

  if (!isOpen || !previewUrl) return null;

  // Minimized Pill floating above the UI
  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-28 right-6 z-[80] flex items-center gap-2.5 rounded-full border border-primary/30 bg-background/90 backdrop-blur-xl shadow-2xl px-3.5 py-2 text-xs text-foreground cursor-pointer hover:border-primary/50 transition-all group"
        onClick={toggleMinimize}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold text-foreground tracking-tight">Live App</span>
        {port && (
          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[10px]">
            :{port}
          </span>
        )}
        <div className="flex items-center gap-1 pl-1 border-l border-border/40 text-muted-foreground">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMinimize();
            }}
            title="Expand window"
            className="p-1 hover:text-foreground rounded-full hover:bg-muted/40 transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open in new tab"
            className="p-1 hover:text-foreground rounded-full hover:bg-muted/40 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closePreview();
            }}
            title="Close preview"
            className="p-1 hover:text-destructive rounded-full hover:bg-muted/40 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Full Floating Preview Window
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "fixed z-[85] flex flex-col rounded-2xl border border-border/70 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden transition-all duration-200",
          isExpanded
            ? "inset-4 md:inset-8"
            : deviceMode === "mobile"
            ? "bottom-24 right-4 md:right-8 w-[380px] h-[640px] max-h-[82vh]"
            : "bottom-24 right-4 md:right-8 w-[94vw] sm:w-[560px] md:w-[680px] lg:w-[740px] h-[580px] max-h-[82vh]"
        )}
      >
        {/* Floating Window Titlebar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b border-border/60 select-none">
          {/* Traffic light window buttons */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={closePreview}
                className="h-3 w-3 rounded-full bg-rose-500/80 hover:bg-rose-600 transition-colors"
                title="Close"
              />
              <button
                type="button"
                onClick={toggleMinimize}
                className="h-3 w-3 rounded-full bg-amber-500/80 hover:bg-amber-600 transition-colors"
                title="Minimize"
              />
              <button
                type="button"
                onClick={toggleExpanded}
                className="h-3 w-3 rounded-full bg-emerald-500/80 hover:bg-emerald-600 transition-colors"
                title={isExpanded ? "Restore" : "Maximize"}
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Preview</span>
              {port && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] font-medium">
                  :{port}
                </span>
              )}
            </div>
          </div>

          {/* Center Address Pill */}
          <div className="hidden sm:flex items-center max-w-[280px] md:max-w-[340px] rounded-full bg-background/80 border border-border/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground truncate">
            <Globe className="h-3 w-3 shrink-0 mr-1.5 text-primary" />
            <span className="truncate">{previewUrl}</span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1">
            {/* Device Switcher */}
            <div className="flex items-center rounded-lg bg-background/60 border border-border/50 p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={cn(
                  "p-1 rounded text-xs transition-colors",
                  deviceMode === 'desktop' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Desktop View"
              >
                <Monitor className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={cn(
                  "p-1 rounded text-xs transition-colors",
                  deviceMode === 'mobile' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Mobile View"
              >
                <Smartphone className="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setIframeKey((k) => k + 1);
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
            </button>

            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <button
              type="button"
              onClick={toggleExpanded}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={isExpanded ? "Restore size" : "Maximize"}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={closePreview}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Iframe container */}
        <div className="relative flex-1 w-full bg-white dark:bg-zinc-950 overflow-hidden flex items-center justify-center">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm z-10 text-xs text-muted-foreground gap-2.5">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Connecting to cloud preview...</span>
            </div>
          )}

          <iframe
            key={iframeKey}
            src={previewUrl}
            title="App Preview"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            className={cn(
              "border-0 transition-all duration-200",
              deviceMode === "mobile" ? "w-[375px] h-full shadow-2xl rounded-lg" : "w-full h-full"
            )}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
