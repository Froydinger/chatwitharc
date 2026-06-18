import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AnonMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: Array<{ title: string; url: string }>;
}

interface AnonChatState {
  messages: AnonMessage[];
  repliesToday: number;
  limit: number;
  append: (msg: Omit<AnonMessage, "id" | "timestamp">) => string;
  updateLast: (patch: Partial<AnonMessage>) => void;
  newChat: () => void;
  setUsage: (repliesToday: number, limit: number) => void;
  markForMigration: () => void;
}

const MIGRATION_KEY = "arc_anon_chat_pending_migration";

export const useAnonChatStore = create<AnonChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      repliesToday: 0,
      limit: 25,
      append: (msg) => {
        const id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((s) => ({
          messages: [...s.messages, { ...msg, id, timestamp: Date.now() }],
        }));
        return id;
      },
      updateLast: (patch) => {
        set((s) => {
          if (!s.messages.length) return s;
          const next = [...s.messages];
          next[next.length - 1] = { ...next[next.length - 1], ...patch };
          return { messages: next };
        });
      },
      newChat: () => set({ messages: [] }),
      setUsage: (repliesToday, limit) => set({ repliesToday, limit }),
      markForMigration: () => {
        const { messages } = get();
        if (!messages.length) return;
        try {
          localStorage.setItem(
            MIGRATION_KEY,
            JSON.stringify({ messages, stashedAt: Date.now() }),
          );
        } catch (e) {
          console.error("Failed to stash anon chat:", e);
        }
      },
    }),
    {
      name: "arc_anon_chat",
      partialize: (s) => ({
        messages: s.messages,
        repliesToday: s.repliesToday,
        limit: s.limit,
      }),
    },
  ),
);

export function getPendingAnonMigration(): { messages: AnonMessage[] } | null {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.messages) || parsed.messages.length === 0) return null;
    return { messages: parsed.messages };
  } catch {
    return null;
  }
}

export function clearPendingAnonMigration() {
  try {
    localStorage.removeItem(MIGRATION_KEY);
    localStorage.removeItem("arc_anon_chat");
  } catch {}
}
