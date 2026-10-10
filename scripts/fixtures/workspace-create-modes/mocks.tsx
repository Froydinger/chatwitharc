import { create } from 'zustand';

export const useQaState = create<{
  hasBoost: boolean; isAdmin: boolean; failure: boolean; events: string[];
  record: (text: string) => void;
}>((set) => ({
  hasBoost: true, isAdmin: false, failure: false, events: [],
  record: text => set(state => ({ events: [...state.events, text].slice(-8) })),
}));
const record = (text: string) => useQaState.getState().record(text);
export const useAuth = () => ({ user: { id: 'offline-fixture-owner', is_anonymous: false }, loading: false });
export const useSubscription = () => ({
  hasBoost: useQaState(state => state.hasBoost || state.isAdmin),
  hasVerifiedBoost: useQaState(state => state.hasBoost),
  isAdmin: useQaState(state => state.isAdmin),
  isVerifiedModelAdmin: useQaState(state => state.isAdmin), loading: false,
  openCheckout: () => record('Checkout blocked in this offline fixture'),
});
export const useToast = () => ({ toast: (value: { title: string; description?: string }) => record(`${value.title}: ${value.description || ''}`) });
export const supabase = null;
export const isSupabaseConfigured = false;
export const getModelForTask = () => 'fixture-only-no-model-call';
// The real local preference store and pure entitlement guard make picker UI
// faithful without connecting auth, billing, or a model provider.
export { useModelStore, ASTRA_MODEL, canSelectAstra } from '../../../src/store/useModelStore';
export const CACHE_KEY_PREFIX = 'arc-create-qa-prompts-';
export const getCachedPrompts = (category: string) => [
  { label: `${category}: plan a thoughtful next step`, prompt: `Help me plan a thoughtful next step for ${category}.` },
  { label: `${category}: explore an idea`, prompt: `Explore an idea for ${category}.` },
];
export const useImageQuota = () => ({ loading: false, remainingCredits: 24, unitCost: 1 });
export async function enhancePrompt(text: string, kind: string) {
  record(`Local ${kind} preview requested`);
  await new Promise(resolve => setTimeout(resolve, 400));
  if (useQaState.getState().failure) throw new Error('Simulated retryable preview error');
  return `Offline ${kind} preview\n\n${text}\n\nNo request was sent to Arc or a model.`;
}
const repositories = [
  { full_name: 'fixture/website', default_branch: 'main' },
  { full_name: 'fixture/a-long-repository-name-for-overflow-checking', default_branch: 'development' },
];
type Repo = typeof repositories[number];
type GitFixture = {
  connected: boolean; providerLogin: string; selectedRepo: string | null; selectedBranch: string | null;
  repositories: Repo[]; loading: boolean; error: string | null; repoAccessMode: 'all' | 'selected'; allowedRepos: string[];
  loadStatus: () => Promise<void>; connect: () => Promise<void>; loadRepositories: () => Promise<void>;
  selectRepository: (repo: string, branch: string) => Promise<void>; disconnect: () => Promise<void>;
};
export const useGitStore = create<GitFixture>((set) => ({
  connected: true, providerLogin: 'fixture', selectedRepo: repositories[0].full_name, selectedBranch: 'main',
  repositories, loading: false, error: null, repoAccessMode: 'all', allowedRepos: [],
  loadStatus: async () => { record('Read local Git fixture'); },
  connect: async () => { record('Simulated connect; no login opened'); set({ connected: true }); },
  loadRepositories: async () => {
    set({ loading: true }); await new Promise(resolve => setTimeout(resolve, 400));
    if (useQaState.getState().failure) { set({ loading: false, error: 'Simulated repository error' }); throw new Error('Simulated repository error'); }
    record('Refreshed local repository fixtures'); set({ loading: false, repositories });
  },
  selectRepository: async (repo, branch) => { record(`Selected ${repo}:${branch}`); set({ selectedRepo: repo, selectedBranch: branch }); },
  disconnect: async () => { record('Disconnected local fixture only'); set({ connected: false }); },
}));
