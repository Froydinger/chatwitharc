import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Dormant video preferences, retained for saved clips and a future provider.
 * Keep the 4-second product cap aligned with generate-video.
 */
export type VideoSeconds = 4 | 8 | 12;

export const MAX_SECONDS: VideoSeconds = 4;
export const DEFAULT_SECONDS: VideoSeconds = 4;

/** Every duration the provider will accept, cheapest first. */
export const PROVIDER_SECONDS: VideoSeconds[] = [4, 8, 12];

/**
 * What the picker actually shows. Add 8 here (and raise MAX_SECONDS on the
 * server) to offer longer clips — an 8s clip is $0.80.
 */
export const VIDEO_DURATION_OPTIONS: Array<{ id: VideoSeconds; label: string; blurb: string }> = [
  { id: 4, label: '4 seconds', blurb: 'Shortest clip · lowest cost' },
];

export type VideoOrientation = 'landscape' | 'portrait';

export const DEFAULT_ORIENTATION: VideoOrientation = 'landscape';

export const VIDEO_ORIENTATION_OPTIONS: Array<{ id: VideoOrientation; label: string; size: string }> = [
  { id: 'landscape', label: 'Landscape', size: '1280x720' },
  { id: 'portrait', label: 'Portrait', size: '720x1280' },
];

function normalizeSeconds(value: unknown): VideoSeconds {
  const n = Math.floor(Number(value));
  if (!PROVIDER_SECONDS.includes(n as VideoSeconds)) return DEFAULT_SECONDS;
  return Math.min(n, MAX_SECONDS) as VideoSeconds;
}

function normalizeOrientation(value: unknown): VideoOrientation {
  return value === 'portrait' || value === 'landscape' ? value : DEFAULT_ORIENTATION;
}

/** Map an image's aspect ratio onto the only two shapes the model renders. */
export function orientationForAspect(aspectRatio: string | undefined): VideoOrientation {
  return aspectRatio === '2:3' || aspectRatio === '3:4' || aspectRatio === '9:16' ? 'portrait' : 'landscape';
}

/** Same idea, from raw pixel dimensions of a still being animated. */
export function orientationForDimensions(width: number, height: number): VideoOrientation {
  return height > width ? 'portrait' : 'landscape';
}

interface VideoGenState {
  seconds: VideoSeconds;
  orientation: VideoOrientation;
  /** Cleared once the user has seen the local-storage warning. */
  hasSeenStorageNotice: boolean;
  setSeconds: (s: VideoSeconds) => void;
  setOrientation: (o: VideoOrientation) => void;
  markStorageNoticeSeen: () => void;
}

export const useVideoGenStore = create<VideoGenState>()(
  persist(
    (set) => ({
      seconds: DEFAULT_SECONDS,
      orientation: DEFAULT_ORIENTATION,
      hasSeenStorageNotice: false,
      setSeconds: (s) => set({ seconds: normalizeSeconds(s) }),
      setOrientation: (o) => set({ orientation: normalizeOrientation(o) }),
      markStorageNoticeSeen: () => set({ hasSeenStorageNotice: true }),
    }),
    {
      name: 'arc-video-gen-prefs',
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.seconds = normalizeSeconds(state.seconds);
        state.orientation = normalizeOrientation(state.orientation);
      },
    },
  ),
);

/** Estimated provider cost, for admin-facing copy. $0.10/s at 720p. */
export function estimatedCostUsd(seconds: number): string {
  return `$${(seconds * 0.1).toFixed(2)}`;
}
