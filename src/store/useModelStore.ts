import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** Luna is the default user-facing text/reasoning model. */
export const LUNA_MODEL = 'gpt-6-luna';
export const SOL_MODEL = 'gpt-6.1-sol';
export const FLYNN_MODEL = 'gemini-3.8-flash';
export type ChatModel = typeof LUNA_MODEL;
export type LunaReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type LunaReasoningSelection = 'auto' | 'flynn' | LunaReasoningEffort;

/** Map every retired or stale chat-model id to Luna without breaking old clients. */
export const LEGACY_MODEL_MAP: Record<string, ChatModel> = {
  auto: LUNA_MODEL,
  'gpt-5.4-nano': LUNA_MODEL,
  'gpt-5.4-mini': LUNA_MODEL,
  'gpt-5.4': LUNA_MODEL,
  'gpt-5.5': LUNA_MODEL,
  'gpt-5.6-luna': LUNA_MODEL,
  'gpt-5.6-terra': LUNA_MODEL,
  'gpt-5.6-sol': LUNA_MODEL,
  'gpt-6-sol': LUNA_MODEL,
  'gemini-3.5-flash-lite': LUNA_MODEL,
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

const VALID_REASONING_SELECTIONS = new Set<LunaReasoningSelection>(['auto', 'none', 'low', 'medium', 'high', 'flynn']);

/** Picker visibility only; authenticated server checks remain authoritative. */
export function canSelectFlynn(user: { id?: string; is_anonymous?: boolean } | null, _hasBoost: boolean): boolean {
  return Boolean(user?.id && !user.is_anonymous);
}

export function getModelDisplayName(selection: LunaReasoningSelection): string {
  switch (selection) {
    case 'low': return 'Arc Think';
    case 'medium': return 'Arc Think';
    case 'high': return 'Arc Think';
    case 'flynn': return 'Arc Flash';
    case 'auto': default: return 'Arc Think';
  }
}

export function resolveReasoningEffort(
  selection: LunaReasoningSelection,
  complexity: 0 | 1 | 2 | 3 = 0,
  canUseRiver = useModelStore.getState().isBoost,
): LunaReasoningEffort {
  if (selection === 'flynn') return 'low';
  if (selection !== 'auto') return selection;
  if (complexity >= 3) return canUseRiver ? 'high' : 'medium';
  if (complexity >= 2) return 'medium';
  return complexity === 0 ? 'none' : 'low';
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
      version: 8,
      migrate: (persisted: unknown) => {
        void persisted;
        // Reset existing chat selections once for the Arc Think default rollout.
        const reasoningEffort: LunaReasoningSelection = 'auto';
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

import { getResolvedImageModel, getResolvedEditImageModel } from './useImageGenStore';

export function getModelForTask(task: ModelTask, _complexity: 0 | 1 | 2 | 3 = 0): string {
  if (task === 'image-gen') {
    return getResolvedImageModel();
  }
  if (task === 'image-edit') {
    return getResolvedEditImageModel();
  }
  // Code, canvas, file generation, image analysis, and regular chat all use Luna.
  if (task === 'code' || task === 'file-gen' || task === 'image-analysis') {
    return LUNA_MODEL;
  }
  return LUNA_MODEL;
}
