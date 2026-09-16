import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** Luna is the only user-facing text/reasoning model for now. */
export const LUNA_MODEL = 'gpt-5.6-luna';
export type ChatModel = typeof LUNA_MODEL;
export type LunaReasoningEffort = 'low' | 'medium' | 'high';
export type LunaReasoningSelection = 'auto' | LunaReasoningEffort;

/** Map every retired or stale chat-model id to Luna without breaking old clients. */
export const LEGACY_MODEL_MAP: Record<string, ChatModel> = {
  auto: LUNA_MODEL,
  'gpt-5.4-nano': LUNA_MODEL,
  'gpt-5.4-mini': LUNA_MODEL,
  'gpt-5.4': LUNA_MODEL,
  'gpt-5.5': LUNA_MODEL,
  'gpt-5.6-terra': LUNA_MODEL,
  'gpt-5.6-sol': LUNA_MODEL,
};

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
  chatModel: ChatModel;
  /** Kept for existing callers; every value normalizes to Luna. */
  setChatModel: (model: string) => void;
  reasoningEffort: LunaReasoningSelection;
  setReasoningEffort: (effort: LunaReasoningSelection) => void;
  isBoost: boolean;
  setIsBoost: (isBoost: boolean) => void;
}

const VALID_REASONING_SELECTIONS = new Set<LunaReasoningSelection>(['auto', 'low', 'medium', 'high']);

export function getModelDisplayName(selection: LunaReasoningSelection): string {
  switch (selection) {
    case 'low': return 'Flo';
    case 'medium': return 'Cora';
    case 'high': return 'Reese';
    case 'auto': default: return 'Auto';
  }
}

export function resolveReasoningEffort(
  selection: LunaReasoningSelection,
  complexity: 0 | 1 | 2 | 3 = 0,
): LunaReasoningEffort {
  if (selection !== 'auto') return selection;
  if (complexity >= 3) return 'high';
  if (complexity >= 2) return 'medium';
  return 'low';
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      modelFamily: 'openai',
      setModelFamily: () => set({ modelFamily: 'openai' }),
      chatModel: LUNA_MODEL,
      setChatModel: () => set({ chatModel: LUNA_MODEL }),
      reasoningEffort: 'auto',
      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      isBoost: false,
      setIsBoost: (isBoost) => set({ isBoost }),
    }),
    {
      name: 'arc-model-family',
      version: 4,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as { reasoningEffort?: string };
        const reasoningEffort = VALID_REASONING_SELECTIONS.has(state.reasoningEffort as LunaReasoningSelection)
          ? state.reasoningEffort as LunaReasoningSelection
          : 'auto';
        return {
          modelFamily: 'openai' as const,
          chatModel: LUNA_MODEL,
          reasoningEffort,
        };
      },
      partialize: (state) => ({
        modelFamily: state.modelFamily,
        chatModel: LUNA_MODEL,
        reasoningEffort: state.reasoningEffort,
      }),
    }
  )
);

import { useImageGenStore, getResolvedImageModel } from './useImageGenStore';

export function getModelForTask(task: ModelTask, _complexity: 0 | 1 | 2 | 3 = 0): string {
  if (task === 'image-gen') {
    return 'gpt-image-2.5-flare';
  }
  if (task === 'image-edit') {
    return 'gpt-image-2.5-sunburst';
  }
  return LUNA_MODEL;
}
