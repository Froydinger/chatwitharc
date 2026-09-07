import { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, Globe, Monitor, Smartphone, Tablet, Rocket, ExternalLink, Lock, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemedLogo } from '@/components/ThemedLogo';
import { motion, AnimatePresence } from 'framer-motion';
import type { VirtualFileSystem } from '@/types/ide';
import { 
  SandpackProvider, 
  SandpackPreview, 
  useSandpack 
} from '@codesandbox/sandpack-react';

interface IDEPreviewPanelProps {
  files: VirtualFileSystem;
  onError?: (error: string) => void;
  deployedUrl?: string | null;
  onPublishClick?: () => void;
}

type ViewMode = 'desktop' | 'tablet' | 'phone';

function SandpackErrorListener({ onError }: { onError?: (error: string) => void }) {
  const { sandpack } = useSandpack();
  const { error } = sandpack;
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (error && onErrorRef.current) {
      const errMsg = error.message || String(error);
      onErrorRef.current(errMsg);
    }
  }, [error]);

  return null;
}

function SandpackLoadingOverlay({ previewKey }: { previewKey: number }) {
  const { listen, sandpack } = useSandpack();
  const [isReady, setIsReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState('Booting sandbox runtime…');

  useEffect(() => {
    setIsReady(false);
    setLoadingStep('Booting sandbox runtime…');

    const timer1 = setTimeout(() => {
      setLoadingStep('Preparing dependencies & Tailwind…');
    }, 900);

    const timer2 = setTimeout(() => {
      setLoadingStep('Rendering React app…');
    }, 2000);

    const unsubscribe = listen((msg) => {
      if (msg.type === 'status' && (msg.status === 'idle' || msg.status === 'running')) {
        setIsReady(true);
      }
      if (msg.type === 'action' && msg.action === 'show-error') {
        setIsReady(true);
      }
      if (msg.type === 'success' || msg.type === 'done') {
        setIsReady(true);
      }
    });

    // Safety fallback timeout to never trap the user
    const safetyTimer = setTimeout(() => {
      setIsReady(true);
    }, 4200);

    return () => {
      unsubscribe();
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(safetyTimer);
    };
  }, [listen, previewKey, sandpack.status]);

  return (
    <AnimatePresence>
      {!isReady && (
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#090a0d]/90 backdrop-blur-2xl select-none"
        >
          {/* Subtle radial background glow */}
          <div className="absolute w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center gap-4 text-center px-6">
            {/* Pulsing Arc Logo with glowing ring */}
            <div className="relative">
              <div className="absolute -inset-2.5 rounded-2xl bg-primary/20 blur-md animate-pulse" />
              <div className="relative w-14 h-14 rounded-2xl bg-background/80 border border-white/15 shadow-xl flex items-center justify-center p-2.5">
                <ThemedLogo className="w-full h-full object-contain" />
              </div>
            </div>

            <div className="space-y-1.5 mt-1">
              <h4 className="text-sm font-semibold tracking-wide text-foreground flex items-center justify-center gap-2">
                <span>Building Live App</span>
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
              </h4>
              <p className="text-xs text-muted-foreground font-mono transition-all duration-300 min-h-[18px]">
                {loadingStep}
              </p>
            </div>

            {/* Shimmer progress line */}
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative mt-1">
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                className="w-1/2 h-full bg-gradient-to-r from-transparent via-primary to-transparent"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function IDEPreviewPanel({ 
  files, 
  onError,
  deployedUrl,
  onPublishClick
}: IDEPreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [previewKey, setPreviewKey] = useState(0);

  // Map VirtualFileSystem to Sandpack files structure
  const sandpackFiles = useMemo(() => {
    const map = Object.entries(files).reduce((acc, [path, file]) => {
      const sandpackPath = path.startsWith('/') ? path : `/${path}`;
      acc[sandpackPath] = file.content;
      return acc;
    }, {} as Record<string, string>);

    // Ensure React 18 entrypoint for Sandpack's client-side bundler
    if (!map['/index.tsx'] && !map['/index.js']) {
      map['/index.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
`;
    }

    // Ensure /App.tsx is present if /src/App.tsx exists
    if (map['/src/App.tsx'] && !map['/App.tsx']) {
      map['/App.tsx'] = map['/src/App.tsx'];
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        font-family: 'Inter', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #0b0c10;
        color: #f3f4f6;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

    map['/index.html'] = htmlContent;
    map['/public/index.html'] = htmlContent;

    return map;
  }, [files]);

  const handleRefresh = () => {
    setPreviewKey(prev => prev + 1);
  };

  return (
    <div className="h-full w-full min-h-0 max-h-full overflow-hidden flex flex-col bg-[#0b0c0e]">
      {/* Top Preview Bar */}
      <div className="px-3.5 py-2 border-b border-border/10 flex items-center gap-2.5 shrink-0 bg-[#0d0e12]/80 backdrop-blur-md">
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleRefresh}
          className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg" 
          title="Refresh Preview"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        
        {/* Custom URL Bar with askarc.chat address */}
        <div className="flex-1 flex items-center gap-2 h-7 px-3 rounded-lg bg-[#14161b] border border-white/5 text-[11px] text-muted-foreground select-none">
          <Lock className="h-3 w-3 text-emerald-400/80 shrink-0" />
          <span className="truncate font-mono text-[10.5px] text-foreground/85">
            {deployedUrl ? deployedUrl.replace(/^https?:\/\//, '') : 'app.askarc.chat'}
          </span>
        </div>
        
        {/* View mode segmented toggle (Desktop / Tablet / Phone) */}
        <div className="flex items-center gap-0.5 bg-[#14161b] border border-white/5 rounded-lg p-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('desktop')}
            className={cn('h-6 w-6 p-0 rounded-md transition-all', viewMode === 'desktop' ? 'bg-white/10 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Desktop view"
          >
            <Monitor className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('tablet')}
            className={cn('h-6 w-6 p-0 rounded-md transition-all', viewMode === 'tablet' ? 'bg-white/10 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Tablet view"
          >
            <Tablet className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('phone')}
            className={cn('h-6 w-6 p-0 rounded-md transition-all', viewMode === 'phone' ? 'bg-white/10 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Mobile phone view"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* External Link */}
        {deployedUrl && (
          <Button 
            size="sm" 
            variant="ghost" 
            asChild
            className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg" 
            title="Open Live App"
          >
            <a href={deployedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}

        {/* Publish Action Button */}
        {onPublishClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPublishClick}
            className="h-7 px-2.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 gap-1.5 rounded-lg text-xs font-medium transition-all"
            title="Publish app live on askarc.chat"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span className="text-[11px]">{deployedUrl ? 'Update App' : 'Publish'}</span>
          </Button>
        )}
      </div>

      {/* Sandpack Workspace Area */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#090a0d] flex items-center justify-center p-3">
        <SandpackProvider
          template="react-ts"
          customSetup={{
            dependencies: {
              "react": "^18.3.1",
              "react-dom": "^18.3.1",
              "react-router-dom": "^6.28.0",
              "framer-motion": "^11.11.9",
              "lucide-react": "^0.453.0",
              "react-icons": "^5.3.0",
              "canvas-confetti": "^1.9.4"
            }
          }}
          files={sandpackFiles}
          options={{
            visibleFiles: ["/src/App.tsx", "/App.tsx"],
            activeFile: sandpackFiles['/src/App.tsx'] ? "/src/App.tsx" : "/App.tsx",
          }}
          className="h-full w-full min-h-0 flex flex-col overflow-hidden"
          style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}
        >
          <SandpackErrorListener onError={onError} />
          
          <div className="h-full w-full min-h-0 flex items-center justify-center overflow-hidden transition-all duration-300">
            <div 
              className={cn(
                "transition-all duration-300 relative flex flex-col shadow-2xl min-h-0 max-h-full",
                viewMode === 'desktop' && "w-full h-full min-h-0 max-h-full rounded-xl overflow-hidden border border-white/5 bg-background",
                viewMode === 'tablet' && "w-[720px] h-[520px] max-w-[96%] max-h-[94%] rounded-[2rem] p-[10px] bg-zinc-950 ring-1 ring-white/15",
                viewMode === 'phone' && "w-[375px] h-[780px] max-h-[96%] rounded-[3rem] p-[10px] bg-zinc-950 ring-1 ring-white/15"
              )}
            >
              {/* Phone Dynamic Island */}
              {viewMode === 'phone' && (
                <div className="flex items-center justify-center my-1 shrink-0">
                  <div className="w-24 h-5 bg-black rounded-full flex items-center justify-center gap-2 border border-white/5 shadow-inner">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                    <div className="w-2 h-2 rounded-full bg-zinc-900 border border-white/10" />
                  </div>
                </div>
              )}

              {/* Screen Area with Animated Loading Overlay */}
              <div 
                className={cn(
                  "flex-1 min-h-0 relative w-full h-full max-h-full overflow-hidden flex flex-col bg-background",
                  viewMode === 'phone' && "rounded-[2.4rem]",
                  viewMode === 'tablet' && "rounded-[1.4rem]"
                )}
              >
                <SandpackLoadingOverlay previewKey={previewKey} />

                <SandpackPreview
                  key={previewKey}
                  showNavigator={false}
                  showCube={false}
                  showRestartButton={false}
                  showOpenInCodeSandbox={false}
                  className="w-full h-full max-h-full border-none bg-background !h-full !max-h-full"
                  customStyle={{ height: '100%', width: '100%', flex: 1, maxHeight: '100%', minHeight: 0 }}
                />
              </div>

              {/* Mobile Home Bar */}
              {viewMode === 'phone' && (
                <div className="flex justify-center mt-2 shrink-0">
                  <div className="w-28 h-1 bg-white/30 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </SandpackProvider>
      </div>

      {/* Scoped CSS overrides to guarantee Sandpack preview does not overflow window height */}
      <style>{`
        .sp-wrapper,
        .sp-layout,
        .sp-stack,
        .sp-preview,
        .sp-preview-container,
        .sp-preview-iframe {
          height: 100% !important;
          max-height: 100% !important;
          width: 100% !important;
          max-width: 100% !important;
          flex: 1 1 0% !important;
          min-height: 0 !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
