import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LocalAIStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LocalAIState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;

  /** When true, route everything to cloud even if a local model is ready. */
  preferCloud: boolean;
  setPreferCloud: (v: boolean) => void;

  // Which downloaded model the user wants to use ('' = none picked yet)
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;

  status: LocalAIStatus;
  progress: number;
  progressText: string;
  errorMessage: string | null;
  webgpuSupported: boolean | null;

  setStatus: (s: LocalAIStatus) => void;
  setProgress: (p: number, text?: string) => void;
  setError: (msg: string | null) => void;
  setWebgpuSupported: (v: boolean) => void;
  reset: () => void;
}

export const useLocalAIStore = create<LocalAIState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (v) => set({ enabled: v }),

      preferCloud: false,
      setPreferCloud: (v) => set({ preferCloud: v }),

      selectedModelId: '',
      setSelectedModelId: (id) => set({ selectedModelId: id }),

      status: 'idle',
      progress: 0,
      progressText: '',
      errorMessage: null,
      webgpuSupported: null,

      setStatus: (s) => set({ status: s }),
      setProgress: (p, text) =>
        set((state) => ({ progress: p, progressText: text ?? state.progressText })),
      setError: (msg) => set((state) => ({ errorMessage: msg, status: msg ? 'error' : state.status })),
      setWebgpuSupported: (v) => set({ webgpuSupported: v }),
      reset: () => set({ status: 'idle', progress: 0, progressText: '', errorMessage: null }),
    }),
    {
      name: 'arc-local-ai',
      partialize: (state) => ({
        enabled: state.enabled,
        preferCloud: state.preferCloud,
        selectedModelId: state.selectedModelId,
        // Persist 'ready' so weights remain marked-loaded across refresh.
        status: state.status === 'ready' ? 'ready' : 'idle',
        progress: state.status === 'ready' ? 1 : 0,
        progressText: state.status === 'ready' ? 'Ready' : '',
      }),
    }
  )
);
