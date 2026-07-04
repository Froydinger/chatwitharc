import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** User-pickable chat models. */
export const FASTER_MODEL = 'gpt-5.4-nano';
export const SMARTER_MODEL = 'gpt-5.4-mini';
export const THINKING_MODEL = 'gpt-5.4';
export const DEEP_THINK_MODEL = 'gpt-5.5';

export type ChatModel = typeof FASTER_MODEL | typeof SMARTER_MODEL | typeof THINKING_MODEL | typeof DEEP_THINK_MODEL;

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
  /** Active chat model. Defaults to Faster (nano). */
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
      chatModel: FASTER_MODEL,
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

import { useImageGenStore } from './useImageGenStore';

/**
 * Get the correct model string for a given task.
 * - Chat tasks follow the user's chosen chatModel (Faster/Smarter).
 * - Tool tasks follow the user's selected chat model.
 * - Image gen/edit are bound to the user's selected image model.
 */
export function getModelForTask(task: ModelTask): string {
  const { chatModel } = useModelStore.getState();
  switch (task) {
    case 'chat':
    case 'deep-chat':
      return chatModel;
    case 'image-gen':
    case 'image-edit':
      return useImageGenStore.getState().model || 'gpt-image-1';
    case 'code':
    case 'image-analysis':
    case 'file-gen':
    default:
      return chatModel;
  }
}
