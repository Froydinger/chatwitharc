import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** User-pickable chat models. */
export const AUTO_MODEL = 'auto';
export const FASTER_MODEL = 'gpt-5.4-nano';
export const SMARTER_MODEL = 'gpt-5.4-mini';
export const THINKING_MODEL = 'gpt-5.4';
export const DEEP_THINK_MODEL = 'gpt-5.5';

export type ChatModel = typeof AUTO_MODEL | typeof FASTER_MODEL | typeof SMARTER_MODEL | typeof THINKING_MODEL | typeof DEEP_THINK_MODEL;

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
  /** Active chat model. Defaults to Auto mode. */
  chatModel: ChatModel;
  setChatModel: (model: ChatModel) => void;
  isBoost: boolean;
  setIsBoost: (isBoost: boolean) => void;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      modelFamily: 'openai',
      setModelFamily: () => set({ modelFamily: 'openai' }),
      chatModel: AUTO_MODEL,
      setChatModel: (model) => set({ chatModel: model }),
      isBoost: false,
      setIsBoost: (isBoost) => set({ isBoost }),
    }),
    {
      name: 'arc-model-family',
      partialize: (s) => ({ modelFamily: s.modelFamily, chatModel: s.chatModel }),
    }
  )
);

import { useImageGenStore, getResolvedImageModel } from './useImageGenStore';

/**
 * Get the correct model string for a given task.
 * - Auto mode routes by task + graded complexity (0 simple → 3 very complex):
 *   most requests stay on Nano/Mini; complex ones step up to GPT-5.4, and only
 *   genuinely heavyweight ones reach GPT-5.5.
 * - An explicitly picked model is NEVER silently upgraded or downgraded —
 *   every chat-pipeline task runs exactly what the user selected.
 * - Image gen/edit are bound to the user's selected image model.
 */
export function getModelForTask(task: ModelTask, complexity: 0 | 1 | 2 | 3 = 0): string {
  const { chatModel } = useModelStore.getState();

  if (chatModel === AUTO_MODEL) {
    switch (task) {
      case 'chat':
        if (complexity >= 3) return 'gpt-5.5';
        if (complexity === 2) return 'gpt-5.4';
        if (complexity === 1) return 'gpt-5.4-mini';
        return 'gpt-5.4-nano';
      case 'code':
      case 'file-gen':
      case 'deep-chat':
        // Code, write canvases, and deep chat floor at Mini; heavy asks step up
        if (complexity >= 3) return 'gpt-5.5';
        if (complexity === 2) return 'gpt-5.4';
        return 'gpt-5.4-mini';
      case 'image-gen':
      case 'image-edit':
        return getResolvedImageModel(useModelStore.getState().isBoost);
      case 'image-analysis':
      default:
        return 'gpt-5.4-nano';
    }
  }
  
  switch (task) {
    case 'chat':
    case 'deep-chat':
      return chatModel;
    case 'image-gen':
    case 'image-edit':
      return getResolvedImageModel(useModelStore.getState().isBoost);
    case 'code':
    case 'image-analysis':
    case 'file-gen':
    default:
      return chatModel;
  }
}
