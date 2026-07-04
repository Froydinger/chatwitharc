import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation uses OpenAI GPT-Image-2 exclusively at medium quality.
 * Aspect ratio is chosen by the user and mapped to a supported size server-side.
 */
export type ImageModelId = 'gpt-image-1' | 'gpt-image-1-mini' | 'gpt-image-2';

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-1';

export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-2',
];

export type ImageAspectRatio = '1:1' | '3:2' | '2:3' | '16:9';

export const IMAGE_MODEL_OPTIONS: Array<{ id: ImageModelId; label: string; blurb: string; pro?: boolean }> = [
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1 (Default)',
    blurb: 'Balanced quality · Free standard (10/day)',
  },
  {
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    blurb: 'Fast & lightweight · Free budget (40/day)',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2 (Premium)',
    blurb: 'Ultra high-fidelity detail (3 free/day · Boost: 20/day)',
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

interface ImageGenState {
  model: ImageModelId;
  aspectRatio: ImageAspectRatio;
  count: ImageCount;
  setModel: (m: ImageModelId) => void;
  setAspectRatio: (a: ImageAspectRatio) => void;
  setCount: (c: ImageCount) => void;
}

export const useImageGenStore = create<ImageGenState>()(
  persist(
    (set) => ({
      model: DEFAULT_IMAGE_MODEL,
      aspectRatio: '1:1',
      count: 1,
      setModel: (m) =>
        set({ model: ALLOWED_IMAGE_MODELS.includes(m) ? m : DEFAULT_IMAGE_MODEL }),
      setAspectRatio: (a) => set({ aspectRatio: a }),
      setCount: (c) => set({ count: (c >= 1 && c <= 3 ? c : 1) as ImageCount }),
    }),
    {
      name: 'arc-image-gen-prefs',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!ALLOWED_IMAGE_MODELS.includes(state.model)) {
          state.model = DEFAULT_IMAGE_MODEL;
        }
        const validAspects: ImageAspectRatio[] = ['1:1', '3:2', '2:3', '16:9'];
        if (!validAspects.includes(state.aspectRatio)) {
          const portrait = ['3:4', '9:16'];
          const widescreen = ['21:9'];
          const legacy = state.aspectRatio as string;
          state.aspectRatio = widescreen.includes(legacy)
            ? '16:9'
            : portrait.includes(legacy)
              ? '2:3'
              : legacy === '4:3'
                ? '3:2'
                : '1:1';
        }
        if (!state.count || state.count < 1 || state.count > 6) {
          state.count = 1;
        }
      },
    }
  )
);
