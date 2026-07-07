import { useState, useEffect } from 'react';
import { RefreshCw, Globe, Monitor, Smartphone, Rocket, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

type ViewMode = 'desktop' | 'phone';

function SandpackErrorListener({ onError }: { onError?: (error: string) => void }) {
  const { sandpack } = useSandpack();
  const { error } = sandpack;

  useEffect(() => {
    if (error && onError) {
      const errMsg = error.message || String(error);
      onError(errMsg);
    }
  }, [error, onError]);

  return null;
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
  const sandpackFiles = Object.entries(files).reduce((acc, [path, file]) => {
    const sandpackPath = path.startsWith('/') ? path : `/${path}`;
    acc[sandpackPath] = file.content;
    return acc;
  }, {} as Record<string, string>);

  // Add default configurations
  sandpackFiles['/package.json'] = JSON.stringify({
    name: "vite-react-ts",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    dependencies: {
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "react-router-dom": "^6.28.0",
      "framer-motion": "^11.11.9",
      "lucide-react": "^0.453.0",
      "react-icons": "^5.3.0"
    }
  });

  sandpackFiles['/index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arc Sandbox Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        font-family: 'Inter', sans-serif;
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

  const handleRefresh = () => {
    setPreviewKey(prev => prev + 1);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-1.5 border-b border-border/10 flex items-center gap-2 shrink-0 bg-[#0d0e10]">
        <Button size="sm" variant="ghost" onClick={handleRefresh}
          className="h-7 w-7 p-0 shrink-0" title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        
        {/* URL Bar */}
        <div className="flex-1 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[#121316] border border-border/10 text-[11px] text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono text-[10px] select-all">localhost:3000/</span>
        </div>
        
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-[#121316] border border-border/10 rounded-md p-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('desktop')}
            className={cn('h-6 w-6 p-0 rounded', viewMode === 'desktop' && 'bg-background shadow-sm text-foreground')}
            title="Desktop view"
          >
            <Monitor className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode('phone')}
            className={cn('h-6 w-6 p-0 rounded', viewMode === 'phone' && 'bg-background shadow-sm text-foreground')}
            title="Phone view"
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
            className="h-7 w-7 p-0 shrink-0" 
            title="Open Deployed Site"
          >
            <a href={deployedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}

        {/* Netlify Publish Action */}
        {onPublishClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPublishClick}
            className="h-7 px-2.5 text-muted-foreground gap-1.5 hover:text-foreground text-xs"
            title="Publish app live"
          >
            <Rocket className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-medium">{deployedUrl ? 'Update' : 'Publish'}</span>
          </Button>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#0c0d0e]">
        <SandpackProvider
          key={previewKey}
          template="vite-react-ts"
          files={sandpackFiles}
          options={{
            visibleFiles: ["/src/App.tsx"],
            activeFile: "/src/App.tsx",
          }}
        >
          <SandpackErrorListener onError={onError} />
          {viewMode === 'phone' ? (
            <div className="h-full flex items-center justify-center bg-[#0c0d0e] py-4">
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
                    <SandpackPreview
                      showNavigator={false}
                      showCube={false}
                      showRestartButton={false}
                      className="w-full h-full border-none bg-white"
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
            <SandpackPreview
              showNavigator={false}
              showCube={false}
              showRestartButton={false}
              className="w-full h-full border-none bg-white"
            />
          )}
        </SandpackProvider>
      </div>
    </div>
  );
}
