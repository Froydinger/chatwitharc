import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation uses OpenAI GPT-Image-2 exclusively at medium quality.
 * Aspect ratio is chosen by the user and mapped to a supported size server-side.
 */
export type ImageModelId = 'openai/gpt-image-2';

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'openai/gpt-image-2';

export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'openai/gpt-image-2',
];

export type ImageAspectRatio = '1:1' | '3:2' | '2:3';

export const IMAGE_MODEL_OPTIONS: Array<{ id: ImageModelId; label: string; blurb: string; pro?: boolean }> = [
  {
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    blurb: 'Best quality & detail',
  },
];

export const IMAGE_ASPECT_OPTIONS: Array<{ id: ImageAspectRatio; label: string }> = [
  { id: '1:1', label: 'Square' },
  { id: '3:2', label: 'Landscape' },
  { id: '2:3', label: 'Portrait' },
];

interface ImageGenState {
  model: ImageModelId;
  aspectRatio: ImageAspectRatio;
  setModel: (m: ImageModelId) => void;
  setAspectRatio: (a: ImageAspectRatio) => void;
}

export const useImageGenStore = create<ImageGenState>()(
  persist(
    (set) => ({
      model: DEFAULT_IMAGE_MODEL,
      aspectRatio: '1:1',
      setModel: (m) =>
        set({ model: ALLOWED_IMAGE_MODELS.includes(m) ? m : DEFAULT_IMAGE_MODEL }),
      setAspectRatio: (a) => set({ aspectRatio: a }),
    }),
    {
      name: 'arc-image-gen-prefs',
      // Migrate any unknown persisted model back to the default.
      onRehydrateStorage: () => (state) => {
        if (state && !ALLOWED_IMAGE_MODELS.includes(state.model)) {
          state.model = DEFAULT_IMAGE_MODEL;
        }
      },
    }
  )
);
