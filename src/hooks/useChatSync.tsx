import { useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from './useAuth';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';

export function useChatSync() {
  const { user, isAnonymous } = useAuth();
  const syncFromSupabase = useArcStore((state) => state.syncFromSupabase);
  const generateTitlesForUnnamedChats = useArcStore((state) => state.generateTitlesForUnnamedChats);
  const isSyncing = useArcStore((state) => state.isSyncing);
  const syncedUserId = useArcStore((state) => state.syncedUserId);
  const prevUserIdRef = useRef<string | null>(null);
  const backfilledUserRef = useRef<string | null>(null);

  // Treat anonymous (guest) sessions as "no user" for sync purposes —
  // their messages live in localStorage only.
  const effectiveUserId = user && !isAnonymous ? user.id : null;

  // Reset syncedUserId when user logs out (or downgrades to anon)
  useEffect(() => {
    if (prevUserIdRef.current && !effectiveUserId) {
      console.log('🔄 useChatSync: User logged out, resetting sync state');
      useArcStore.setState({ syncedUserId: null, chatSessions: [] });
    }

    prevUserIdRef.current = effectiveUserId;
  }, [effectiveUserId]);

  const corporateMode = useCorporateModeStore((s) => s.enabled);
  useEffect(() => {
    if (!effectiveUserId) return;
    if (corporateMode) return;
    if (syncedUserId === effectiveUserId) return;
    if (isSyncing) return;

    console.log('🔄 useChatSync: Triggering sync for user:', effectiveUserId);
    syncFromSupabase();
  }, [effectiveUserId, syncFromSupabase, syncedUserId, isSyncing, corporateMode]);

  // Backfill titles for chats still sitting at "New Chat" — either from before
  // naming worked, or from a turn where the naming call failed. Runs once per
  // signed-in user per app load, after the sync has populated the session list,
  // and idles out immediately when there is nothing to name.
  useEffect(() => {
    if (!effectiveUserId) return;
    if (corporateMode) return;
    if (syncedUserId !== effectiveUserId) return;
    if (isSyncing) return;
    if (backfilledUserRef.current === effectiveUserId) return;

    backfilledUserRef.current = effectiveUserId;
    // Deferred so it never competes with the first paint or an active send.
    const timer = setTimeout(() => {
      generateTitlesForUnnamedChats().catch((err) =>
        console.error('❌ Title backfill pass failed:', err),
      );
    }, 4000);

    return () => clearTimeout(timer);
  }, [effectiveUserId, syncedUserId, isSyncing, corporateMode, generateTitlesForUnnamedChats]);

  const isLoaded =
    !effectiveUserId || corporateMode || (syncedUserId === effectiveUserId && !isSyncing);

  return {
    isLoaded,
  };
}