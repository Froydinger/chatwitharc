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
 * Memories in Corporate Mode (opt-in):
 *   • The user can choose to mirror their cloud memories down to the device
 *     once. After that, they're served from the persisted snapshot below — no
 *     network is touched while Corporate Mode is on.
 *   • New memories are NOT written while Corporate Mode is enabled.
 *   • `memoriesEnabled` is tri-state: `null` = never asked, `true` = opted in,
 *     `false` = opted out (no memory context at all).
 *
 * When disabled, the previous accent is restored and all features come back online.
 */

export interface CorporateMemorySnapshot {
  display_name: string | null;
  context_info: string | null;
  memory_info: string | null;
  context_blocks: string[];
  cached_at: string; // ISO timestamp of when this snapshot was pulled
}

interface CorporateModeState {
  enabled: boolean;
  /** Accent the user had before enabling corporate mode, restored on disable. */
  prevAccent: AccentColor | null;

  /**
   * Tri-state opt-in for using cloud memories on-device:
   *   null  → never asked, show consent modal
   *   true  → user agreed, use snapshot
   *   false → user declined, never use memories in corporate mode
   */
  memoriesEnabled: boolean | null;

  /** One-shot snapshot of the user's memories, pulled when consent is granted. */
  memorySnapshot: CorporateMemorySnapshot | null;

  setEnabled: (v: boolean, prevAccent?: AccentColor | null) => void;
  setMemoriesEnabled: (v: boolean | null) => void;
  setMemorySnapshot: (snapshot: CorporateMemorySnapshot | null) => void;
}

export const useCorporateModeStore = create<CorporateModeState>()(
  persist(
    (set) => ({
      enabled: false,
      prevAccent: null,
      memoriesEnabled: null,
      memorySnapshot: null,
      setEnabled: (v, prevAccent) =>
        set((state) => ({
          enabled: v,
          // Only update prevAccent when turning ON, so disable can restore it.
          prevAccent: v ? (prevAccent ?? state.prevAccent) : state.prevAccent,
        })),
      setMemoriesEnabled: (v) => set({ memoriesEnabled: v }),
      setMemorySnapshot: (snapshot) => set({ memorySnapshot: snapshot }),
    }),
    {
      name: 'arc-corporate-mode',
      partialize: (s) => ({
        enabled: s.enabled,
        prevAccent: s.prevAccent,
        memoriesEnabled: s.memoriesEnabled,
        memorySnapshot: s.memorySnapshot,
      }),
    }
  )
);
