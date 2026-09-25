import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, GitBranch, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { gitApi, type GitRepository, type GitStatus } from '@/services/git';
import { createAppBuilderDraftPullRequest, type AppBuilderGitHandoffResult } from '@/services/appBuilderGitHandoff';

interface AppBuilderGitHandoffProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  demo: boolean;
  exporting: boolean;
  onExport: () => void;
  onPrepareHandoff: () => Promise<void>;
  targetPlatform: string;
  onTargetPlatformChange: (value: string) => void;
  targetDatabase: string;
  onTargetDatabaseChange: (value: string) => void;
  handoffText: string;
}

export function AppBuilderGitHandoff({
  open,
  onOpenChange,
  projectId,
  demo,
  exporting,
  onExport,
  onPrepareHandoff,
  targetPlatform,
  onTargetPlatformChange,
  targetDatabase,
  onTargetDatabaseChange,
  handoffText,
}: AppBuilderGitHandoffProps) {
  const [connection, setConnection] = useState<GitStatus | null>(null);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AppBuilderGitHandoffResult | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('appBuilderGit') !== '1') return;
    url.searchParams.delete('appBuilderGit');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    onOpenChange(true);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setResult(null);
    void (async () => {
      const status = await gitApi.status();
      if (cancelled) return;
      setConnection(status);
      if (!status.enabled || !status.connected) {
        setRepositories([]);
        setSelectedRepo('');
        return;
      }
      const repoResult = await gitApi.repositories();
      if (cancelled) return;
      setRepositories(repoResult.repositories);
      const allowed = status.repoAccessMode === 'selected'
        ? repoResult.repositories.filter(repo => status.allowedRepos.includes(repo.full_name))
        : repoResult.repositories;
      const preferred = allowed.find(repo => repo.full_name === status.selectedRepo) || allowed[0];
      setSelectedRepo(preferred?.full_name || '');
    })().catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the GitHub connection.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const availableRepositories = useMemo(() => {
    if (connection?.repoAccessMode === 'selected') {
      return repositories.filter(repo => connection.allowedRepos.includes(repo.full_name));
    }
    return repositories;
  }, [connection, repositories]);

  const selectedRepository = availableRepositories.find(repo => repo.full_name === selectedRepo) || null;

  const connectGitHub = async () => {
    setConnecting(true);
    setError('');
    try {
      const returnPath = window.location.pathname + '?appBuilderGit=1';
      const response = await gitApi.start(returnPath);
      if (response.authorizationUrl) {
        window.location.assign(response.authorizationUrl);
        return;
      }
      if (response.connected) {
        const status = await gitApi.status();
        setConnection(status);
        const repoResult = await gitApi.repositories();
        setRepositories(repoResult.repositories);
        const allowed = status.repoAccessMode === 'selected'
          ? repoResult.repositories.filter(repo => status.allowedRepos.includes(repo.full_name))
          : repoResult.repositories;
        setSelectedRepo(allowed[0]?.full_name || '');
      } else {
        setError('GitHub did not finish connecting. Try again.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GitHub connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const createDraft = async () => {
    if (!selectedRepository || demo) return;
    setCreating(true);
    setError('');
    setResult(null);
    try {
      await onPrepareHandoff();
      const created = await createAppBuilderDraftPullRequest({
        projectId,
        repo: selectedRepository.full_name,
        targetPlatform,
        targetDatabase,
      });
      setResult(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The draft pull request could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(handoffText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the handoff prompt. Select and copy the text below.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="app-builder-git-title">
      <div className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#111211] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="app-builder-git-title" className="text-base font-semibold">Continue this app in Git</p>
            <p className="mt-1 text-xs text-white/45">Choose a repository to open a draft pull request from the saved app.</p>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full p-1.5 text-white/45 hover:bg-white/10" aria-label="Close Git handoff">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-[10px] text-white/45">
            Hosting platform
            <select value={targetPlatform} onChange={event => onTargetPlatformChange(event.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-[#191a19] px-3 text-xs text-white">
              <option>Netlify</option><option>Vercel</option><option>Cloudflare Pages</option><option>Other</option>
            </select>
          </label>
          <label className="space-y-1.5 text-[10px] text-white/45">
            Data and sign-in
            <select value={targetDatabase} onChange={event => onTargetDatabaseChange(event.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-[#191a19] px-3 text-xs text-white">
              <option>Arc app database</option><option>Supabase</option><option>Netlify DB</option><option>None</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-amber-100/10 bg-amber-50/[0.035] p-3.5">
          <p className="text-[11px] font-medium text-amber-100/85">Hosting changes when you move to Git</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/55">
            The askarc.chat link is only for the App Builder version. The Git version will not be hosted there. You or your developer will connect the repository to your own {targetPlatform} account, wire up deploy settings, and review any database or sign-in changes.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5">
          {demo ? (
            <p className="text-xs text-white/45">Connect GitHub from a saved app to create a draft pull request.</p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-xs text-white/45"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Checking GitHub access…</p>
          ) : !connection?.enabled ? (
            <div className="space-y-2">
              <p className="text-xs text-white/55">Git integration is not enabled for this account.</p>
              <p className="text-[10px] text-white/35">You can still download the ZIP and copy the setup prompt below.</p>
            </div>
          ) : !connection.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs text-white/75">GitHub is not connected</p><p className="mt-1 text-[10px] text-white/35">Arc uses your existing encrypted GitHub connection.</p></div>
              <Button onClick={() => void connectGitHub()} disabled={connecting} className="h-9 rounded-full bg-white px-3.5 text-[10px] text-black hover:bg-white/90">
                {connecting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-1.5 h-3.5 w-3.5" />}
                {connecting ? 'Connecting…' : 'Connect GitHub'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-white/45">Connected as <span className="font-medium text-white/75">@{connection.providerLogin || 'GitHub'}</span></p>
                <p className="text-[9px] text-white/30">{connection.repoAccessMode === 'selected' ? 'Selected repositories only' : 'All connected repositories'}</p>
              </div>
              {availableRepositories.length ? (
                <>
                  <label className="block space-y-1.5 text-[10px] text-white/45">
                    Repository
                    <select value={selectedRepo} onChange={event => { setSelectedRepo(event.target.value); setResult(null); }} className="h-10 w-full rounded-xl border border-white/10 bg-[#191a19] px-3 text-xs text-white">
                      {availableRepositories.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
                    </select>
                  </label>
                  {selectedRepository && <p className="text-[10px] text-white/35">Draft branch will target the repository default branch: <span className="font-mono text-white/55">{selectedRepository.default_branch}</span></p>}
                  <p className="text-[10px] leading-relaxed text-white/40">Arc opens a draft PR from a new branch and never writes directly to the base branch or deploys this Git version. Files at matching paths in the selected repository may be replaced in that branch, so review overlaps before merging.</p>
                  <Button onClick={() => void createDraft()} disabled={creating || !selectedRepository} className="h-10 w-full rounded-xl bg-white text-xs font-semibold text-black hover:bg-white/90">
                    {creating ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-2 h-3.5 w-3.5" />}
                    {creating ? 'Saving app and opening draft…' : 'Create draft pull request'}
                  </Button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-white/45">
                  No repositories are available under the current access setting. Add this repository in Settings → GitHub Integration, or change the selected-repository restriction.
                </p>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="mt-3 rounded-xl border border-emerald-200/10 bg-emerald-100/[0.04] p-3.5">
            <p className="flex items-center gap-2 text-xs font-medium text-emerald-100/85"><Check className="h-3.5 w-3.5" />Draft pull request created</p>
            <p className="mt-1 text-[10px] text-white/40">{result.repo} · <span className="font-mono">{result.branch}</span></p>
            <a href={result.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-100/80 underline underline-offset-2">
              Review draft on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200/10 bg-red-100/[0.04] px-3 py-2 text-[10px] leading-relaxed text-red-100/70">{error}</p>}

        <Textarea readOnly value={handoffText} rows={5} className="mt-4 resize-none border-white/10 bg-black/25 font-mono text-[10px] leading-relaxed text-white/55" />
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onExport} disabled={exporting} className="text-white/55">{exporting ? 'Preparing ZIP…' : 'Download code ZIP'}</Button>
          <Button onClick={() => void copyPrompt()} className="bg-white text-black hover:bg-white/90">{copied ? <Check className="mr-2 h-4 w-4" /> : null}{copied ? 'Prompt copied' : 'Copy handoff prompt'}</Button>
        </div>
      </div>
    </div>
  );
}
