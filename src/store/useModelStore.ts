import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'gemini' | 'gpt';
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
  gpt: {
    'chat': 'openai/gpt-5-nano',
    'code': 'openai/gpt-5.2',
    'deep-chat': 'openai/gpt-5.2',
    'image-gen': 'google/gemini-3.1-flash-image-preview',
    'image-analysis': 'openai/gpt-5.5',
    'image-edit': 'google/gemini-3.1-flash-image-preview',
    'file-gen': 'openai/gpt-5.5-pro',
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
