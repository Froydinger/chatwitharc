import { useState, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, Monitor, Smartphone, Tablet, Rocket, ExternalLink, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemedLogo } from '@/components/ThemedLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { type VirtualFileSystem, DEFAULT_FILES } from '@/types/ide';
import { 
  SandpackProvider, 
  SandpackPreview, 
  useSandpack,
  useSandpackNavigation 
} from '@codesandbox/sandpack-react';

interface IDEPreviewPanelProps {
  files: VirtualFileSystem;
  onError?: (error: string) => void;
  deployedUrl?: string | null;
  onPublishClick?: () => void;
  projectId?: string | null;
  isBuilding?: boolean;
}

type ViewMode = 'desktop' | 'tablet' | 'phone';

function SandpackErrorListener({ 
  onError, 
  isBuilding 
}: { 
  onError?: (error: string) => void; 
  isBuilding?: boolean; 
}) {
  const { sandpack } = useSandpack();
  const { error } = sandpack;
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    // Only report errors when NOT building ("only when were previewing should errors show")
    if (!isBuilding && error && onErrorRef.current) {
      const errMsg = error.message || String(error);
      onErrorRef.current(errMsg);
    }
  }, [error, isBuilding]);

  return null;
}

function SandpackRefreshButton({ 
  isRefreshing, 
  onRefresh 
}: { 
  isRefreshing: boolean; 
  onRefresh: () => void; 
}) {
  const { refresh } = useSandpackNavigation();

  const handleRefreshClick = () => {
    onRefresh();
    try {
      refresh();
    } catch (err) {
      console.warn('[Sandpack] Refresh failed:', err);
    }
  };

  return (
    <Button 
      size="sm" 
      variant="ghost" 
      onClick={handleRefreshClick}
      className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg" 
      title="Refresh Preview (reload tab)"
    >
      <RefreshCw className={cn("h-3.5 w-3.5 transition-transform duration-500", isRefreshing && "animate-spin text-primary")} />
    </Button>
  );
}

