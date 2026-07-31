import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation is a two-speed choice:
 * - Quick  → GPT Image 1 Mini. Fast and cheap, generation only.
 * - Default → GPT Image 2 at medium quality. High fidelity, and the only
 *   model that can edit, so edits always force it regardless of the toggle.
 *
 * Aspect ratio is chosen by the user and mapped to a supported size server-side.
 */
export type ImageModelId = 'gpt-image-1' | 'gpt-image-1-mini' | 'gpt-image-2';

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-2';
/** Fast path for initial generation. Cannot edit. */
export const QUICK_IMAGE_MODEL: ImageModelId = 'gpt-image-1-mini';
/** Edits are GPT Image 2 only. */
export const EDIT_IMAGE_MODEL: ImageModelId = 'gpt-image-2';

export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-2',
];

export type ImageAspectRatio = '1:1' | '3:2' | '2:3' | '16:9';

export const IMAGE_MODEL_OPTIONS: Array<{ id: ImageModelId; label: string; blurb: string; pro?: boolean }> = [
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1',
    blurb: 'Legacy standard model',
  },
  {
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    blurb: 'Fast & lightweight · generation only',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2 (Default)',
    blurb: 'High-fidelity detail · generation and edits',
    pro: true,
  },
];

export const IMAGE_ASPECT_OPTIONS: Array<{ id: ImageAspectRatio; label: string }> = [
  { id: '1:1', label: 'Square' },
  { id: '3:2', label: 'Landscape' },
  { id: '2:3', label: 'Portrait' },
  { id: '16:9', label: '16:9 (YouTube)' },
];

export type ImageCount = 1 | 2 | 3;
export const MAX_IMAGE_COUNT: ImageCount = 3;

const VALID_ASPECTS: ImageAspectRatio[] = ['1:1', '3:2', '2:3', '16:9'];

/** Map any legacy or malformed aspect ratio onto a currently supported one. */
function normalizeAspect(value: unknown): ImageAspectRatio {
  const legacy = value as ImageAspectRatio;
  if (VALID_ASPECTS.includes(legacy)) return legacy;
  const raw = String(value ?? '');
  if (raw === '21:9') return '16:9';
  if (raw === '3:4' || raw === '9:16') return '2:3';
  if (raw === '4:3') return '3:2';
  return '1:1';
}

function normalizeCount(value: unknown): ImageCount {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > MAX_IMAGE_COUNT) return 1;
  return n as ImageCount;
}

interface ImageGenState {
  /** When true, initial generation uses the fast mini model. */
  quick: boolean;
  aspectRatio: ImageAspectRatio;
  count: ImageCount;
  setQuick: (q: boolean) => void;
  setAspectRatio: (a: ImageAspectRatio) => void;
  setCount: (c: ImageCount) => void;
}

export const useImageGenStore = create<ImageGenState>()(
  persist(
    (set) => ({
      quick: false,
      aspectRatio: '1:1',
      count: 1,
      setQuick: (q) => set({ quick: !!q }),
      setAspectRatio: (a) => set({ aspectRatio: a }),
      setCount: (c) => set({ count: (c >= 1 && c <= 3 ? c : 1) as ImageCount }),
    }),
    {
      name: 'arc-image-gen-prefs',
      version: 2,
      migrate: (persisted: unknown) => {
        // v1 stored a free-form `model` pick. Anyone parked on the mini model
        // carries over as Quick; everything else lands on the default. Aspect
        // and count are normalized here so the value we write back is already
        // valid, rather than relying on rehydrate to patch it in memory only.
        const state = (persisted ?? {}) as { model?: string; aspectRatio?: unknown; count?: unknown };
        return {
          quick: state.model === QUICK_IMAGE_MODEL,
          aspectRatio: normalizeAspect(state.aspectRatio),
          count: normalizeCount(state.count),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.aspectRatio = normalizeAspect(state.aspectRatio);
        state.count = normalizeCount(state.count);
      },
    }
  )
);

/** Resolve the generation model in non-React code (e.g. Zustand store getters). */
export function getResolvedImageModel(_isBoost?: boolean): ImageModelId {
  return useImageGenStore.getState().quick ? QUICK_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
}

/** React hook for the model used by *initial generation*. */
export function useResolvedImageModel(): ImageModelId {
  const quick = useImageGenStore((s) => s.quick);
  return quick ? QUICK_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
}

/**
 * The model used for *edits*. Always GPT Image 2 — the mini model can't edit,
 * so Quick never applies here.
 */
export function useEditImageModel(): ImageModelId {
  return EDIT_IMAGE_MODEL;
}
