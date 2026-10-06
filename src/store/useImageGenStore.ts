import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation models:
 * - gpt-image-2.5-flare: Fast "Quick" model (up to 50% lower latency, everyday generation)
 * - gpt-image-2.5-sunburst: Flagship "Pro" model (maximum fidelity, rich lighting, creative precision)
 * - gpt-image-2: Legacy fallback
 */
export type ImageModelId = 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst' | 'gpt-image-2' | 'gemini-3.1-flash-image' | 'gemini-3.1-flash-lite-image';
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-flare';
export const PRO_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-sunburst';
export const EDIT_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-flare';
export const LITE_IMAGE_MODEL: ImageModelId = 'gemini-3.1-flash-lite-image';
export const FLASH_IMAGE_MODEL: ImageModelId = 'gemini-3.1-flash-image';
export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  FLASH_IMAGE_MODEL,
  LITE_IMAGE_MODEL,
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
 { id: DEFAULT_IMAGE_MODEL, mode: 'low', label: 'GPT 2.5 Flare', blurb: 'Fast GPT images', boostOnly: false },
 { id: DEFAULT_IMAGE_MODEL, mode: 'image', label: 'GPT 2.5 Flare HQ', blurb: 'GPT images with more detail', boostOnly: true },
 { id: PRO_IMAGE_MODEL, mode: 'pro', label: 'GPT 2.5 Sunburst', blurb: 'High fidelity GPT images', boostOnly: true },
 { id: LITE_IMAGE_MODEL, mode: 'lite', label: 'Nano Banana 2 Lite', blurb: 'Fast native 1K images', boostOnly: true },
 { id: FLASH_IMAGE_MODEL, mode: 'flash', label: 'Nano Banana 2', blurb: 'Native 1K images', boostOnly: true },
] as const;
export type ImageMode = typeof IMAGE_MODEL_OPTIONS[number]['mode'];
const normalizeMode = (mode: unknown): ImageMode => IMAGE_MODEL_OPTIONS.some(x => x.mode === mode) ? mode as ImageMode : 'low';
export function imageCreditCost(model: string, aspect: string, quality: string = 'medium') {
 if (model === LITE_IMAGE_MODEL) return 3;
 if (model === FLASH_IMAGE_MODEL) return 5;
 if (model === PRO_IMAGE_MODEL) return aspect === '1:1' ? 4 : 6;
 return quality === 'low' || aspect === '1:1' ? 1 : 2;
}

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
  imageMode: ImageMode;
  setImageMode: (mode: ImageMode) => void;
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
      imageMode: 'low',
      setImageMode: (imageMode) => set({ imageMode: normalizeMode(imageMode) }),
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
      version: 6,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as {
          imageMode?: unknown;
          aspectRatio?: unknown;
          editAspectRatio?: unknown;
          count?: unknown;
          proImage?: unknown;
        };
        return {
          imageMode: normalizeMode(state.imageMode),
          aspectRatio: normalizeAspect(state.aspectRatio),
          editAspectRatio: normalizeEditAspect(state.editAspectRatio),
          count: normalizeCount(state.count),
          proImage: Boolean(state.proImage),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.imageMode = normalizeMode(state.imageMode);
        state.aspectRatio = normalizeAspect(state.aspectRatio);
        state.count = normalizeCount(state.count);
        state.editAspectRatio = normalizeEditAspect(state.editAspectRatio);
        state.proImage = Boolean(state.proImage);
      },
    }
  )
);

/** Captured at submission; server validates actual tier and configuration. */
function resolvedModel(mode: ImageMode, isBoost = true): ImageModelId {
 if (!isBoost) return DEFAULT_IMAGE_MODEL;
 return IMAGE_MODEL_OPTIONS.find(x => x.mode === mode)?.id ?? DEFAULT_IMAGE_MODEL;
}
export function getResolvedImageModel(isBoost = true): ImageModelId { return resolvedModel(useImageGenStore.getState().imageMode, isBoost); }
export function getResolvedEditImageModel(isBoost = true): ImageModelId { return getResolvedImageModel(isBoost); }
export function useResolvedImageModel(isBoost = true): ImageModelId { return useImageGenStore(state => resolvedModel(state.imageMode, isBoost)); }
export function useEditImageModel(isBoost = true): ImageModelId { return useResolvedImageModel(isBoost); }
