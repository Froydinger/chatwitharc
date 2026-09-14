import { create } from 'zustand';
import { gitApi, type GitRepository, type GitStatus } from '@/services/git';

type GitState = GitStatus & {
  loading: boolean;
  repositories: GitRepository[];
  error: string | null;
  loadStatus: () => Promise<void>;
  connect: () => Promise<void>;
  loadRepositories: () => Promise<void>;
  selectRepository: (repo: string, branch: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

export const useGitStore = create<GitState>((set, get) => ({
  enabled: false,
  connected: false,
  providerLogin: null,
  selectedRepo: null,
  selectedBranch: null,
  loading: false,
  repositories: [],
  error: null,
  loadStatus: async () => {
    set({ loading: true, error: null });
    try {
      set({ ...(await gitApi.status()), loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'GitHub status failed.' });
    }
  },
  connect: async () => {
    set({ loading: true, error: null });
    try {
      const result = await gitApi.start(`${window.location.pathname}${window.location.search}`);
      if (result.connected) {
        set({ enabled: result.enabled !== false, connected: true, providerLogin: result.providerLogin || 'beta token', selectedRepo: result.selectedRepo || null, selectedBranch: result.selectedBranch || null, loading: false });
        return;
      }
      if (!result.authorizationUrl) throw new Error('GitHub authorization did not return a URL.');
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'GitHub connection failed.' });
      throw error;
    }
  },
  loadRepositories: async () => {
    set({ loading: true, error: null });
    try {
      const result = await gitApi.repositories();
      set({ repositories: result.repositories, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not load repositories.' });
      throw error;
    }
  },
  selectRepository: async (repo, branch) => {
    set({ loading: true, error: null });
    try {
      set({ ...(await gitApi.selectRepository(repo, branch)), loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not select repository.' });
      throw error;
    }
  },
  disconnect: async () => {
    set({ loading: true, error: null });
    try {
      await gitApi.disconnect();
      set({ connected: false, providerLogin: null, selectedRepo: null, selectedBranch: null, repositories: [], loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Could not disconnect GitHub.' });
      throw error;
    }
  },
}));
