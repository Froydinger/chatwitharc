import { useEffect } from 'react';
import { messageQueue } from '@/services/messageQueue';
import { useArcStore } from '@/store/useArcStore';

/**
 * Hook to handle app visibility changes and recover pending operations
 */
export function useVisibilityHandler() {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 App became visible - checking for pending messages');
        
        // Check for pending messages and retry
        const pending = messageQueue.getPendingMessages();
        if (pending.length > 0) {
          console.log(`📦 Found ${pending.length} pending messages to retry`);
          // Trigger recovery - this will be handled by the store
          const store = useArcStore.getState();
          store.recoverPendingMessages?.();
        }
      } else {
        console.log('👋 App hidden - operations will continue in background');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Run recovery check on mount
  useEffect(() => {
    const pending = messageQueue.getPendingMessages();
    if (pending.length > 0) {
      console.log(`🔄 Recovering ${pending.length} pending messages on mount`);
      const store = useArcStore.getState();
      store.recoverPendingMessages?.();
    }

    // Cleanup old messages
    messageQueue.cleanup();
  }, []);
}