function SandpackLoadingOverlay({ isBuilding }: { isBuilding?: boolean }) {
  const { listen, sandpack } = useSandpack();
  const [isReady, setIsReady] = useState(() => {
    return !isBuilding && (sandpack.status === 'idle' || sandpack.status === 'done');
  });
  const [loadingStep, setLoadingStep] = useState(
    isBuilding ? 'Building Live App with Luna…' : 'Booting sandbox runtime…'
  );

  useEffect(() => {
    if (isBuilding) {
      setIsReady(false);
      setLoadingStep('Building Live App with Luna…');

      const timer1 = setTimeout(() => {
        setLoadingStep('Writing components & interface…');
      }, 2500);

      const timer2 = setTimeout(() => {
        setLoadingStep('Wiring state & data persistence…');
      }, 5500);

      const timer3 = setTimeout(() => {
        setLoadingStep('Finalizing app bundle…');
      }, 9000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }

    if (sandpack.status === 'idle' || sandpack.status === 'done' || sandpack.status === 'running') {
      const timer = setTimeout(() => setIsReady(true), 200);
      return () => clearTimeout(timer);
    }

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
        if (!isBuilding) {
          setIsReady(true);
        }
      }
      if (msg.type === 'success' || msg.type === 'done') {
        setIsReady(true);
      }
    });

    // Safety fallback timeout to never trap the user when previewing
    const safetyTimer = setTimeout(() => {
      if (!isBuilding) {
        setIsReady(true);
      }
    }, 4200);

    return () => {
      unsubscribe();
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(safetyTimer);
    };
  }, [listen, sandpack.status, isBuilding]);

  return (
    <AnimatePresence>
      {!isReady && (
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeInOut' } }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#090a0d]/95 backdrop-blur-xl select-none rounded-[inherit] overflow-hidden"
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
  onPublishClick,
  projectId,
  isBuilding,
}: IDEPreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Map VirtualFileSystem to Sandpack files structure
  const sandpackFiles = useMemo(() => {
    const targetAppId = projectId || 'default';

    const map = Object.entries(files).reduce((acc, [path, file]) => {
      const sandpackPath = path.startsWith('/') ? path : `/${path}`;
      acc[sandpackPath] = file.content;
      return acc;
    }, {} as Record<string, string>);

    // Ensure tsconfig.json supports path aliases
    if (!map['/tsconfig.json']) {
      map['/tsconfig.json'] = JSON.stringify({
        compilerOptions: {
          strict: true,
          esModuleInterop: true,
          lib: ['dom', 'es2015'],
          jsx: 'react-jsx',
          baseUrl: '.',
          paths: {
            '@/*': ['src/*', '*'],
          },
        },
      }, null, 2);
    }

    // Ensure system files are never corrupted or missing in sandbox runtime
    const dbContent = map['/src/lib/netlifyDb.ts'];
    if (!dbContent || !dbContent.includes('export const netlifyDb =') || !dbContent.includes('export interface AppUser')) {
      map['/src/lib/netlifyDb.ts'] = DEFAULT_FILES['src/lib/netlifyDb.ts'].content;
    }

    const authModalContent = map['/src/components/NetlifyAuthModal.tsx'];
    if (!authModalContent || !authModalContent.includes('export function NetlifyAuthModal')) {
      map['/src/components/NetlifyAuthModal.tsx'] = DEFAULT_FILES['src/components/NetlifyAuthModal.tsx'].content;
    }

    // Determine target app entrypoint
    const hasSrcApp = Boolean(map['/src/App.tsx'] || map['/src/App.jsx'] || map['/src/App.js']);
    const targetAppImport = hasSrcApp ? './src/App' : './App';

    // Ensure React 18 entrypoint for Sandpack's client-side bundler with isolated app namespace
    if (!map['/index.tsx'] && !map['/index.js']) {
      map['/index.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

if (typeof window !== 'undefined') {
  (window as any).__ARC_APP_ID__ = '${targetAppId}';
}

import App from '${targetAppImport}';

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
    } else {
      // Incase index.tsx exists, prepend app ID
      if (map['/index.tsx'] && !map['/index.tsx'].includes('__ARC_APP_ID__')) {
        map['/index.tsx'] = `if (typeof window !== 'undefined') { (window as any).__ARC_APP_ID__ = '${targetAppId}'; }\n` + map['/index.tsx'];
      }
    }

    if (map['/src/main.tsx'] && !map['/src/main.tsx'].includes('__ARC_APP_ID__')) {
      map['/src/main.tsx'] = `if (typeof window !== 'undefined') { (window as any).__ARC_APP_ID__ = '${targetAppId}'; }\n` + map['/src/main.tsx'];
    }

    // Ensure root /App.tsx re-exports ./src/App if /src/App.tsx exists
    if (map['/src/App.tsx'] && !map['/App.tsx']) {
      map['/App.tsx'] = `export { default } from './src/App';\nexport * from './src/App';`;
    }

    // Ensure /styles.css exists with dark background and typography
    if (!map['/styles.css']) {
      map['/styles.css'] = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap');

*, ::before, ::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background-color: #090a0f;
  color: #f8fafc;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  min-height: 100vh;
}
`;
    }

    // Ensure index.css and App.css fallbacks exist
    if (!map['/src/index.css'] && !map['/index.css']) {
      map['/src/index.css'] = `@import url('./styles.css');\n`;
      map['/index.css'] = `@import url('./styles.css');\n`;
    }
    if (!map['/src/App.css'] && !map['/App.css']) {
      map['/src/App.css'] = '';
      map['/App.css'] = '';
    }

    // Provide HTML shell with Tailwind CSS script + dark mode config
    const htmlContent = `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arc Live App</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: 'class',
        theme: {
          extend: {
            colors: {
              border: 'rgba(255, 255, 255, 0.1)',
              background: '#090a0f',
              foreground: '#f8fafc',
              primary: {
                DEFAULT: '#6366f1',
                foreground: '#ffffff',
              },
              muted: {
                DEFAULT: '#1e293b',
                foreground: '#94a3b8',
              },
              card: {
                DEFAULT: '#0f1117',
                foreground: '#f8fafc',
              }
            }
          }
        }
      }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *, ::before, ::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background-color: #090a0f;
        color: #f8fafc;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        min-height: 100%;
      }
      #root {
        min-height: 100vh;
      }
    </style>
  </head>
  <body class="bg-[#090a0f] text-slate-100 antialiased min-h-screen">
    <div id="root"></div>
  </body>
</html>`;

    map['/index.html'] = htmlContent;
    map['/public/index.html'] = htmlContent;

    return map;
  }, [files, projectId]);

  const activeSandpackFile = sandpackFiles['/src/App.tsx'] ? '/src/App.tsx' : '/App.tsx';

  return (
    <SandpackProvider
      template="react-ts"
      theme="dark"
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
        externalResources: [
          "https://cdn.tailwindcss.com",
          "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap"
        ],
        visibleFiles: ["/src/App.tsx", "/App.tsx"],
        activeFile: activeSandpackFile,
      }}
      className="h-full w-full min-h-0 max-h-full overflow-hidden flex flex-col bg-[#0b0c0e]"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}
    >
      <SandpackErrorListener onError={onError} isBuilding={isBuilding} />

      {/* Top Preview Bar */}
      <div className="px-3.5 py-2 border-b border-border/10 flex items-center gap-2.5 shrink-0 bg-[#0d0e12]/80 backdrop-blur-md">
        <SandpackRefreshButton 
          isRefreshing={isRefreshing}
          onRefresh={() => {
            setIsRefreshing(true);
            setTimeout(() => setIsRefreshing(false), 600);
          }}
        />
        
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
        <div className="h-full w-full min-h-0 flex items-center justify-center overflow-hidden transition-all duration-300">
          <div 
            className={cn(
              "transition-all duration-300 relative flex flex-col shadow-2xl min-h-0 max-h-full overflow-hidden bg-[#090a0f]",
              viewMode === 'desktop' && "w-full h-full min-h-0 max-h-full rounded-xl border border-white/5",
              viewMode === 'tablet' && "w-[720px] h-[520px] max-w-[96%] max-h-[94%] rounded-[2rem] p-[10px] bg-zinc-950 ring-1 ring-white/15",
              viewMode === 'phone' && "w-[375px] h-[780px] max-h-[96%] rounded-[3rem] p-[10px] bg-zinc-950 ring-1 ring-white/15"
            )}
            style={{ isolation: 'isolate' }}
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
                "flex-1 min-h-0 relative w-full h-full max-h-full overflow-hidden flex flex-col bg-[#090a0f]",
                viewMode === 'desktop' && "rounded-xl",
                viewMode === 'phone' && "rounded-[2.4rem]",
                viewMode === 'tablet' && "rounded-[1.4rem]"
              )}
              style={{ isolation: 'isolate' }}
            >
              <SandpackLoadingOverlay isBuilding={isBuilding} />

              <SandpackPreview
                showNavigator={false}
                showCube={false}
                showRestartButton={false}
                showOpenInCodeSandbox={false}
                showSandpackErrorOverlay={!isBuilding}
                className="w-full h-full max-h-full border-none bg-[#090a0f] !h-full !max-h-full rounded-[inherit] overflow-hidden"
                customStyle={{ height: '100%', width: '100%', flex: 1, maxHeight: '100%', minHeight: 0, background: '#090a0f', backgroundColor: '#090a0f' }}
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
      </div>

      {/* Scoped CSS overrides to guarantee Sandpack preview does not overflow window height and has zero white corners */}
      <style>{`
        .sp-wrapper,
        .sp-layout,
        .sp-stack,
        .sp-preview,
        .sp-preview-container,
        .sp-preview-iframe,
        iframe {
          height: 100% !important;
          max-height: 100% !important;
          width: 100% !important;
          max-width: 100% !important;
          flex: 1 1 0% !important;
          min-height: 0 !important;
          border: none !important;
          background: #090a0f !important;
          background-color: #090a0f !important;
          border-radius: inherit !important;
          overflow: hidden !important;
        }
        .sp-preview-container {
          background: #090a0f !important;
          background-color: #090a0f !important;
          border-radius: inherit !important;
        }
        ${isBuilding ? `
          .sp-overlay.sp-error,
          .sp-error,
          .sp-error-message,
          .sp-overlay-error,
          [data-sandpack-error],
          div[class*="errorClassName"],
          div[class*="overlay"][class*="error"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        ` : ''}
      `}</style>
    </SandpackProvider>
  );
}
