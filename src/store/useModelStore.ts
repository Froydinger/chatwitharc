import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';

/** Luna is the default user-facing text/reasoning model. */
export const LUNA_MODEL = 'gpt-5.6-luna';
/**
 * Flash is Arc's fast tier, reached through Google's OpenAI-compatible endpoint.
 *
 * Deliberately Flash-Lite, not the newer full Flash line: Gemini 3 models cannot
 * turn reasoning off, and gemini-3.8-flash burned ~423 hidden thinking tokens on
 * a trivial question (2.4s) versus 0 tokens and 0.8s here. A tier called Flash
 * that is no faster than Luna has no reason to exist. Pinned to an explicit id
 * rather than the moving `gemini-flash-lite-latest` alias so Google cannot swap
 * the model out from under us. Limited to FLASH_EMAILS; every other account
 * normalizes back to Luna client- and server-side.
 */
export const FLASH_MODEL = 'gemini-3.5-flash-lite';
export const FLASH_EMAILS = new Set(['jkrd09@gmail.com', 'jakefroydinger@gmail.com']);
export function flashEnabledForEmail(email: string | null | undefined): boolean {
  return !!email && FLASH_EMAILS.has(email.toLowerCase());
}
export type ChatModel = typeof LUNA_MODEL | typeof FLASH_MODEL;
export type LunaReasoningEffort = 'low' | 'medium' | 'high';
export type LunaReasoningSelection = 'auto' | 'flash' | LunaReasoningEffort;

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

const VALID_REASONING_SELECTIONS = new Set<LunaReasoningSelection>(['auto', 'flash', 'low', 'medium', 'high']);

export function getModelDisplayName(selection: LunaReasoningSelection): string {
  switch (selection) {
    case 'flash': return 'Flash';
    case 'low': return 'Ava';
    case 'medium': return 'Maya';
    case 'high': return 'River';
    case 'auto': default: return 'Auto';
  }
}

export function resolveReasoningEffort(
  selection: LunaReasoningSelection,
  complexity: 0 | 1 | 2 | 3 = 0,
): LunaReasoningEffort {
  // Flash does its own thing with reasoning; 'low' is the closest honest label
  // for the request it produces.
  if (selection === 'flash') return 'low';
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
  // Flash is a conversational tier only. Code, canvas and file generation stay
  // on Luna, where the long single-file outputs those tools demand are proven,
  // as does image analysis.
  if (task === 'code' || task === 'file-gen' || task === 'image-analysis') {
    return LUNA_MODEL;
  }
  return useModelStore.getState().reasoningEffort === 'flash' ? FLASH_MODEL : LUNA_MODEL;
}
