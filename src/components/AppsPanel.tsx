import { useState, useEffect, useMemo } from "react";
import { Code2, Search, Rocket, Cloud, ExternalLink, Layers, Trash2 } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useArcStore } from "@/store/useArcStore";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import type { VirtualFileSystem } from "@/types/ide";
import { cn } from "@/lib/utils";

interface IDEProject {
  id: string;
  title: string;
  prompt: string;
  files: VirtualFileSystem;
  messages: any[];
  version: number;
  netlify_url: string | null;
  netlify_subdomain: string | null;
  created_at: string;
  updated_at: string;
}

export function AppsPanel() {
  const isMobile = useIsMobile();
  const { reopenIDECanvas } = useCanvasStore();
  const { setRightPanelOpen } = useArcStore();
  const [projects, setProjects] = useState<IDEProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsLoading(false); return; }

      const { data, error } = await supabase
        .from('ide_projects')
        .select('id, title, prompt, files, messages, version, netlify_url, netlify_subdomain, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProjects((data || []) as unknown as IDEProject[]);
    } catch (err) {
      console.error('Failed to load IDE projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = (project: IDEProject) => {
    reopenIDECanvas(project.id, project.files);
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('ide_projects').delete().eq('id', projectId);
      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== projectId));
      toast.success("Project deleted");
    } catch {
      toast.error("Failed to delete project");
    }
  };

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p =>
      p.title.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const getFileCount = (files: VirtualFileSystem) => Object.keys(files || {}).length;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Rocket className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Apps</h2>
        </div>
        <p className="text-muted-foreground text-base">
          Full apps built with the App Builder IDE
        </p>
        <div className="mx-auto max-w-2xl w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Project Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <GlassCard key={i} className="p-0 overflow-hidden">
                <Skeleton className="h-24 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <Code2 className="h-12 w-12 text-primary-glow" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No apps yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Use <span className="font-mono text-primary">/code</span> to build your first app with the IDE.
              </p>
            </GlassCard>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {filteredProjects.map((project) => (
              <GlassCard
                key={project.id}
                variant="bubble"
                className="p-0 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group overflow-hidden"
                onClick={() => handleOpen(project)}
              >
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-sm text-foreground truncate">
                      {project.title.slice(0, 50)}
                    </span>
                    <Cloud className="w-3 h-3 flex-shrink-0 text-emerald-400" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={(e) => handleDelete(e, project.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Prompt preview */}
                <div className="px-4 py-3 bg-muted/10">
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {project.prompt}
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/20 text-xs text-muted-foreground/70">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      <span>{getFileCount(project.files)} files</span>
                    </div>
                    <span>v{project.version}</span>
                  </div>
                  {project.netlify_url ? (
                    <a
                      href={project.netlify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Live
                    </a>
                  ) : (
                    <span>{new Date(project.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
