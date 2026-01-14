import { useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from './useAuth';

export function useChatSync() {
  const { user } = useAuth();
  const syncFromSupabase = useArcStore((state) => state.syncFromSupabase);
  const isSyncing = useArcStore((state) => state.isSyncing);
  const syncedUserId = useArcStore((state) => state.syncedUserId);
  const prevUserIdRef = useRef<string | null>(null);

  // Reset syncedUserId when user logs out (so re-login triggers sync)
  useEffect(() => {
    const currentUserId = user?.id ?? null;

    // User logged out (was logged in before, now not)
    if (prevUserIdRef.current && !currentUserId) {
      console.log('🔄 useChatSync: User logged out, resetting sync state');
      useArcStore.setState({ syncedUserId: null, chatSessions: [] });
    }

    prevUserIdRef.current = currentUserId;
  }, [user?.id]);

  // Sync when user authenticates or user ID changes
  useEffect(() => {
    const currentUserId = user?.id ?? null;

    // Skip if no user
    if (!currentUserId) {
      return;
    }

    // Skip if already synced for this user
    if (syncedUserId === currentUserId) {
      return;
    }

    // Skip if currently syncing (store handles this too, but good to check)
    if (isSyncing) {
      return;
    }

    // New user or different user - trigger sync
    console.log('🔄 useChatSync: Triggering sync for user:', currentUserId);
    syncFromSupabase();
  }, [user?.id, syncFromSupabase, syncedUserId, isSyncing]);

  // Calculate isLoaded: true if no user, or if sync completed for current user
  const isLoaded = !user || (syncedUserId === user.id && !isSyncing);

  return {
    isLoaded
  };
}