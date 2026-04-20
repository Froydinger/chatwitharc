import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccentColor } from '@/store/useAccentStore';

/**
 * Corporate Mode — locks Arc into a strict on-device-only configuration.
 *
 * When enabled:
 *   • All chat is routed to the local model (no cloud completions).
 *   • All tools are disabled: image gen, web search, voice, code, canvas, doc analysis.
 *   • Theme is force-locked to Noir (the previous accent is snapshotted).
 *   • New chat sessions stay on-device (cloud chat sync writes are paused).
 *
 * When disabled, the previous accent is restored and all features come back online.
 */

interface CorporateModeState {
  enabled: boolean;
  /** Accent the user had before enabling corporate mode, restored on disable. */
  prevAccent: AccentColor | null;

  setEnabled: (v: boolean, prevAccent?: AccentColor | null) => void;
}

export const useCorporateModeStore = create<CorporateModeState>()(
  persist(
    (set) => ({
      enabled: false,
      prevAccent: null,
      setEnabled: (v, prevAccent) =>
        set((state) => ({
          enabled: v,
          // Only update prevAccent when turning ON, so disable can restore it.
          prevAccent: v ? (prevAccent ?? state.prevAccent) : state.prevAccent,
        })),
    }),
    {
      name: 'arc-corporate-mode',
      partialize: (s) => ({ enabled: s.enabled, prevAccent: s.prevAccent }),
    }
  )
);
