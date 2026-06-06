import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Image generation uses Nano Banana 2 (gemini-3.1-flash-image-preview) exclusively.
 */
export type ImageModelId = 'google/gemini-3.1-flash-image-preview';

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'google/gemini-3.1-flash-image-preview';

export const ALLOWED_IMAGE_MODELS: ImageModelId[] = [
  'google/gemini-3.1-flash-image-preview',
];

export type ImageAspectRatio =
  | '1:1'
  | '3:2'
  | '2:3'
  | '4:3'
  | '3:4'
  | '16:9'
  | '9:16'
  | '21:9';

export const IMAGE_MODEL_OPTIONS: Array<{ id: ImageModelId; label: string; blurb: string; pro?: boolean }> = [
  {
    id: 'google/gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    blurb: 'Best quality & detail',
  },
];

export const IMAGE_ASPECT_OPTIONS: Array<{ id: ImageAspectRatio; label: string }> = [
  { id: '1:1',  label: 'Square 1:1' },
  { id: '3:2',  label: 'Landscape 3:2' },
  { id: '2:3',  label: 'Portrait 2:3' },
  { id: '4:3',  label: 'Landscape 4:3' },
  { id: '3:4',  label: 'Portrait 3:4' },
  { id: '16:9', label: 'Wide 16:9' },
  { id: '9:16', label: 'Tall 9:16' },
  { id: '21:9', label: 'Ultrawide 21:9' },
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
