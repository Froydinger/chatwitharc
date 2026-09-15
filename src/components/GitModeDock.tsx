import { useEffect, useState } from 'react';
import { RefreshCw, Unplug, Monitor, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/store/useGitStore';
import { supabase } from '@/integrations/supabase/client';
import { useSandboxStore } from '@/store/useSandboxStore';

export function GitHubMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" /></svg>;
}

export function GitModeDock() {
  const { toast } = useToast();
  const {
    connected, providerLogin, selectedRepo, selectedBranch, repositories, loading, error,
    repoAccessMode, allowedRepos,
    loadStatus, connect, loadRepositories, selectRepository, disconnect,
  } = useGitStore();

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (connected && !repositories.length && !loading) {
      void loadRepositories();
    }
  }, [connected, repositories.length, loading, loadRepositories]);

  useEffect(() => {
    if (error) {
      toast({ title: 'GitHub', description: error, variant: 'destructive' });
      useGitStore.setState({ error: null });
    }
  }, [error, toast]);

  const [activeSandbox, setActiveSandbox] = useState<{ id: string; expires_at: string; preview_url: string | null } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    if (!connected || !selectedRepo) {
      setActiveSandbox(null);
      return;
    }
    const checkSandbox = async () => {
      try {
        const { data } = await supabase
          .from('git_sandboxes' as any)
          .select('id, expires_at, preview_url')
          .eq('repo', selectedRepo)
          .in('status', ['active', 'idle'])
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setActiveSandbox(data || null);
      } catch {
        setActiveSandbox(null);
      }
    };
    void checkSandbox();
    const interval = setInterval(checkSandbox, 15000);
    return () => clearInterval(interval);
  }, [connected, selectedRepo]);

  // Terminate active sandbox when unmounting / leaving chat session to save compute
  useEffect(() => {
    const cleanupSandbox = () => {
      if (selectedRepo) {
        void supabase.functions.invoke('chat', {
          body: { action: 'close_sandbox', repo: selectedRepo },
        }).catch(() => undefined);
      }
    };

    window.addEventListener('beforeunload', cleanupSandbox);
    return () => {
      window.removeEventListener('beforeunload', cleanupSandbox);
      cleanupSandbox();
    };
  }, [selectedRepo]);

  const handleLivePreviewClick = async () => {
    if (!selectedRepo) return;
    if (activeSandbox?.preview_url) {
      useSandboxStore.getState().openPreview(activeSandbox.preview_url, selectedRepo);
      return;
    }

    // Direct cloud sandbox dev server launch
    setIsLaunching(true);
    toast({ title: 'Cloud Sandbox', description: `Starting preview for ${selectedRepo}...` });
    try {
      const { data, error: launchError } = await supabase.functions.invoke('chat', {
        body: {
          action: 'launch_sandbox_preview',
          repo: selectedRepo,
          branch: selectedBranch || 'main',
        },
      });

      if (launchError || !data?.previewUrl) {
        throw new Error(data?.error || launchError?.message || 'Failed to start cloud sandbox preview');
      }

      useSandboxStore.getState().openPreview(data.previewUrl, selectedRepo, data.port);
      setActiveSandbox({
        id: data.sandboxId || 'current',
        expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        preview_url: data.previewUrl,
      });
      toast({ title: 'Live Preview Ready', description: `Live app running on port :${data.port || 5173}` });
    } catch (err: any) {
      toast({ title: 'Sandbox Error', description: err.message || 'Could not launch preview', variant: 'destructive' });
    } finally {
      setIsLaunching(false);
    }
  };

  const handleRepoChange = async (repo: string) => {
    if (repo === '__manage_settings__') {
      window.location.assign('/dashboard/settings');
      return;
    }
    const item = repositories.find(value => value.full_name === repo);
    if (!item) return;
    await selectRepository(item.full_name, item.default_branch);
  };

  const availableRepos = repositories.filter(
    (repo) => repoAccessMode === 'all' || (Array.isArray(allowedRepos) && allowedRepos.includes(repo.full_name))
  );

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/85 backdrop-blur-xl shadow-lg px-3.5 py-2 text-xs text-foreground transition-all">
      <GitHubMark className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-300" />
      <span className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full bg-muted font-mono text-[10px] font-semibold tracking-wide text-foreground/80 uppercase">
        Git Session
      </span>
      {!connected ? (
        <>
          <span className="min-w-0 flex-1 text-muted-foreground truncate">GitHub mode is enabled.</span>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={loading}
            className="rounded-full bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-50 shrink-0 hover:opacity-90 active:scale-95 transition-all"
          >
            {loading ? 'Connecting…' : 'Connect GitHub'}
          </button>
        </>
      ) : (
        <>
          <span className="hidden sm:inline max-w-28 truncate text-muted-foreground font-mono text-[11px]">@{providerLogin || 'github'}</span>
          <div className="relative min-w-0 flex-1 group">
            <div
              className="flex items-center justify-between gap-1.5 rounded-full border border-border/50 bg-background/60 px-2.5 py-1 text-xs pointer-events-none group-focus-within:border-primary/50 group-hover:border-border/80 transition-colors"
              title={selectedRepo || 'Choose a repository'}
            >
              <span className="truncate">
                {selectedRepo ? (
                  <>
                    <span className="sm:hidden font-medium">{selectedRepo.split('/').pop() || selectedRepo}</span>
                    <span className="hidden sm:inline">{selectedRepo}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {availableRepos.length ? 'Choose repo…' : 'No allowed repos…'}
                  </span>
                )}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-60" />
            </div>
            <select
              aria-label="GitHub repository"
              value={selectedRepo || ''}
              disabled={loading}
              onFocus={() => { if (!repositories.length) void loadRepositories(); }}
              onChange={event => void handleRepoChange(event.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="">{availableRepos.length ? 'Choose a repository…' : 'No allowed repositories…'}</option>
              {availableRepos.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
              {repoAccessMode === 'selected' && (
                <option value="__manage_settings__">⚙️ Add more in Settings…</option>
              )}
            </select>
          </div>
          <span className="hidden text-muted-foreground sm:inline font-mono text-[11px]">{selectedBranch || 'default'}</span>
          {selectedRepo && (
            <button
              type="button"
              onClick={() => void handleLivePreviewClick()}
              disabled={isLaunching}
              className={cn(
                "inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 rounded-full font-mono text-[10px] font-medium border shrink-0 transition-all cursor-pointer",
                activeSandbox?.preview_url
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/25 shadow-sm"
                  : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/25 shadow-sm",
                isLaunching && "opacity-80 cursor-wait"
              )}
              title={
                activeSandbox?.preview_url
                  ? "Open live app preview"
                  : "Launch cloud sandbox and start dev server"
              }
            >
              {isLaunching ? (
                <>
                  <RefreshCw className="h-2.5 w-2.5 animate-spin text-primary" />
                  <span className="hidden sm:inline">Starting...</span>
                  <span className="sm:hidden">Start...</span>
                </>
              ) : activeSandbox?.preview_url ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">Live Preview</span>
                  <span className="sm:hidden">Preview</span>
                  <span>↗</span>
                </>
              ) : (
                <>
                  <Monitor className="h-2.5 w-2.5 text-primary" />
                  <span className="hidden sm:inline">Live Preview</span>
                  <span className="sm:hidden">Preview</span>
                  <span>↗</span>
                </>
              )}
            </button>
          )}
          <button type="button" onClick={() => void loadRepositories()} disabled={loading} className={cn('rounded-full p-1.5 hover:bg-muted/30 transition-colors', loading && 'animate-spin')} aria-label="Refresh repositories" title="Refresh repositories">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => void disconnect()} disabled={loading} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors" aria-label="Disconnect GitHub" title="Disconnect GitHub">
            <Unplug className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
