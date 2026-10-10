import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ARC_LUNA, ARC_SOL, ARC_ASTRA, normalizeArcModelSelection, resolveArcModelRoute, type ArcModelSelection, type ArcReasoningEffort, type ArcModelTask } from '../../supabase/functions/_shared/arcModelRouting';
export type { ArcModelSelection } from '../../supabase/functions/_shared/arcModelRouting';
import { getResolvedImageModel, getResolvedEditImageModel } from './useImageGenStore';

export type ModelFamily = 'openai';
export type ModelTask = 'chat' | 'write' | 'search' | 'analysis' | 'file' | 'code' | 'deep-chat' | 'image-gen' | 'image-analysis' | 'image-edit' | 'file-gen';
export const LUNA_MODEL = ARC_LUNA;
export const SOL_MODEL = ARC_SOL;
export const ASTRA_MODEL = ARC_ASTRA;
export type ChatModel = typeof LUNA_MODEL | typeof SOL_MODEL | typeof ASTRA_MODEL;
export type LunaReasoningEffort = ArcReasoningEffort;
/** Compatibility input only. Retired effort/Think/Flynn choices normalize to Auto. */
export type LunaReasoningSelection = ArcModelSelection | 'flynn' | LunaReasoningEffort;

export function normalizeModelSelection(value: unknown): ArcModelSelection {
  return normalizeArcModelSelection(value);
}

/** Icons are presentation only. The server verifies entitlement on every request. */
export function canSelectAstra(hasVerifiedBoost: boolean, isAdmin: boolean, loading = false): boolean {
  return (hasVerifiedBoost === true || isAdmin === true) && !loading;
}

export function getModelDisplayName(selection: unknown): string {
  switch (selection) {
    case LUNA_MODEL: return 'GPT 6 Luna';
    case SOL_MODEL: return 'GPT 6.1 Sol';
    case ASTRA_MODEL: return 'GPT 6 Astra';
    default: return 'Auto';
  }
}

/** Historical replies retain the exact provider/model that actually answered. */
export function getRecordedModelDisplayName(model: string | undefined): string {
  if (!model) return 'Arc';
  if (model === LUNA_MODEL || model === SOL_MODEL || model === ASTRA_MODEL) return getModelDisplayName(model);
  if (model === 'gemini-3.8-flash') return 'Gemini Flash';
  const historical: Record<string, string> = {
    'gpt-6-sol': 'GPT 6 Sol', 'gpt-5.6-luna': 'GPT 5.6 Luna',
    'gpt-5.6-sol': 'GPT 5.6 Sol', 'gpt-5.6-terra': 'GPT 5.6 Terra',
    'gpt-5.5': 'GPT 5.5', 'gpt-5.4': 'GPT 5.4',
    'gpt-5.4-mini': 'GPT 5.4 Mini', 'gpt-5.4-nano': 'GPT 5.4 Nano',
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  };
  return historical[model] || model;
}

interface ModelStore {
  modelFamily: ModelFamily;
  setModelFamily: (family: ModelFamily) => void;
  chatModel: ChatModel;
  setChatModel: (model: string) => void;
  modelSelection: ArcModelSelection;
  setModelSelection: (selection: ArcModelSelection) => void;
  /** Compatibility mirror for already captured/queued clients. */
  reasoningEffort: LunaReasoningSelection;
  setReasoningEffort: (selection: LunaReasoningSelection) => void;
  isBoost: boolean;
  setIsBoost: (isBoost: boolean) => void;
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
}

function selectionState(value: unknown) {
  const modelSelection = normalizeModelSelection(value);
  return { modelFamily: 'openai' as const, modelSelection, reasoningEffort: modelSelection,
    chatModel: modelSelection === 'auto' ? LUNA_MODEL : modelSelection };
}

export function migrateModelPreferences(persisted: unknown) {
  const state = persisted && typeof persisted === 'object' ? persisted as Record<string, unknown> : {};
  // Do not read legacy chatModel: it was a fixed internal default, not a choice.
  return selectionState(state.modelSelection ?? state.reasoningEffort);
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      ...selectionState('auto'),
      setModelFamily: () => set({ modelFamily: 'openai' }),
      setChatModel: (model) => set(selectionState(model)),
      setModelSelection: (selection) => set(selectionState(selection)),
      setReasoningEffort: (selection) => set(selectionState(selection)),
      isBoost: false,
      setIsBoost: (isBoost) => set({ isBoost }),
      isAdmin: false,
      setIsAdmin: (isAdmin) => set({ isAdmin }),
    }),
    {
      name: 'arc-model-family',
      version: 9,
      migrate: migrateModelPreferences,
      merge: (persisted, current) => ({ ...current, ...migrateModelPreferences(persisted) }),
      partialize: (state) => ({ modelSelection: state.modelSelection }),
    },
  ),
);

/** Preview only. The server's authenticated resolver always owns the final route. */
export function getModelRoute(selection: unknown, task: ModelTask = 'chat', complexity: 0 | 1 | 2 | 3 = 0) {
  const actualTask: ArcModelTask = task === 'deep-chat' || task === 'image-gen' || task === 'image-edit'
    ? 'chat' : task === 'image-analysis' ? 'analysis' : task === 'file-gen' ? 'file' : task;
  const { isBoost, isAdmin } = useModelStore.getState();
  return resolveArcModelRoute({ selection: normalizeModelSelection(selection), task: actualTask, complexity, hasBoost: isBoost, isAdmin });
}

/** Legacy helper retained for old code paths; new calls carry modelSelection. */
export function resolveReasoningEffort(selection: LunaReasoningSelection, complexity: 0 | 1 | 2 | 3 = 0, _hasBoost = false): LunaReasoningEffort {
  return getModelRoute(selection, 'chat', complexity).effort;
}

export function getModelForTask(task: ModelTask, complexity: 0 | 1 | 2 | 3 = 0, selection = useModelStore.getState().modelSelection): string {
  if (task === 'image-gen') return getResolvedImageModel();
  if (task === 'image-edit') return getResolvedEditImageModel();
  return getModelRoute(selection, task, complexity).model;
}
