/** UI-owned conversation pin. No audio or model state lives here. */
import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let activeConversation: { sessionId: string; ownerId: string } | null = null;
export function setActiveVoiceConversation(value: typeof activeConversation) { activeConversation = value; listeners.forEach(listener => listener()); }
export function isActiveVoiceConversation(sessionId: string) { return activeConversation?.sessionId === sessionId; }

export function clearActiveVoiceConversation(sessionId: string) { if (activeConversation?.sessionId === sessionId) setActiveVoiceConversation(null); }
export function useActiveVoiceConversationId() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => activeConversation?.sessionId ?? null, () => null); }
