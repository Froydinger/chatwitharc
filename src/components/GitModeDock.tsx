import { useEffect } from 'react';
import { RefreshCw, Unplug, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/store/useGitStore';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useExecutionModelStore } from '@/store/useExecutionModelStore';

export function GitHubMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" /></svg>;
}

export function GitModeDock({ workspaceUI = false }: { workspaceUI?: boolean }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const { hasBoost, isAdmin, loading: subscriptionLoading } = useSubscription();
  const canUsePro = hasBoost || isAdmin;
  const executionOwnerId = useExecutionModelStore((state) => state.ownerId);
  const gitModelMode = useExecutionModelStore((state) => state.gitModelMode);
  const setOwnerId = useExecutionModelStore((state) => state.setOwnerId);
  const setGitModelMode = useExecutionModelStore((state) => state.setGitModelMode);

  useEffect(() => {
    setOwnerId(ownerId);
  }, [ownerId, setOwnerId]);

  useEffect(() => {
    if (executionOwnerId === ownerId && !subscriptionLoading && !canUsePro && gitModelMode === 'pro') {
      setGitModelMode(ownerId, 'normal', false);
    }
  }, [canUsePro, executionOwnerId, gitModelMode, ownerId, setGitModelMode, subscriptionLoading]);

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
  const executionModelsReady = executionOwnerId === ownerId;
  const activeGitModelMode = executionModelsReady && canUsePro ? gitModelMode : 'normal';

  const modelControls = <div role="group" aria-label="Git execution mode" className={cn('inline-flex shrink-0 items-center rounded-full border border-border/60 bg-background/60 p-0.5', workspaceUI && 'ws-git-model-controls')}>
    <button
      type="button"
      aria-pressed={activeGitModelMode === 'normal'}
      disabled={!executionModelsReady || subscriptionLoading}
      onClick={() => setGitModelMode(ownerId, 'normal', canUsePro)}
      className={cn(
        'rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60',
        activeGitModelMode === 'normal' ? 'bg-primary/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        workspaceUI && 'ws-git-model-option',
      )}
    >
      Normal
    </button>
    <button
      type="button"
      aria-label={canUsePro ? 'Git Pro mode' : 'Git Pro mode requires Boost'}
      aria-pressed={activeGitModelMode === 'pro'}
      disabled={!executionModelsReady || subscriptionLoading || !canUsePro}
      onClick={() => setGitModelMode(ownerId, 'pro', canUsePro)}
      title={canUsePro ? 'Use Pro Git execution' : 'Pro mode requires Boost or admin access'}
      className={cn(
        'rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50',
        activeGitModelMode === 'pro' ? 'bg-primary/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        workspaceUI && 'ws-git-model-option',
      )}
    >
      Pro
    </button>
  </div>;

  const repositoryPicker = <div className={cn('relative min-w-0 flex-1 group', workspaceUI && 'ws-git-repository-picker')}>
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
  </div>;

  const connectAction = <button
    type="button"
    onClick={() => void connect()}
    disabled={loading}
    className={cn('rounded-full bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-50 shrink-0 hover:opacity-90 active:scale-95 transition-all', workspaceUI && 'ws-primary-button ws-git-connect')}
  >
    {loading ? 'Connecting…' : 'Connect GitHub'}
  </button>;

  const repositoryActions = <div className={cn('flex items-center gap-1', workspaceUI && 'ws-git-repository-actions')}>
    <button type="button" onClick={() => void loadRepositories()} disabled={loading} className={cn('rounded-full p-1.5 hover:bg-muted/30 transition-colors', loading && 'animate-spin', workspaceUI && 'ws-icon-button')} aria-label="Refresh repositories" title="Refresh repositories">
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
    <button type="button" onClick={() => void disconnect()} disabled={loading} className={cn('rounded-full p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors', workspaceUI && 'ws-icon-button')} aria-label="Disconnect GitHub" title="Disconnect GitHub">
      <Unplug className="h-3.5 w-3.5" />
    </button>
  </div>;

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-2xl border border-border/60 bg-background/85 backdrop-blur-xl shadow-lg px-3.5 py-2 text-xs text-foreground transition-all',
      workspaceUI && 'workspace-ui ws-create-mode ws-git-mode-dock',
    )}>
      {workspaceUI ? (
        <div className="ws-git-mode-heading">
          <div className="ws-git-mode-brand"><GitHubMark className="h-5 w-5" /><span>GitHub</span></div>
          {modelControls}
        </div>
      ) : (
        <>
          <GitHubMark className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-300" />
          <span className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full bg-muted font-mono text-[10px] font-semibold tracking-wide text-foreground/80 uppercase">Git Session</span>
          {modelControls}
        </>
      )}
      {!connected ? (
        <div className={workspaceUI ? 'ws-git-connect-row' : 'contents'}>
          <span className="min-w-0 flex-1 text-muted-foreground truncate">{workspaceUI ? 'Connect to choose a repository.' : 'GitHub mode is enabled.'}</span>
          {connectAction}
        </div>
      ) : (
        <div className={workspaceUI ? 'ws-git-connected-row' : 'contents'}>
          <span className="hidden sm:inline max-w-28 truncate text-muted-foreground font-mono text-[11px]">@{providerLogin || 'github'}</span>
          {repositoryPicker}
          <span className={cn('hidden text-muted-foreground sm:inline font-mono text-[11px]', workspaceUI && 'ws-git-branch')}>{selectedBranch || 'default'}</span>
          {repositoryActions}
        </div>
      )}
    </div>
  );
}
