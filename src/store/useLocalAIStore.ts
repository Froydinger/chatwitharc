import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LocalAIStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LocalAIState {
  // User preference: route to local when possible
  enabled: boolean;
  setEnabled: (v: boolean) => void;

  // Runtime state
  status: LocalAIStatus;
  progress: number; // 0-1
  progressText: string;
  errorMessage: string | null;
  webgpuSupported: boolean | null;

  // Actions
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

      status: 'idle',
      progress: 0,
      progressText: '',
      errorMessage: null,
      webgpuSupported: null,

      setStatus: (s) => set({ status: s }),
      setProgress: (p, text) =>
        set((state) => ({ progress: p, progressText: text ?? state.progressText })),
      setError: (msg) => set({ errorMessage: msg, status: msg ? 'error' : 'idle' }),
      setWebgpuSupported: (v) => set({ webgpuSupported: v }),
      reset: () => set({ status: 'idle', progress: 0, progressText: '', errorMessage: null }),
    }),
    {
      name: 'arc-local-ai',
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
);
