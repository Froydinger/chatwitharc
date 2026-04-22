import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persists the user's preferred image generation model and aspect ratio.
 * Used by the image-mode dock above the chat input.
 */
export type ImageModelId =
  | 'google/gemini-3.1-flash-image-preview' // Nano Banana 2 — fast + high quality (default)
  | 'google/gemini-3-pro-image-preview'     // Nano Banana Pro — best quality, slower
  | 'google/gemini-2.5-flash-image';        // Nano Banana — original fast tier

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
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Nano Banana 2', blurb: 'Fast • Pro-level quality (default)' },
  { id: 'google/gemini-3-pro-image-preview',     label: 'Nano Banana Pro', blurb: 'Highest quality • slower', pro: true },
  { id: 'google/gemini-2.5-flash-image',         label: 'Nano Banana',     blurb: 'Classic fast tier' },
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
      model: 'google/gemini-3.1-flash-image-preview',
      aspectRatio: '1:1',
      setModel: (m) => set({ model: m }),
      setAspectRatio: (a) => set({ aspectRatio: a }),
    }),
    { name: 'arc-image-gen-prefs' }
  )
);
