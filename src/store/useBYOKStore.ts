import { create } from "zustand";
import { persist } from "zustand/middleware";

// Bring-Your-Own-Key. Keys are stored ONLY in this device's localStorage (via
// zustand persist) and are never sent to our servers — when a key is present we
// call the provider's API directly from the browser. This offloads token cost
// to the user and keeps their traffic private to their own account.

export type BYOKProvider = "openai" | "gemini";

interface BYOKState {
  openaiKey: string;
  geminiKey: string;
  setKey: (provider: BYOKProvider, key: string) => void;
  clearKey: (provider: BYOKProvider) => void;
}

export const useBYOKStore = create<BYOKState>()(
  persist(
    (set) => ({
      openaiKey: "",
      geminiKey: "",
      setKey: (provider, key) =>
        set(provider === "openai" ? { openaiKey: key.trim() } : { geminiKey: key.trim() }),
      clearKey: (provider) =>
        set(provider === "openai" ? { openaiKey: "" } : { geminiKey: "" }),
    }),
    { name: "arcai-byok" },
  ),
);

export function getBYOKKey(provider: BYOKProvider): string {
  const s = useBYOKStore.getState();
  return (provider === "openai" ? s.openaiKey : s.geminiKey).trim();
}

export function hasAnyBYOKKey(): boolean {
  const s = useBYOKStore.getState();
  return !!(s.openaiKey.trim() || s.geminiKey.trim());
}
