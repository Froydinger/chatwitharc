import { useState, useEffect, useMemo } from 'react';
import { Check, Search, ExternalLink, RefreshCw, Unplug, ShieldAlert, ShieldCheck } from 'lucide-react';
import { GitHubMark } from '@/components/GitModeDock';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Input } from '@/components/ui/input';
import { useGitStore } from '@/store/useGitStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function GitHubIntegrationCard() {
  const { toast } = useToast();
  const {
    connected,
    providerLogin,
    repoAccessMode,
    allowedRepos,
    repositories,
    loading,
    loadStatus,
    connect,
    loadRepositories,
    updateRepoSettings,
    disconnect,
  } = useGitStore();

  const [mode, setMode] = useState<'all' | 'selected'>(repoAccessMode || 'all');
  const [selectedList, setSelectedList] = useState<string[]>(allowedRepos || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setMode(repoAccessMode || 'all');
    setSelectedList(allowedRepos || []);
  }, [repoAccessMode, allowedRepos]);

  useEffect(() => {
    if (connected && repositories.length === 0 && !loading) {
      void loadRepositories();
    }
  }, [connected, repositories.length, loading, loadRepositories]);

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repositories;
    const query = searchQuery.toLowerCase();
    return repositories.filter(
      (r) => r.full_name.toLowerCase().includes(query)
    );
  }, [repositories, searchQuery]);

  const handleToggleRepo = (repoFullName: string) => {
    setSelectedList((prev) =>
      prev.includes(repoFullName)
        ? prev.filter((name) => name !== repoFullName)
        : [...prev, repoFullName]
    );
  };

  const handleSelectAll = () => {
    setSelectedList(repositories.map((r) => r.full_name));
  };

  const handleClearAll = () => {
    setSelectedList([]);
  };

  const handleSaveSettings = async (targetMode = mode, targetList = selectedList) => {
    setIsSaving(true);
    try {
      await updateRepoSettings(targetMode, targetList);
      toast({
        title: 'Repository settings updated',
        description:
          targetMode === 'all'
            ? 'Arc now has access to all your repositories.'
            : `Arc is restricted to ${targetList.length} selected ${targetList.length === 1 ? 'repository' : 'repositories'}.`,
      });
    } catch (err) {
      toast({
        title: 'Failed to update settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleModeChange = (newMode: 'all' | 'selected') => {
    setMode(newMode);
    // If switching to all, auto-save immediately
    if (newMode === 'all') {
      void handleSaveSettings('all', selectedList);
    }
  };

  const isDirty =
    mode !== repoAccessMode ||
    JSON.stringify([...selectedList].sort()) !== JSON.stringify([...(allowedRepos || [])].sort());

  return (
    <GlassCard className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.12)] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/30 shrink-0">
            <GitHubMark className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">GitHub Integration</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect repositories, branch work, and manage Arc pull requests
            </p>
          </div>
        </div>

        {connected && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadRepositories()}
              disabled={loading}
              className={cn(
                'rounded-full p-2 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors',
                loading && 'animate-spin'
              )}
              title="Refresh repositories"
              aria-label="Refresh repositories"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => void disconnect()}
              disabled={loading}
              className="text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </GlassButton>
          </div>
        )}
      </div>

      {!connected ? (
        <div className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-3">
          <p className="text-sm text-foreground">
            Connect your GitHub account to let Arc inspect repositories, write code on dedicated branches, and create pull requests.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <GlassButton
              variant="default"
              size="sm"
              onClick={() => void connect()}
              disabled={loading}
              className="gap-2"
            >
              <GitHubMark className="h-4 w-4" />
              {loading ? 'Connecting…' : 'Connect GitHub'}
            </GlassButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {/* Account status */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground">Connected as</span>
                <p className="text-sm font-mono font-medium text-foreground truncate">
                  @{providerLogin || 'github'}
                </p>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium">
              Authorized
            </span>
          </div>

          {/* Repository Access Selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Repository Access
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('all')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                  mode === 'all'
                    ? 'bg-primary/10 border-primary/50 text-foreground shadow-[0_0_15px_hsl(var(--primary)/0.15)]'
                    : 'bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                )}
              >
                <ShieldCheck className={cn('h-4 w-4 mt-0.5 shrink-0', mode === 'all' ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">All Repositories</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Arc can work on any repository in your account.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('selected')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                  mode === 'selected'
                    ? 'bg-primary/10 border-primary/50 text-foreground shadow-[0_0_15px_hsl(var(--primary)/0.15)]'
                    : 'bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                )}
              >
                <ShieldAlert className={cn('h-4 w-4 mt-0.5 shrink-0', mode === 'selected' ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Specific Repositories</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Only allow Arc to access repositories you choose.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Specific repositories checklist */}
          {mode === 'selected' && (
            <div className="p-3.5 rounded-2xl border border-border/40 bg-muted/15 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs bg-background/50 border-border/40 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground flex items-center justify-between px-0.5">
                <span>
                  {selectedList.length} of {repositories.length} repositories selected
                </span>
                {repositories.length === 0 && loading && (
                  <span className="italic">Loading repositories…</span>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {filteredRepos.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {searchQuery ? 'No repositories match your search.' : 'No repositories found.'}
                  </div>
                ) : (
                  filteredRepos.map((repo) => {
                    const isSelected = selectedList.includes(repo.full_name);
                    return (
                      <div
                        key={repo.full_name}
                        onClick={() => handleToggleRepo(repo.full_name)}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all',
                          isSelected
                            ? 'bg-primary/15 border-primary/40 text-foreground font-medium'
                            : 'bg-background/40 border-border/30 text-muted-foreground hover:bg-background/70 hover:text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              'w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0',
                              isSelected
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-border/60 bg-background/50'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <span className="truncate font-mono">{repo.full_name}</span>
                          {repo.private && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              private
                            </span>
                          )}
                        </div>
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                          title="View on GitHub"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })
                )}
              </div>

              {isDirty && (
                <div className="flex justify-end pt-1">
                  <GlassButton
                    size="sm"
                    onClick={() => void handleSaveSettings('selected', selectedList)}
                    disabled={isSaving}
                    className="text-xs"
                  >
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </GlassButton>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
                💡 <span className="font-medium">Reminder:</span> If you ask Arc to work in a repository that isn't selected above, Arc will remind you to enable it here or toggle access to "All Repositories".
              </p>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
