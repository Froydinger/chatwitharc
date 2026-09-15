import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, RefreshCw, X, Minus, Maximize2, Minimize2, 
  Monitor, Smartphone, Globe, AlertCircle, ArrowUpRight, Play,
  GripVertical, ZoomIn, ChevronDown
} from 'lucide-react';
import { useSandboxStore } from '@/store/useSandboxStore';
import { SandboxClosedPortState } from '@/components/SandboxClosedPortState';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

export function FloatingSandboxPreview() {
  const isMobile = useIsMobile();
  const [mobilePipZoomed, setMobilePipZoomed] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [pipWidth, setPipWidth] = useState(220);
  const [pipHeight, setPipHeight] = useState(270);
  const pipObserverRef = useRef<ResizeObserver | null>(null);

  // Callback ref: re-measures whenever the PIP viewport node mounts or is swapped
  // (open/close, minimize, offline state), which a deps-array effect would miss.
  const pipContainerRef = useCallback((node: HTMLDivElement | null) => {
    pipObserverRef.current?.disconnect();
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setPipWidth(width);
        setPipHeight(height);
      }
    });
    ro.observe(node);
    pipObserverRef.current = ro;
  }, []);
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
  const [isPortClosed, setIsPortClosed] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const isDraggingRef = useRef(false);

  useEffect(() => () => pipObserverRef.current?.disconnect(), []);

  const cycleZoom = () => {
    setZoomScale((prev) => {
      if (prev === 1) return 0.8;
      if (prev === 0.8) return 0.65;
      if (prev === 0.65) return 0.5;
      return 1;
    });
  };

  const checkHealth = useCallback(async () => {
    if (!previewUrl) return;
    try {
      const res = await fetch(previewUrl, { signal: AbortSignal.timeout(4000) });
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
  }, [previewUrl]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setIsPortClosed(false);
    checkHealth();
  }, [previewUrl, iframeKey, checkHealth]);

  // Background auto-polling when port is offline to auto-connect once Arc starts it
  useEffect(() => {
    if (!isPortClosed || !previewUrl) return;
    const interval = setInterval(() => {
      checkHealth();
    }, 3500);
    return () => clearInterval(interval);
  }, [isPortClosed, previewUrl, checkHealth]);

  if (!isOpen || !previewUrl) return null;

  // Minimized Pill floating above the UI — freely draggable anywhere on screen
  if (isMinimized) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.15}
        onDragStart={() => {
          isDraggingRef.current = true;
        }}
        onDragEnd={() => {
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 120);
        }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        whileDrag={{ scale: 1.05, opacity: 0.95, cursor: "grabbing" }}
        className="fixed bottom-48 right-3 sm:bottom-28 sm:right-6 z-[80] flex items-center gap-2 rounded-full border border-primary/35 bg-background/95 backdrop-blur-xl shadow-2xl px-3 py-2 text-xs text-foreground cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors group select-none touch-none"
        onClick={() => {
          if (!isDraggingRef.current) {
            toggleMinimize();
          }
        }}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 -mr-0.5 cursor-grab active:cursor-grabbing" />
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

  // Shared styling for the mobile PIP control bar: icon over micro-label so five
  // buttons stay on one line with a ~44px touch target even at 1/4 size.
  const pipBtn = "flex-1 min-w-0 h-12 rounded-xl bg-muted/80 hover:bg-muted active:scale-95 border border-border/60 flex flex-col items-center justify-center gap-0.5 text-foreground transition-all cursor-pointer";
  const pipBtnLabel = "text-[9px] font-medium leading-none tracking-tight";

  // Mobile Picture-in-Picture (PIP) Window — 1/4 size of screen in the corner and draggable
  if (isMobile) {
    const virtualWidth = deviceMode === 'desktop' ? 1024 : 375;
    const scale = pipWidth > 0 ? pipWidth / virtualWidth : (deviceMode === 'desktop' ? 0.21 : 0.58);
    const virtualHeight = scale > 0 && pipHeight > 0 ? Math.round(pipHeight / scale) : 550;

    return (
      <AnimatePresence>
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.12}
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "fixed z-[85] flex flex-col rounded-2xl border border-primary/35 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden transition-all duration-200 select-none",
            mobilePipZoomed
              ? "top-16 right-3 w-[290px] h-[420px]"
              : "top-20 right-3 w-[220px] h-[320px]"
          )}
        >
          {/* Mobile PIP Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/80 border-b border-border/50 cursor-grab active:cursor-grabbing touch-none select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 -ml-0.5" />
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", isPortClosed ? "bg-amber-400" : "bg-emerald-400")}></span>
                <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", isPortClosed ? "bg-amber-500" : "bg-emerald-500")}></span>
              </span>
              <span className="font-semibold text-[11px] text-foreground tracking-tight truncate">Live Preview</span>
              {port && (
                <span className="text-[10px] font-mono text-primary font-medium">
                  :{port}
                </span>
              )}
            </div>

            {/* Caret Button to Expand/Collapse the Big Button Row */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMobileControls((prev) => !prev);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                showMobileControls
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
              )}
              title={showMobileControls ? "Hide controls" : "Expand controls"}
            >
              <span className="text-[10px] font-mono">{deviceMode === 'desktop' ? '💻 Desktop' : '📱 Mobile'}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", showMobileControls && "rotate-180")} />
            </button>
          </div>

          {/* Expandable control bar — one line, 5 equal big touch targets */}
          <AnimatePresence initial={false}>
            {showMobileControls && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden bg-background/95 border-b border-border/60 shadow-inner"
              >
                <div className="flex items-stretch gap-1 px-1.5 py-1.5">
                  {/* Desktop / Mobile preview toggle — iframe rescales to fit either way */}
                  <button
                    type="button"
                    onClick={() => setDeviceMode(deviceMode === 'mobile' ? 'desktop' : 'mobile')}
                    className={pipBtn}
                    title={`Switch to ${deviceMode === 'mobile' ? 'desktop' : 'mobile'} view`}
                  >
                    {deviceMode === 'mobile'
                      ? <Smartphone className="h-4 w-4 text-primary" />
                      : <Monitor className="h-4 w-4 text-primary" />}
                    <span className={pipBtnLabel}>{deviceMode === 'mobile' ? 'Mobile' : 'Desktop'}</span>
                  </button>

                  {/* Size toggle */}
                  <button
                    type="button"
                    onClick={() => setMobilePipZoomed(!mobilePipZoomed)}
                    className={pipBtn}
                    title={mobilePipZoomed ? "Shrink to 1/4 size" : "Zoom preview"}
                  >
                    {mobilePipZoomed
                      ? <Minimize2 className="h-4 w-4" />
                      : <Maximize2 className="h-4 w-4" />}
                    <span className={pipBtnLabel}>{mobilePipZoomed ? 'Shrink' : 'Zoom'}</span>
                  </button>

                  {/* Open in a real browser tab */}
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={pipBtn}
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className={pipBtnLabel}>Open</span>
                  </a>

                  {/* Minimize to floating pill */}
                  <button
                    type="button"
                    onClick={() => toggleMinimize()}
                    className={pipBtn}
                    title="Minimize to floating pill"
                  >
                    <Minus className="h-4 w-4" />
                    <span className={pipBtnLabel}>Hide</span>
                  </button>

                  {/* Close */}
                  <button
                    type="button"
                    onClick={() => closePreview()}
                    className={cn(pipBtn, "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25 text-rose-500")}
                    title="Close preview"
                  >
                    <X className="h-4 w-4" />
                    <span className={pipBtnLabel}>Close</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Iframe or Offline State container */}
          <div
            ref={pipContainerRef}
            className="relative flex-1 w-full bg-white dark:bg-zinc-950 overflow-hidden flex items-center justify-center"
          >
            {isPortClosed ? (
              <SandboxClosedPortState
                url={previewUrl}
                port={port}
                onRetry={() => {
                  setIsLoading(true);
                  checkHealth();
                }}
                isCompact={true}
                className="w-full h-full p-2"
              />
            ) : (
              <>
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm z-10 text-[10px] text-muted-foreground gap-1 pointer-events-none">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Connecting...</span>
                  </div>
                )}

                <div
                  className="w-full h-full overflow-hidden"
                  style={{
                    width: `${pipWidth}px`,
                    height: `${pipHeight}px`,
                  }}
                >
                  <iframe
                    key={iframeKey}
                    src={previewUrl}
                    title="Live App PIP"
                    onLoad={() => {
                      setIsLoading(false);
                      checkHealth();
                    }}
                    onError={() => {
                      setIsLoading(false);
                      setHasError(true);
                    }}
                    style={{
                      width: `${virtualWidth}px`,
                      height: `${virtualHeight}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                    className="border-0 pointer-events-auto block"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Full Desktop Floating Preview Window
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
            : "bottom-24 right-4 md:right-8 w-[580px] md:w-[680px] lg:w-[740px] h-[580px] max-h-[82vh]"
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
                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", isPortClosed ? "bg-amber-400" : "bg-emerald-400")}></span>
                <span className={cn("relative inline-flex rounded-full h-2 w-2", isPortClosed ? "bg-amber-500" : "bg-emerald-500")}></span>
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

            {/* Zoom / Scale Preset Button */}
            <button
              type="button"
              onClick={cycleZoom}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 rounded-lg border text-[10px] font-mono transition-colors",
                zoomScale !== 1
                  ? "bg-primary/15 border-primary/35 text-primary font-semibold"
                  : "bg-background/60 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              title={`Content scale: ${Math.round(zoomScale * 100)}% (tap to cycle 100% -> 80% -> 65% -> 50%)`}
            >
              <ZoomIn className="h-3 w-3" />
              <span>{Math.round(zoomScale * 100)}%</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                checkHealth();
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

        {/* Iframe or Offline State container */}
        <div className="relative flex-1 w-full bg-white dark:bg-zinc-950 overflow-auto flex items-start justify-center">
          {isPortClosed ? (
            <SandboxClosedPortState
              url={previewUrl}
              port={port}
              onRetry={() => {
                setIsLoading(true);
                checkHealth();
              }}
              className="w-full h-full"
            />
          ) : (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm z-10 text-xs text-muted-foreground gap-2.5 pointer-events-none">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span>Connecting to cloud preview...</span>
                </div>
              )}

              <div
                className={cn(
                  "w-full h-full overflow-auto flex items-start justify-center",
                  zoomScale !== 1 && "origin-top-left"
                )}
                style={
                  zoomScale !== 1
                    ? {
                        transform: `scale(${zoomScale})`,
                        transformOrigin: "top left",
                        width: `${(100 / zoomScale).toFixed(1)}%`,
                        height: `${(100 / zoomScale).toFixed(1)}%`,
                      }
                    : undefined
                }
              >
                <iframe
                  key={iframeKey}
                  src={previewUrl}
                  title="App Preview"
                  onLoad={() => {
                    setIsLoading(false);
                    checkHealth();
                  }}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                  className={cn(
                    "border-0 transition-all duration-200",
                    deviceMode === "mobile" && zoomScale === 1
                      ? "w-[375px] h-full shadow-2xl rounded-lg"
                      : "w-full h-full"
                  )}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
