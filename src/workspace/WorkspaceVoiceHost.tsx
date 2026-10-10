import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VoiceModeController } from '@/components/VoiceModeController';
import { VoiceModeOverlay } from '@/components/VoiceModeOverlay';
import { useArcStore } from '@/store/useArcStore';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';
import { createVoiceConversationPersistence, type VoiceConversationPersistence } from '@/lib/voiceConversationPersistence';
import { setActiveVoiceConversation, clearActiveVoiceConversation } from '@/lib/voiceConversationOwnership';
import { WORKSPACE_VOICE_UI_ENABLED } from './voiceRollout';

/** One lifetime for this authenticated account, above every routed Workspace page.
 * The design flag changes only the view; it never replaces this controller. */
export function WorkspaceVoiceHost({ ownerId, workspace }: { ownerId: string; workspace: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentId = useArcStore(state => state.currentSessionId);
  const mounted = useRef(false);
  const account = useRef(ownerId);
  const active = useRef<VoiceConversationPersistence | null>(null);
  const [conversation, setConversation] = useState<VoiceConversationPersistence | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    account.current = ownerId;
    const capture = () => {
      const chat = useArcStore.getState();
      const sessionId = chat.currentSessionId || chat.createNewSession();
      const session = useArcStore.getState().chatSessions.find(item => item.id === sessionId);
      if (!session || (session.persistenceOwnerId && session.persistenceOwnerId !== ownerId)
        || (!session.persistenceOwnerId && useArcStore.getState().syncedUserId !== ownerId)) {
        useVoiceModeStore.getState().deactivateVoiceMode(); return;
      }
      // Pin legacy sessions too, so an in-flight save cannot adopt another login.
      useArcStore.setState(state => ({ chatSessions: state.chatSessions.map(item => item.id === sessionId ? { ...item, persistenceOwnerId: ownerId } : item) }));
      const owner = createVoiceConversationPersistence({
        sessionId, callId: crypto.randomUUID(),
        isCurrent: () => mounted.current && account.current === ownerId && active.current === owner,
        canWrite: () => mounted.current && account.current === ownerId
          && useArcStore.getState().chatSessions.some(item => item.id === sessionId && item.persistenceOwnerId === ownerId),
        getMessages: () => {
          const state = useArcStore.getState();
          return state.currentSessionId === sessionId ? state.messages : state.chatSessions.find(item => item.id === sessionId)?.messages || [];
        },
        readTurns: () => useVoiceModeStore.getState().conversationTurns,
        attachImageToLastAssistantTurn: () => useVoiceModeStore.getState().attachImageToLastAssistantTurn(),
        append: (message, options) => useArcStore.getState().addMessage(message, options),
        patch: (id, messageId, patch, persist) => useArcStore.getState().patchOwnedMessage(id, messageId, patch, persist),
      });
      active.current = owner;
      owner.captureTurns(useVoiceModeStore.getState().conversationTurns);
      setActiveVoiceConversation({ sessionId, ownerId });
      setConversation(owner);
    };
    if (useVoiceModeStore.getState().isActive) capture();
    const unsubscribe = useVoiceModeStore.subscribe((next, previous) => {
      if (next.isActive && !previous.isActive) capture();
      else if (next.conversationTurns !== previous.conversationTurns) active.current?.captureTurns(next.conversationTurns);
      if (!next.isActive && previous.isActive && active.current) {
        const owner = active.current;
        // Pin an empty owner until final persistence settles, even on a fast new chat.
        void owner.saveTurns(true).catch(error => console.warn('Voice conversation save failed:', error))
          .finally(() => { if (!useVoiceModeStore.getState().isActive && active.current === owner) clearActiveVoiceConversation(owner.sessionId); });
      }
    });
    // Revoke synchronously with auth, before delayed tool or save completions.
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id === ownerId) return;
      account.current = '';
      useVoiceModeStore.getState().deactivateVoiceMode();
    });
    return () => {
      mounted.current = false; account.current = '';
      unsubscribe(); auth.data.subscription.unsubscribe();
      useVoiceModeStore.getState().deactivateVoiceMode();
      setActiveVoiceConversation(null);
    };
  }, [ownerId]);
  const chatRoute = pathname === '/' || pathname.startsWith('/chat/');
  return <>
    <VoiceModeController conversation={conversation || undefined} requireConversation />
    <VoiceModeOverlay layout={workspace && WORKSPACE_VOICE_UI_ENABLED ? 'workspace' : 'legacy'} compact={!chatRoute || !!conversation && conversation.sessionId !== currentId} onOpenConversation={() => {
      if (!conversation) return;
      useArcStore.getState().loadSession(conversation.sessionId);
      navigate(`/chat/${encodeURIComponent(conversation.sessionId)}`);
    }} />
  </>;
}
