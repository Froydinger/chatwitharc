import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'gemini';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

const MODEL_MAP: Record<ModelFamily, Record<ModelTask, string>> = {
  gemini: {
    'chat': 'google/gemini-3-flash-preview',
    'code': 'google/gemini-3.5-flash',
    'deep-chat': 'google/gemini-3.5-flash',
    'image-gen': 'google/gemini-3.1-flash-image-preview',
    'image-analysis': 'google/gemini-3.5-flash',
    'image-edit': 'google/gemini-3.1-flash-image-preview',
    'file-gen': 'google/gemini-3.5-flash',
  },
};

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      modelFamily: 'gemini',
      setModelFamily: () => set({ modelFamily: 'gemini' }),
    }),
    { name: 'arc-model-family' }
  )
);

/** Get the correct model string for a given task. Always Gemini. */
export function getModelForTask(task: ModelTask): string {
  return MODEL_MAP.gemini[task];
}
