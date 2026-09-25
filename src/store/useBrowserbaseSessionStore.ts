import { create } from 'zustand';

export type BrowserbaseDevice = 'desktop' | 'mobile';
export type BrowserbaseSessionStatus =
  | 'provisioning' | 'agent_running' | 'user_control' | 'handed_back'
  | 'release_requested' | 'closed' | 'expired' | 'failed';

export interface BrowserbaseChatSession {
  sessionHandle: string;
  status: BrowserbaseSessionStatus;
  expiresAt: string;
  device: BrowserbaseDevice;
  control: 'agent' | 'user' | 'view_only';
  title: string;
  taskKind: 'chat' | 'git';
}

interface BrowserbaseSessionState {
  byChat: Record<string, BrowserbaseChatSession>;
  setSession: (chatId: string, session: BrowserbaseChatSession) => void;
  updateSession: (chatId: string, sessionHandle: string, patch: Partial<BrowserbaseChatSession>) => void;
  getSession: (chatId?: string) => BrowserbaseChatSession | undefined;
  clearSession: (chatId: string, sessionHandle?: string) => void;
  clearAll: () => void;
}

/** Browser sessions are deliberately memory-only. A refresh can recover their
 * owner-scoped handle from the saved chat artifact, but never persists a live
 * view URL or any Browserbase bearer connection URL. */
export const useBrowserbaseSessionStore = create<BrowserbaseSessionState>((set, get) => ({
  byChat: {},
  setSession: (chatId, session) => set(state => ({ byChat: { ...state.byChat, [chatId]: session } })),
  updateSession: (chatId, sessionHandle, patch) => set(state => {
    const current = state.byChat[chatId];
    if (!current || current.sessionHandle !== sessionHandle) return state;
    return { byChat: { ...state.byChat, [chatId]: { ...current, ...patch } } };
  }),
  getSession: (chatId) => chatId ? get().byChat[chatId] : undefined,
  clearSession: (chatId, sessionHandle) => set(state => {
    const current = state.byChat[chatId];
    if (!current || (sessionHandle && current.sessionHandle !== sessionHandle)) return state;
    const byChat = { ...state.byChat };
    delete byChat[chatId];
    return { byChat };
  }),
  clearAll: () => set({ byChat: {} }),
}));
