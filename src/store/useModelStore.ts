import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'gemini' | 'gpt';
export type ModelTask = 'chat' | 'code' | 'image-gen' | 'image-analysis' | 'image-edit';

const MODEL_MAP: Record<ModelFamily, Record<ModelTask, string>> = {
  gemini: {
    'chat': 'google/gemini-3-flash-preview',
    'code': 'google/gemini-3-pro-preview',
    'image-gen': 'google/gemini-3-pro-image-preview',
    'image-analysis': 'google/gemini-2.5-flash',
    'image-edit': 'google/gemini-3-pro-image-preview',
  },
  gpt: {
    'chat': 'openai/gpt-5-mini',
    'code': 'openai/gpt-5.2',
    'image-gen': 'google/gemini-3-pro-image-preview', // No GPT image gen available
    'image-analysis': 'openai/gpt-5-mini',
    'image-edit': 'google/gemini-3-pro-image-preview', // No GPT image edit available
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
      setModelFamily: (family) => set({ modelFamily: family }),
    }),
    { name: 'arc-model-family' }
  )
);

/** Get the correct model string for a given task based on current family selection */
export function getModelForTask(task: ModelTask): string {
  const family = useModelStore.getState().modelFamily;
  return MODEL_MAP[family][task];
}
