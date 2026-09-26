import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, LoaderCircle, Smartphone } from 'lucide-react';
import { getFaviconByLabel } from '@/constants/faviconOptions';
import type { AppBuilderProjectSummary } from '@/utils/appBuilderIntent';
import { reopenOwnedAppBuilderProject } from '@/services/openAppBuilderProject';
import { useToast } from '@/hooks/use-toast';

interface AppBuilderAppChoiceCardProps {
  projects: AppBuilderProjectSummary[];
  editPrompt: string;
}

function styleHint(prompt: string) {
  if (/\b(white|light|bright|airy)\b/i.test(prompt)) return 'Light look';
  if (/\b(dark|black|noir)\b/i.test(prompt)) return 'Dark look';
  if (/\b(minimal|simple|clean)\b/i.test(prompt)) return 'Minimal look';
  return '';
}

function promptPreview(prompt: string) {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  return clean.length > 105 ? `${clean.slice(0, 102).trimEnd()}…` : clean;
}

export function AppBuilderAppChoiceCard({ projects, editPrompt }: AppBuilderAppChoiceCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openProject = async (project: AppBuilderProjectSummary) => {
    if (openingId) return;
    setOpeningId(project.id);
    try {
      await reopenOwnedAppBuilderProject(project.id, editPrompt);
      navigate(`/build/${encodeURIComponent(project.id)}`);
    } catch (error) {
      toast({
        title: 'Could not open that app safely',
        description: error instanceof Error ? error.message : 'Try opening the app again from your Apps page.',
      });
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <section className="my-2 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111211] text-white shadow-[0_18px_50px_rgba(0,0,0,.2)]">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="text-sm font-semibold">Which app should I edit?</p>
        <p className="mt-1 text-[11px] text-white/45">I found a few matches. Pick one and I’ll open that saved app with your request.</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {projects.map((project) => {
          const favicon = getFaviconByLabel(project.favicon_label);
          const Icon = favicon?.icon ?? Smartphone;
          const hint = styleHint(project.prompt);
          const preview = promptPreview(project.prompt);
          const opening = openingId === project.id;
          return (
            <button
              key={project.id}
              type="button"
              disabled={openingId !== null}
              onClick={() => void openProject(project)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
              aria-label={`Edit ${project.title || 'saved app'}${project.favicon_label ? `, ${project.favicon_label} icon` : ''}${hint ? `, ${hint}` : ''}`}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={favicon ? { backgroundColor: favicon.bg, color: favicon.color } : undefined}
              >
                {opening ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-white/90">{project.title?.trim() || 'Untitled app'}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-white/45">
                  {project.favicon_label && <span>{project.favicon_label} icon</span>}
                  {hint && <span>{hint}</span>}
                  {project.netlify_subdomain && <span className="truncate">{project.netlify_subdomain}.askarc.chat</span>}
                </span>
                {preview && <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-white/35">{preview}</span>}
              </span>
              {opening ? <span className="text-[10px] text-white/45">Opening…</span> : <ArrowUpRight className="h-4 w-4 shrink-0 text-white/40" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
