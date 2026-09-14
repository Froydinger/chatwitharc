import { useEffect } from 'react';
import { RefreshCw, Unplug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/store/useGitStore';

export function GitHubMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" /></svg>;
}

export function GitModeDock() {
  const { toast } = useToast();
  const {
    connected, providerLogin, selectedRepo, selectedBranch, repositories, loading, error,
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

  const handleRepoChange = async (repo: string) => {
    const item = repositories.find(value => value.full_name === repo);
    if (!item) return;
    await selectRepository(item.full_name, item.default_branch);
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/85 backdrop-blur-xl shadow-lg px-3.5 py-2 text-xs text-foreground transition-all">
      <GitHubMark className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-300" />
      {!connected ? (
        <>
          <span className="min-w-0 flex-1 text-muted-foreground truncate">GitHub mode is account-gated beta.</span>
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
          <span className="max-w-28 truncate text-muted-foreground font-mono text-[11px]">@{providerLogin || 'github'}</span>
          <select
            aria-label="GitHub repository"
            value={selectedRepo || ''}
            disabled={loading}
            onFocus={() => { if (!repositories.length) void loadRepositories(); }}
            onChange={event => void handleRepoChange(event.target.value)}
            className="min-w-0 flex-1 rounded-full border border-border/50 bg-background/60 px-2 py-1 text-xs outline-none cursor-pointer"
          >
            <option value="">Choose a repository…</option>
            {repositories.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
          </select>
          <span className="hidden text-muted-foreground sm:inline font-mono text-[11px]">{selectedBranch || 'default'}</span>
          <button type="button" onClick={() => void loadRepositories()} disabled={loading} className={cn('rounded-full p-1.5 hover:bg-muted/30 transition-colors', loading && 'animate-spin')} aria-label="Refresh repositories">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => void disconnect()} disabled={loading} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors" aria-label="Disconnect GitHub">
            <Unplug className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
