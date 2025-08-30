import { useEffect } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useChatSync() {
  const { user } = useAuth();
  const { syncFromSupabase, chatSessions, saveChatToSupabase } = useArcStore();

  // Initial sync when user loads
  useEffect(() => {
    if (user) {
      syncFromSupabase();
    }
  }, [user, syncFromSupabase]);

  // Set up real-time updates for chat sessions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chat-sessions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_sessions',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('Real-time chat update:', payload);
          
          // Re-sync when any changes happen to avoid conflicts
          await syncFromSupabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, syncFromSupabase]);

  // Sync periodically to catch any missed updates
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      syncFromSupabase();
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [user, syncFromSupabase]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      if (user) {
        syncFromSupabase();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user, syncFromSupabase]);

  return {
    isLoaded: chatSessions.length > 0 || !user
  };
}