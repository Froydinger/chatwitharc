import { supabase } from '@/integrations/supabase/client';

export type GitRepository = {
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
};

export type GitStatus = {
  enabled: boolean;
  connected: boolean;
  providerLogin: string | null;
  selectedRepo: string | null;
  selectedBranch: string | null;
};

async function invoke<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('git-auth', { body: { action, ...extra } });
  if (error) throw new Error(error.message || 'GitHub connection failed.');
  if (!data || data.error) throw new Error(data?.error || 'GitHub connection failed.');
  return data as T;
}

export const gitApi = {
  status: () => invoke<GitStatus>('status'),
  start: (returnPath: string) => invoke<{ authorizationUrl: string }>('start', { returnPath }),
  repositories: () => invoke<{ repositories: GitRepository[] }>('list_repositories'),
  selectRepository: (repo: string, branch: string) => invoke<GitStatus>('select_repository', { repo, branch }),
  disconnect: () => invoke<{ disconnected: boolean }>('disconnect'),
};
