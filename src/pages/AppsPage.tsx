import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Code2, Search, Rocket, ExternalLink, Layers, Trash2, Plus, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useIDEStore } from "@/store/useIDEStore";
import { IDECanvasPanel } from "@/components/ide/IDECanvasPanel";
import { useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { VirtualFileSystem } from "@/types/ide";

interface IDEProject {
  id: string;
  title: string;
  prompt: string;
  files: VirtualFileSystem;
  messages: any[];
  version: number;
  netlify_url: string | null;
  netlify_subdomain: string | null;
  favicon_label: string | null;
  created_at: string;
  updated_at: string;
}

export function AppsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isOpen, reopenIDECanvas, openIDECanvas, closeIDE } = useIDEStore();

  // If we have a projectId in the URL, load and open that project
  useEffect(() => {
    if (projectId) {
      const initialPrompt = searchParams.get('initialPrompt') || undefined;
      loadAndOpenProject(projectId, initialPrompt);
    } else {
      const buildPrompt = searchParams.get('prompt');
      if (buildPrompt) {
        createAndOpenWithPrompt(buildPrompt);
      } else {
        closeIDE();
      }
    }
  }, [projectId]);

  const createAndOpenWithPrompt = async (prompt: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Please sign in to create apps");
        return;
      }
      const { data, error } = await supabase
        .from('ide_projects')
        .insert({ user_id: session.user.id, title: 'Untitled Project', prompt })
        .select('id')
        .single();
      if (error) throw error;
      if (data) {
        navigate(`/apps/${data.id}?initialPrompt=${encodeURIComponent(prompt)}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error("Failed to create project");
    }
  };

  const loadAndOpenProject = async (id: string, initialPrompt?: string) => {
    try {
      const { data } = await supabase
        .from('ide_projects')
        .select('files, messages')
        .eq('id', id)
        .single();

      if (data?.files) {
        reopenIDECanvas(id, data.files as unknown as VirtualFileSystem, (data as any).messages || [], initialPrompt);
      } else if (initialPrompt) {
        reopenIDECanvas(id, {} as VirtualFileSystem, [], initialPrompt);
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      toast.error("Failed to load project");
      navigate('/apps');
    }
  };

  // If a project is open, render the IDE
  if (projectId && isOpen) {
    return (
      <div className="fixed inset-0 z-[100] bg-background">
        <IDECanvasPanel onClose={() => navigate('/apps')} />
      </div>
    );
  }

  // Otherwise render the dashboard
  return <AppsDashboard />;
}

function AppsDashboard() {
  const navigate = useNavigate();
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
        .select('id, title, prompt, files, messages, version, netlify_url, netlify_subdomain, favicon_label, created_at, updated_at')
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
    navigate(`/apps/${project.id}`);
  };

  const handleNewApp = () => {
    // Navigate to apps with a new project flow — the IDE will create the project on first message
    const { openIDECanvas } = useIDEStore.getState();
    openIDECanvas('', undefined, false);
    // Create project in DB first, then navigate
    createNewProject();
  };

  const createNewProject = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Please sign in to create apps");
        return;
      }

      const { data, error } = await supabase
        .from('ide_projects')
        .insert({ user_id: session.user.id, title: 'Untitled Project', prompt: '' })
        .select('id')
        .single();

      if (error) throw error;
      if (data) {
        navigate(`/apps/${data.id}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error("Failed to create project");
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
    <div className="min-h-screen bg-background">
      {/* Top bar — safe-area padding here so bar spans under Dynamic Island and sticks at true top */}
      <div className="sticky top-0 z-10 border-b border-border/30 bg-background/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full gap-2"
              onClick={() => navigate('/dashboard')}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <div className="glass rounded-full p-2">
                <Rocket className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">App Builder</h1>
            </div>
          </div>
          <Button
            onClick={handleNewApp}
            className="rounded-full gap-2"
          >
            <Plus className="h-4 w-4" />
            New App
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Search */}
        <div className="max-w-md">
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

        {/* Project Grid */}
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
          <div className="text-center py-20">
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <Code2 className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No apps yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Create your first app with the App Builder.
              </p>
              <Button onClick={handleNewApp} className="rounded-full gap-2">
                <Plus className="h-4 w-4" />
                Create App
              </Button>
            </GlassCard>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <GlassCard
                  variant="bubble"
                  className="p-0 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group overflow-hidden"
                  onClick={() => handleOpen(project)}
                >
                  {/* Header bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => {
                        const favicon = getFaviconByLabel(project.favicon_label);
                        if (favicon) {
                          const Icon = favicon.icon;
                          return (
                            <div
                              className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                              style={{ backgroundColor: favicon.bg }}
                            >
                              <Icon size={12} color={favicon.color} strokeWidth={2} />
                            </div>
                          );
                        }
                        return <Code2 className="w-4 h-4 text-primary flex-shrink-0" />;
                      })()}
                      <span className="font-medium text-sm text-foreground truncate">
                        {project.netlify_subdomain
                          ? project.netlify_subdomain
                          : project.title.slice(0, 50)}
                      </span>
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
                      {project.prompt || 'No description'}
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
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
