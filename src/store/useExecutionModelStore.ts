import { create } from 'zustand';

export type GitExecutionMode = 'normal' | 'pro';
export type AppBuilderExecutionModel = 'fast' | 'pro';

export interface ExecutionModelChoices {
  gitModelMode: GitExecutionMode;
  appModelMode: AppBuilderExecutionModel;
}

interface ExecutionModelState extends ExecutionModelChoices {
  ownerId: string | null;
  setOwnerId: (ownerId: string | null) => void;
  setGitModelMode: (ownerId: string | null, mode: GitExecutionMode, canUsePro: boolean) => void;
  setAppModelMode: (ownerId: string | null, mode: AppBuilderExecutionModel, canUsePro: boolean) => void;
}

export const DEFAULT_EXECUTION_MODEL_CHOICES: ExecutionModelChoices = {
  gitModelMode: 'normal',
  appModelMode: 'fast',
};

export const useExecutionModelStore = create<ExecutionModelState>((set, get) => ({
  ownerId: null,
  ...DEFAULT_EXECUTION_MODEL_CHOICES,
  setOwnerId: (ownerId) => {
    if (get().ownerId === ownerId) return;
    set({ ownerId, ...DEFAULT_EXECUTION_MODEL_CHOICES });
  },
  setGitModelMode: (ownerId, mode, canUsePro) => {
    if (get().ownerId !== ownerId || (mode === 'pro' && !canUsePro)) return;
    set({ gitModelMode: mode });
  },
  setAppModelMode: (ownerId, mode, canUsePro) => {
    if (get().ownerId !== ownerId || (mode === 'pro' && !canUsePro)) return;
    set({ appModelMode: mode });
  },
}));

/**
 * Read the selected choices for the active account. A mismatch is treated as
 * a fresh account, and Pro choices are downgraded unless entitlement is known.
 */
export function getExecutionModelChoices(
  ownerId: string | null,
  canUsePro: boolean,
): ExecutionModelChoices {
  const state = useExecutionModelStore.getState();
  if (state.ownerId !== ownerId) return DEFAULT_EXECUTION_MODEL_CHOICES;

  return {
    gitModelMode: canUsePro ? state.gitModelMode : 'normal',
    appModelMode: canUsePro ? state.appModelMode : 'fast',
  };
}
