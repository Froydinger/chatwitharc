import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation models:
 * - gpt-image-2.5-flare: Fast "Quick" model (up to 50% lower latency, everyday generation)
 * - gpt-image-2.5-sunburst: Flagship "Pro" model (maximum fidelity, rich lighting, creative precision)
 * - gpt-image-2: Legacy fallback
 */
export type ImageModelId = 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst' | 'gpt-image-2' | 'gemini-3.1-flash-image';
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-flare';
export const PRO_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-sunburst';
export const EDIT_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-sunburst';
export const FLASH_IMAGE_MODEL: ImageModelId = 'gemini-3.1-flash-image';
export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  FLASH_IMAGE_MODEL,
];

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

export const IMAGE_MODEL_OPTIONS = [
  { id: DEFAULT_IMAGE_MODEL, label: 'Arc Image', blurb: 'Powered by GPT Image 2.5' },
  { id: FLASH_IMAGE_MODEL, label: 'Arc Image Flash', blurb: 'Powered by Nano Banana 2' },
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
  imageMode: 'image' | 'flash';
  setImageMode: (mode: 'image' | 'flash') => void;
  aspectRatio: ImageAspectRatio;
  /** Shape for edits. 'source' keeps the original image's shape. */
  editAspectRatio: EditAspectRatio;
  count: ImageCount;
  /** Pro Image toggle for Boost subscribers (uses gpt-image-2.5-sunburst). */
  proImage: boolean;
  setAspectRatio: (a: ImageAspectRatio) => void;
  setEditAspectRatio: (a: EditAspectRatio) => void;
  setCount: (c: ImageCount) => void;
  setProImage: (pro: boolean) => void;
  toggleProImage: () => void;
}

export const useImageGenStore = create<ImageGenState>()(
  persist(
    (set) => ({
      imageMode: 'image',
      setImageMode: (imageMode) => set({ imageMode: imageMode === 'flash' ? 'flash' : 'image' }),
      aspectRatio: DEFAULT_ASPECT_RATIO,
      editAspectRatio: DEFAULT_EDIT_ASPECT,
      count: 1,
      proImage: false,
      setAspectRatio: (a) => set({ aspectRatio: a }),
      setEditAspectRatio: (a) => set({ editAspectRatio: a }),
      setCount: (c) => set({ count: (c >= 1 && c <= 3 ? c : 1) as ImageCount }),
      setProImage: (pro) => set({ proImage: Boolean(pro) }),
      toggleProImage: () => set((s) => ({ proImage: !s.proImage })),
    }),
    {
      name: 'arc-image-gen-prefs',
      version: 5,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as {
          imageMode?: unknown;
          aspectRatio?: unknown;
          editAspectRatio?: unknown;
          count?: unknown;
          proImage?: unknown;
        };
        return {
          imageMode: state.imageMode === 'flash' ? 'flash' : 'image',
          aspectRatio: normalizeAspect(state.aspectRatio),
          editAspectRatio: normalizeEditAspect(state.editAspectRatio),
          count: normalizeCount(state.count),
          proImage: Boolean(state.proImage),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.imageMode = state.imageMode === 'flash' ? 'flash' : 'image';
        state.aspectRatio = normalizeAspect(state.aspectRatio);
        state.count = normalizeCount(state.count);
        state.editAspectRatio = normalizeEditAspect(state.editAspectRatio);
        state.proImage = Boolean(state.proImage);
      },
    }
  )
);

/** Captured at submission; the server validates model and shared credits. */
export function getResolvedImageModel(_isBoost?: boolean): ImageModelId {
  return useImageGenStore.getState().imageMode === 'flash' ? FLASH_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
}
export function getResolvedEditImageModel(): ImageModelId {
  return useImageGenStore.getState().imageMode === 'flash' ? FLASH_IMAGE_MODEL : EDIT_IMAGE_MODEL;
}
export function useResolvedImageModel(_isBoost?: boolean): ImageModelId {
  return useImageGenStore(state => state.imageMode === 'flash' ? FLASH_IMAGE_MODEL : DEFAULT_IMAGE_MODEL);
}
export function useEditImageModel(_isBoost?: boolean): ImageModelId {
  return useImageGenStore(state => state.imageMode === 'flash' ? FLASH_IMAGE_MODEL : EDIT_IMAGE_MODEL);
}
