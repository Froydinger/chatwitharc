import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** User-pickable chat models. Astro is the smart router; concrete picks run exactly as selected. */
export const AUTO_MODEL = 'auto';
export const NANO_MODEL = 'gpt-5.4-nano';
export const LUNA_MODEL = 'gpt-5.6-luna';
export const TERRA_MODEL = 'gpt-5.6-terra';
export const SOL_MODEL = 'gpt-5.6-sol';

export type ChatModel = typeof AUTO_MODEL | typeof NANO_MODEL | typeof LUNA_MODEL | typeof TERRA_MODEL | typeof SOL_MODEL;

/** Map retired model ids (persisted picks, DB rows, stale clients) to current replacements. */
export const LEGACY_MODEL_MAP: Record<string, ChatModel> = {
  'gpt-5.4-mini': TERRA_MODEL,
  'gpt-5.4': SOL_MODEL,
  'gpt-5.5': SOL_MODEL,
};

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
  /** Active chat model. Defaults to Astro smart routing. */
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
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as { modelFamily?: ModelFamily; chatModel?: string };
        const mapped = state.chatModel ? LEGACY_MODEL_MAP[state.chatModel] : undefined;
        return {
          modelFamily: 'openai' as const,
          chatModel: (mapped ?? state.chatModel ?? AUTO_MODEL) as ChatModel,
        };
      },
      partialize: (s) => ({ modelFamily: s.modelFamily, chatModel: s.chatModel }),
    }
  )
);

import { useImageGenStore, getResolvedImageModel } from './useImageGenStore';

/**
 * Get the correct model string for a given task.
 * - Astro mode routes by task + graded complexity (0 simple → 3 very complex):
 *   simple chats use Nano, moderate chats use Luna, complex work uses Terra, and only heavyweight asks reach Sol.
 * - An explicitly picked model is NEVER silently upgraded or downgraded —
 *   every chat-pipeline task runs exactly what the user selected.
 * - Image gen/edit are bound to the user's selected image model.
 */
export function getModelForTask(task: ModelTask, complexity: 0 | 1 | 2 | 3 = 0): string {
  const { chatModel } = useModelStore.getState();

  if (chatModel === AUTO_MODEL) {
    switch (task) {
      case 'chat':
        if (complexity >= 3) return SOL_MODEL;
        if (complexity === 2) return TERRA_MODEL;
        if (complexity === 1) return LUNA_MODEL;
        return NANO_MODEL;
      case 'code':
      case 'file-gen':
      case 'deep-chat':
        // Code, write canvases, and deep chat floor at Terra; heavy asks step up
        if (complexity >= 3) return SOL_MODEL;
        return TERRA_MODEL;
      case 'image-gen':
      case 'image-edit':
        return getResolvedImageModel(useModelStore.getState().isBoost);
      case 'image-analysis':
      default:
        return NANO_MODEL;
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
