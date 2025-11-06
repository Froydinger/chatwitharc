import { useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from './useAuth';

export function useChatSync() {
  const { user } = useAuth();
  const { syncFromSupabase } = useArcStore();
  const hasLoadedRef = useRef(false);

  // Single initial sync when user authenticates
  useEffect(() => {
    if (user && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      syncFromSupabase();
    }
  }, [user, syncFromSupabase]);

  return {
    isLoaded: hasLoadedRef.current || !user
  };
}