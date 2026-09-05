import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** All generation and edits use GPT Image 2 at medium quality. */
export type ImageModelId = 'gpt-image-2';
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-2';
export const EDIT_IMAGE_MODEL: ImageModelId = 'gpt-image-2';
export const ALLOWED_IMAGE_MODELS: ImageModelId[] = ['gpt-image-2'];

export type ImageAspectRatio = '1:1' | '3:2' | '2:3' | '16:9';

/** What you get before picking anything. */
export const DEFAULT_ASPECT_RATIO: ImageAspectRatio = '3:2';

/**
 * Edits carry their own shape choice, defaulting to "source" — keep whatever
 * the image being edited already is. Sharing the generation aspect here would
 * restretch a square image to landscape just because that's the gen default.
 */
export type EditAspectRatio = 'source' | ImageAspectRatio;
export const DEFAULT_EDIT_ASPECT: EditAspectRatio = 'source';

export const EDIT_ASPECT_OPTIONS: Array<{ id: EditAspectRatio; label: string }> = [
  { id: 'source', label: 'Match original' },
  { id: '1:1', label: 'Square' },
  { id: '3:2', label: 'Landscape' },
  { id: '2:3', label: 'Portrait' },
  { id: '16:9', label: '16:9 (YouTube)' },
];

export const IMAGE_MODEL_OPTIONS: Array<{ id: ImageModelId; label: string; blurb: string; pro?: boolean }> = [
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
  return DEFAULT_ASPECT_RATIO;
}

function normalizeEditAspect(value: unknown): EditAspectRatio {
  if (value === 'source') return 'source';
  if (VALID_ASPECTS.includes(value as ImageAspectRatio)) return value as ImageAspectRatio;
  return DEFAULT_EDIT_ASPECT;
}

function normalizeCount(value: unknown): ImageCount {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > MAX_IMAGE_COUNT) return 1;
  return n as ImageCount;
}

interface ImageGenState {
  aspectRatio: ImageAspectRatio;
  /** Shape for edits. 'source' keeps the original image's shape. */
  editAspectRatio: EditAspectRatio;
  count: ImageCount;
  setAspectRatio: (a: ImageAspectRatio) => void;
  setEditAspectRatio: (a: EditAspectRatio) => void;
  setCount: (c: ImageCount) => void;
}

export const useImageGenStore = create<ImageGenState>()(
  persist(
    (set) => ({
      aspectRatio: DEFAULT_ASPECT_RATIO,
      editAspectRatio: DEFAULT_EDIT_ASPECT,
      count: 1,
      setAspectRatio: (a) => set({ aspectRatio: a }),
      setEditAspectRatio: (a) => set({ editAspectRatio: a }),
      setCount: (c) => set({ count: (c >= 1 && c <= 3 ? c : 1) as ImageCount }),
    }),
    {
      name: 'arc-image-gen-prefs',
      version: 3,
      migrate: (persisted: unknown) => {
        // Discard legacy model/Quick choices while preserving valid preferences.
        const state = (persisted ?? {}) as { aspectRatio?: unknown; editAspectRatio?: unknown; count?: unknown };
        return {
          aspectRatio: normalizeAspect(state.aspectRatio),
          editAspectRatio: normalizeEditAspect(state.editAspectRatio),
          count: normalizeCount(state.count),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.aspectRatio = normalizeAspect(state.aspectRatio);
        state.count = normalizeCount(state.count);
        state.editAspectRatio = normalizeEditAspect(state.editAspectRatio);
      },
    }
  )
);

/** Resolve the generation model in non-React code (e.g. Zustand store getters). */
export function getResolvedImageModel(_isBoost?: boolean): ImageModelId {
  return DEFAULT_IMAGE_MODEL;
}

/** React hook for the model used by *initial generation*. */
export function useResolvedImageModel(): ImageModelId {
  return DEFAULT_IMAGE_MODEL;
}

/**
 * The model used for edits is always GPT Image 2.
 */
export function useEditImageModel(): ImageModelId {
  return EDIT_IMAGE_MODEL;
}
