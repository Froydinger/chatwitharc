import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Code2, Search, Rocket, ExternalLink, Layers, Trash2, Plus, Calendar, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIDEStore } from "@/store/useIDEStore";
import { IDECanvasPanel } from "@/components/ide/IDECanvasPanel";
import { motion } from "framer-motion";
import type { VirtualFileSystem } from "@/types/ide";
import { DEFAULT_FILES } from "@/types/ide";

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

export function AppsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isOpen, reopenIDECanvas, openIDECanvas, closeIDE } = useIDEStore();

  useEffect(() => {
    const isBuildRoute = window.location.pathname.startsWith('/build');
    if (projectId) {
      const initialPrompt = searchParams.get('initialPrompt') || undefined;
      loadAndOpenProject(projectId, initialPrompt);
    } else if (isBuildRoute) {
      import("@/types/ide").then(({ DEFAULT_FILES }) => {
        openIDECanvas("", DEFAULT_FILES);
      });
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
        navigate(`/build/${data.id}?initialPrompt=${encodeURIComponent(prompt)}`);
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

      const filesData = data?.files ? (data.files as unknown as VirtualFileSystem) : {};
      const filesToLoad = Object.keys(filesData).length > 0 ? filesData : DEFAULT_FILES;

      reopenIDECanvas(id, filesToLoad, data?.messages || [], initialPrompt);
    } catch (err) {
      console.error('Failed to load project:', err);
      toast.error("Failed to load project");
      navigate('/build');
    }
  };

  if (projectId && isOpen) {
    return (
      <div className="fixed inset-0 z-[100] bg-background">
        <IDECanvasPanel onClose={() => navigate('/build')} />
      </div>
    );
  }

  return <AppsDashboard />;
}

function AppsDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<IDEProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [newProjectPrompt, setNewProjectPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    navigate(`/build/${project.id}`);
  };

  const handleCreateNewAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPrompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Please sign in to create apps");
        return;
      }

      const promptText = newProjectPrompt.trim();
      const projectTitle = promptText ? promptText.slice(0, 100) : 'Untitled Project';

      const { data, error } = await supabase
        .from('ide_projects')
        .insert({
          user_id: session.user.id,
          title: projectTitle,
          prompt: promptText,
          files: DEFAULT_FILES as any,
          messages: [] as any
        })
        .select('id')
        .single();

      if (error) throw error;
      if (data) {
        navigate(`/build/${data.id}?initialPrompt=${encodeURIComponent(promptText)}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error("Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this app?")) return;
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

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-foreground flex flex-col font-sans">
      {/* Header bar */}
      <header className="px-6 py-4 border-b border-border/10 bg-[#0d0e10] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Arc Code Dashboard</h1>
              <span className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider select-none">Beta</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Build and deploy instant React web applications</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-xs rounded-lg hover:bg-white/5">
          Exit Builder
        </Button>
      </header>

      {/* Main dashboard body */}
      <div className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Create App Box */}
        <div className="bg-[#0d0e10] border border-dashed border-border/20 rounded-2xl p-6 flex flex-col justify-center space-y-4 hover:border-primary/30 transition-colors">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-primary" />
              <span>Build a new application</span>
            </h3>
            <p className="text-xs text-muted-foreground">Describe your project idea below to jump right into the workspace</p>
            <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 mt-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-normal text-amber-500/80">
                <span className="font-semibold text-amber-500">Beta Warning:</span> Multi-page deployments and complex states are currently in active development. Please expect instability. For single-page/single-file scripts, we recommend using <code className="bg-amber-500/10 px-1 py-0.5 rounded text-amber-500 font-mono">/code</code> instead.
              </p>
            </div>
          </div>
          <form onSubmit={handleCreateNewAppSubmit} className="flex gap-2 bg-[#121316] border border-border/10 rounded-xl p-2 focus-within:border-primary/45 transition-colors">
            <input
              type="text"
              value={newProjectPrompt}
              onChange={e => setNewProjectPrompt(e.target.value)}
              placeholder="e.g. build an Apple notes app with local storage"
              className="flex-1 bg-transparent border-none text-xs focus:outline-none focus:ring-0 px-2 text-foreground placeholder:text-muted-foreground/60"
              disabled={isSubmitting}
            />
            <Button type="submit" size="sm" className="gap-1.5 text-xs rounded-lg px-4" disabled={!newProjectPrompt.trim() || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              <span>Build</span>
            </Button>
          </form>
        </div>

        {/* Search */}
        <div className="max-w-md">
          <div className="relative flex items-center bg-[#0d0e10] border border-border/10 rounded-xl p-1.5">
            <Search className="h-4 w-4 text-muted-foreground ml-2" />
            <input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs focus:outline-none px-2 text-foreground"
            />
          </div>
        </div>

        {/* Grid cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-[#0d0e10] border border-border/10 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center border border-border/10 rounded-2xl bg-[#0d0e10] space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">No applications found</p>
            <p className="text-[11px] text-muted-foreground/60 max-w-[200px] mx-auto">Try typing a prompt above to build your first project!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredProjects.map((project, i) => (
              <div 
                key={project.id}
                onClick={() => handleOpen(project)}
                className="group bg-[#0d0e10] border border-border/10 hover:border-border/25 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col h-44 justify-between"
              >
                <div className="p-4 space-y-2 min-h-0 flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-semibold truncate flex-1 pr-2">{project.title}</h4>
                    {project.netlify_url ? (
                      <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold tracking-wide">LIVE</span>
                    ) : (
                      <span className="text-[9px] bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono font-bold">DRAFT</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 line-clamp-3 leading-relaxed">{project.prompt || 'No description'}</p>
                </div>
                
                <div className="px-4 py-3 bg-[#111215] border-t border-border/5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{new Date(project.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {project.netlify_url && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        asChild
                        onClick={e => e.stopPropagation()}
                        className="h-7 w-7 rounded-lg hover:bg-white/5"
                        title="Open Live App"
                      >
                        <a href={project.netlify_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={e => handleDelete(e, project.id)}
                      className="h-7 w-7 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                      title="Delete App"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
