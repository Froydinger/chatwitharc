import { ArrowUpRight, FileCode2, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface AppBuilderArtifactCardProps {
  projectId?: string;
  title?: string;
  prompt?: string;
  fileCount?: number;
  className?: string;
}

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AppBuilderArtifactCard({ projectId, title, prompt, fileCount, className }: AppBuilderArtifactCardProps) {
  const navigate = useNavigate();
  const canOpen = typeof projectId === 'string' && PROJECT_ID.test(projectId);
  const open = () => { if (canOpen) navigate(`/build/${encodeURIComponent(projectId!)}`); };

  return (
    <section className={`my-2 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111211] text-white shadow-[0_18px_50px_rgba(0,0,0,.2)] ${className ?? ''}`}>
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
          <Smartphone className="h-4 w-4 text-white/75" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title?.trim() || 'Your new app'}</p>
          <p className="mt-0.5 text-[10px] text-white/40">Saved in App Builder</p>
        </div>
        {Number.isFinite(fileCount) && <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/40"><FileCode2 className="h-3 w-3" />{fileCount} files</span>}
      </div>
      {prompt?.trim() && <p className="px-4 py-3 text-xs leading-relaxed text-white/55 line-clamp-2">{prompt}</p>}
      <div className="px-4 pb-4">
        <Button type="button" disabled={!canOpen} onClick={open} className="h-9 w-full justify-between rounded-xl bg-white text-xs font-semibold text-black hover:bg-white/90 disabled:bg-white/15 disabled:text-white/35">
          {canOpen ? 'Open app preview' : 'Project link unavailable'}
          {canOpen && <ArrowUpRight className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </section>
  );
}
