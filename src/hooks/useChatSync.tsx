import { useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from './useAuth';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';

export function useChatSync() {
  const { user, isAnonymous } = useAuth();
  const syncFromSupabase = useArcStore((state) => state.syncFromSupabase);
  const isSyncing = useArcStore((state) => state.isSyncing);
  const syncedUserId = useArcStore((state) => state.syncedUserId);
  const prevUserIdRef = useRef<string | null>(null);

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

  const isLoaded =
    !effectiveUserId || corporateMode || (syncedUserId === effectiveUserId && !isSyncing);

  return {
    isLoaded,
  };
}