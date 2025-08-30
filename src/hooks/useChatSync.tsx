import { useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useArcStore } from '@/store/useArcStore';
import { supabase } from '@/integrations/supabase/client';
import { ChatEncryption } from '@/utils/encryption';
import { useToast } from '@/hooks/use-toast';

export function useChatSync() {
  const { user, profile } = useAuth();
  const { chatSessions, messages, currentSessionId, addMessage } = useArcStore();
  const { toast } = useToast();

  // Load chat sessions from server (additive sync - never delete existing)
  const loadChatSessions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const decryptedSessions = await Promise.all(
          data.map(async (session) => {
            try {
              const decryptedMessages = await ChatEncryption.decrypt(
                session.encrypted_data,
                user.id
              );
              
              return {
                id: session.id,
                title: session.title,
                createdAt: new Date(session.created_at),
                lastMessageAt: new Date(session.updated_at),
                messages: decryptedMessages
              };
            } catch (error) {
              console.error('Failed to decrypt session:', session.id, error);
              return null;
            }
          })
        );

        const validSessions = decryptedSessions.filter(Boolean);
        
        // Merge with existing sessions (additive sync)
        const currentSessions = chatSessions;
        const existingIds = new Set(currentSessions.map(s => s.id));
        const newSessions = validSessions.filter(s => !existingIds.has(s.id));
        
        if (newSessions.length > 0) {
          useArcStore.setState({ 
            chatSessions: [...currentSessions, ...newSessions]
          });
        }
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load chat history",
        variant: "destructive"
      });
    }
  }, [user, toast, chatSessions]);

  // Save current session to server
  const saveChatSession = useCallback(async () => {
    if (!user || !currentSessionId || messages.length === 0) return;

    try {
      const encryptedData = await ChatEncryption.encrypt(messages, user.id);
      const currentSession = chatSessions.find(s => s.id === currentSessionId);
      
      if (!currentSession) return;

      const { error } = await supabase
        .from('chat_sessions')
        .upsert({
          id: currentSessionId,
          user_id: user.id,
          title: currentSession.title,
          encrypted_data: encryptedData
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving chat session:', error);
      // Don't show toast for save errors to avoid disrupting UX
    }
  }, [user, currentSessionId, messages, chatSessions]);

  // Delete session from server and local state
  const deleteChatSession = useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      // Delete from server first
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state to remove the session
      const currentSessions = useArcStore.getState().chatSessions;
      const updatedSessions = currentSessions.filter(s => s.id !== sessionId);
      
      useArcStore.setState({ 
        chatSessions: updatedSessions,
        currentSessionId: useArcStore.getState().currentSessionId === sessionId ? null : useArcStore.getState().currentSessionId,
        messages: useArcStore.getState().currentSessionId === sessionId ? [] : useArcStore.getState().messages
      });

    } catch (error) {
      console.error('Error deleting chat session:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat session",
        variant: "destructive"
      });
    }
  }, [user, toast]);

  // Load sessions when user logs in
  useEffect(() => {
    if (user && profile) {
      loadChatSessions();
    }
  }, [user, profile, loadChatSessions]);

  // Auto-save current session when messages change
  useEffect(() => {
    if (user && currentSessionId && messages.length > 0) {
      const saveTimer = setTimeout(() => {
        saveChatSession();
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(saveTimer);
    }
  }, [user, currentSessionId, messages, saveChatSession]);

  // Force sync function for debugging (additive only)
  const forceSyncByEmail = useCallback(async () => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to sync chats",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Syncing...",
      description: `Adding missing chats for ${user.email}`,
    });

    // Load additional sessions from server without clearing existing ones
    await loadChatSessions();
    
    toast({
      title: "Sync complete",
      description: `Added missing chats for: ${user.email}`,
    });
  }, [user, toast, loadChatSessions]);

  return {
    loadChatSessions,
    saveChatSession,
    deleteChatSession,
    forceSyncByEmail
  };
}