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
      setError: (msg) => set((state) => ({ errorMessage: msg, status: msg ? 'error' : state.status })),
      setWebgpuSupported: (v) => set({ webgpuSupported: v }),
      reset: () => set({ status: 'idle', progress: 0, progressText: '', errorMessage: null }),
    }),
    {
      name: 'arc-local-ai',
      partialize: (state) => ({
        enabled: state.enabled,
        // Persist 'ready' so a refresh after a successful download keeps the
        // cached state; weights themselves live in IndexedDB via WebLLM.
        status: state.status === 'ready' ? 'ready' : 'idle',
        progress: state.status === 'ready' ? 1 : 0,
      }),
    }
  )
);
