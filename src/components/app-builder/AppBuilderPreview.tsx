import { useEffect, useMemo } from 'react';
import { SandpackPreview, SandpackProvider, useSandpack } from '@codesandbox/sandpack-react';
import { createAppPreviewFiles } from './createAppPreviewFiles';
import type { VirtualFileSystem } from '@/types/ide';

export type PreviewSize = 'phone' | 'tablet' | 'desktop';

function PreviewError({ onError }: { onError?: (message: string) => void }) {
  const { sandpack } = useSandpack();
  useEffect(() => {
    if (sandpack.error) onError?.(sandpack.error.message || 'The preview could not compile.');
  }, [sandpack.error, onError]);
  return null;
}

function AppDemoPreview() {
  return (
    <div className="h-full overflow-auto bg-[#f6f5f2] text-[#171715] font-sans">
      <div className="mx-auto max-w-xl px-5 py-6 sm:px-8 sm:py-9">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171715] text-sm text-white">M</div>
            <div><p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Monday, September 24</p><p className="text-sm font-semibold">Morrow habits</p></div>
          </div>
          <div className="h-9 w-9 rounded-full bg-[#e4e2dc] ring-2 ring-white" />
        </div>
        <div className="mt-9">
          <p className="text-sm text-black/55">Good morning, Alex</p>
          <h1 className="mt-1 text-[32px] leading-tight font-medium tracking-[-0.04em]">A little better,<br />every day.</h1>
        </div>
        <div className="mt-7 rounded-[26px] bg-[#dbe6d6] p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wider text-[#485843]">Your week</span><span className="rounded-full bg-white/55 px-2.5 py-1 text-[11px] text-[#485843]">4 day streak</span></div>
          <div className="mt-5 grid grid-cols-7 gap-2 text-center">
            {['M','T','W','T','F','S','S'].map((day, index) => <div key={`${day}-${index}`} className="space-y-2"><span className="block text-[10px] text-black/45">{day}</span><span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs ${index < 4 ? 'bg-[#38533d] text-white' : 'bg-white/70 text-black/40'}`}>{index < 4 ? '✓' : '·'}</span></div>)}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between"><h2 className="text-sm font-semibold">Today’s habits</h2><button className="text-xs text-black/45">See all</button></div>
        <div className="mt-3 space-y-2.5">
          {[['01','Take a quiet walk','10 min outside'],['02','Read a few pages','Your evening reset'],['03','Drink some water','A small start']].map(([n, title, detail], index) => <div key={n} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-3.5 py-3 shadow-[0_5px_20px_rgba(0,0,0,.025)]"><span className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs ${index === 0 ? 'bg-[#e8eee5] text-[#537057]' : 'bg-[#f4f3ef] text-black/35'}`}>{index === 0 ? '✓' : n}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-[11px] text-black/45">{detail}</p></div><span className="h-5 w-5 rounded-full border border-black/15" /></div>)}
        </div>
        <div className="mt-5 rounded-2xl bg-[#171715] p-4 text-white"><p className="text-[10px] uppercase tracking-[0.18em] text-white/50">A note to keep</p><p className="mt-2 text-sm leading-relaxed">Small steps still move you forward.</p></div>
      </div>
      <div className="sticky bottom-0 flex justify-around border-t border-black/5 bg-white/90 px-3 py-3 text-[10px] text-black/45 backdrop-blur"><span className="text-black">Today</span><span>Explore</span><span>Progress</span><span>Profile</span></div>
    </div>
  );
}

interface AppBuilderPreviewProps {
  files: VirtualFileSystem;
  projectId: string;
  size: PreviewSize;
  isMobile: boolean;
  hasApp: boolean;
  demo?: boolean;
  onError?: (message: string) => void;
}

export function AppBuilderPreview({ files, projectId, size, isMobile, hasApp, demo, onError }: AppBuilderPreviewProps) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://olhptgffasqrmeyqjtrq.supabase.co';
  const previewFiles = useMemo(() => createAppPreviewFiles(files, projectId, supabaseUrl), [files, projectId, supabaseUrl]);

  if (demo && hasApp) {
    return <div className="h-full w-full overflow-hidden bg-[#f6f5f2]"><AppDemoPreview /></div>;
  }

  if (!hasApp) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-7 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
          <span className="text-xl">↗</span>
        </div>
        <p className="text-sm font-medium text-white/80">Your preview will show up here</p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/40">Tell Arc what you want to make. It’ll build a working app and keep this preview in sync.</p>
      </div>
    );
  }

  return (
    <SandpackProvider
      template="react-ts"
      theme="dark"
      files={previewFiles}
      customSetup={{ dependencies: {
        react: '^18.3.1', 'react-dom': '^18.3.1', 'react-router-dom': '^6.28.0',
        'framer-motion': '^11.11.9', 'lucide-react': '^0.453.0', 'react-icons': '^5.3.0',
        'canvas-confetti': '^1.9.4', tailwindcss: '^3.4.17', postcss: '^8.5.6', autoprefixer: '^10.4.21',
      } }}
      options={{ externalResources: [
        // Sandpack detects script resources by the `.js` suffix; the CDN ignores this query string.
        'https://cdn.tailwindcss.com/3.4.17?shim.js',
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap',
      ], showNavigator: false }}
      className="h-full w-full overflow-hidden bg-[#090a0f]"
    >
      <PreviewError onError={onError} />
      <SandpackPreview
        showNavigator={false}
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
        showSandpackErrorOverlay
        className={`h-full w-full border-0 bg-[#090a0f] ${isMobile ? 'rounded-none' : size === 'phone' ? 'rounded-[2.1rem]' : size === 'tablet' ? 'rounded-[1.5rem]' : 'rounded-xl'}`}
        customStyle={{ height: '100%', width: '100%', minHeight: 0, border: 0, background: '#090a0f' }}
      />
    </SandpackProvider>
  );
}
