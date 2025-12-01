import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from '@/utils/memoryDetection';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
  messages: Message[];
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  type: 'text' | 'image' | 'image-generating' | 'file';
  imageUrl?: string;
  imageUrls?: string[]; // Support for multiple images
  imagePrompt?: string; // For image generation placeholders
  fileUrl?: string; // For file attachments
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export interface ArcState {
  // State Management
  
  // Chat Sessions Management
  currentSessionId: string | null;
  chatSessions: ChatSession[];
  createNewSession: () => string;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  
  // Current Chat State
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>;
  replaceLastMessage: (message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => void;
  clearCurrentMessages: () => void;
  
  // UI State
  currentTab: 'chat' | 'history' | 'settings';
  setCurrentTab: (tab: 'chat' | 'history' | 'settings') => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightPanelTab: 'history' | 'media' | 'apps' | 'music' | 'settings' | 'export';
  setRightPanelTab: (tab: 'history' | 'media' | 'apps' | 'music' | 'settings' | 'export') => void;

  isLoading: boolean;
  isGeneratingImage: boolean;
  isSearchingChats: boolean;
  isAccessingMemory: boolean;
  setLoading: (loading: boolean) => void;
  setGeneratingImage: (generating: boolean) => void;
  setSearchingChats: (searching: boolean) => void;
  setAccessingMemory: (accessing: boolean) => void;

  // Quick Start
  startChatWithMessage: (message: string) => void;
  
  // Supabase Sync
  syncFromSupabase: () => Promise<void>;
  saveChatToSupabase: (session: ChatSession) => Promise<void>;
  isOnline: boolean;
  lastSyncAt: Date | null;
  
  // Message Recovery
  recoverPendingMessages: () => Promise<void>;
}

export const useArcStore = create<ArcState>()(
  persist(
    (set, get) => ({
      // Theme and UI State
      
      // Chat Sessions
      currentSessionId: null,
      chatSessions: [],
      isOnline: navigator.onLine,
      lastSyncAt: null,
      
      // Supabase Sync Functions
      syncFromSupabase: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('⚠️ No user found, skipping sync');
            return;
          }

          console.log('🔄 Starting sync from Supabase...');
          const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

          if (error) {
            console.error('❌ Sync error:', error);
            set({ isOnline: false });
            return;
          }

          if (sessions) {
            const loadedSessions: ChatSession[] = sessions.map(session => ({
              id: session.id,
              title: session.title,
              createdAt: new Date(session.created_at),
              lastMessageAt: new Date(session.updated_at),
              messages: Array.isArray(session.messages) ? (session.messages as any) : []
            }));

            console.log(`✅ Synced ${loadedSessions.length} sessions (${loadedSessions.reduce((sum, s) => sum + s.messages.length, 0)} total messages)`);

            const state = get();
            const currentSession = state.currentSessionId
              ? loadedSessions.find(s => s.id === state.currentSessionId)
              : null;

            set({
              chatSessions: loadedSessions,
              lastSyncAt: new Date(),
              isOnline: true,
              // Restore messages for current session after sync
              messages: currentSession ? JSON.parse(JSON.stringify(currentSession.messages)) : state.messages
            });
          } else {
            console.log('📭 No sessions found in Supabase');
          }
        } catch (error) {
          console.error('❌ Failed to sync from Supabase:', error);
          set({ isOnline: false });
        }
      },

      saveChatToSupabase: async (session: ChatSession) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.warn('⚠️ No user found, cannot save to Supabase');
            return;
          }

          // CRITICAL: Check if we're about to overwrite non-empty data with empty data
          const { data: existingSession } = await supabase
            .from('chat_sessions')
            .select('messages')
            .eq('id', session.id)
            .maybeSingle();

          const existingMessageCount = Array.isArray(existingSession?.messages) 
            ? existingSession.messages.length 
            : 0;
          const newMessageCount = Array.isArray(session.messages) 
            ? session.messages.length 
            : 0;

          if (existingMessageCount > 0 && newMessageCount === 0) {
            console.error('🚨 PREVENTED DATA LOSS: Attempted to overwrite', existingMessageCount, 'messages with empty array for session:', session.id);
            throw new Error('Cannot overwrite existing messages with empty array');
          }

          console.log('💾 Saving session:', session.id, '- Messages:', newMessageCount);

          const { error } = await supabase
            .from('chat_sessions')
            .upsert({
              user_id: user.id,
              title: session.title,
              messages: session.messages as any,
              updated_at: new Date().toISOString(),
              id: session.id
            });

          if (error) {
            console.error('❌ Error saving session to Supabase:', error);
            set({ isOnline: false });
            throw error;
          } else {
            console.log('✅ Successfully saved session:', session.id);
            set({ lastSyncAt: new Date(), isOnline: true });
          }
        } catch (error) {
          console.error('❌ Failed to save to Supabase:', error);
          set({ isOnline: false });
          throw error; // Re-throw to let caller handle
        }
      },
      
      recoverPendingMessages: async () => {
        // This will be called when app becomes visible or on mount
        // For now, just trigger a sync to ensure everything is up to date
        console.log('🔄 Recovering pending messages...');
        await get().syncFromSupabase();
      },
      
      createNewSession: () => {
        const state = get();
        
        // If current session is empty, delete it first
        if (state.currentSessionId) {
          const currentSession = state.chatSessions.find(s => s.id === state.currentSessionId);
          if (currentSession && currentSession.messages.length === 0) {
            console.log('🗑️ Auto-deleting empty session before creating new one:', state.currentSessionId);
            get().deleteSession(state.currentSessionId);
          }
        }
        
        // Reset model selection to default (Smart & Fast) for new chat
        sessionStorage.setItem('arc_session_model', 'google/gemini-2.5-flash');
        
        // Generate a proper UUID for Supabase compatibility
        const sessionId = crypto.randomUUID();
        const newSession: ChatSession = {
          id: sessionId,
          title: "New Chat",
          createdAt: new Date(),
          lastMessageAt: new Date(),
          messages: []
        };
        
        set((state) => ({
          chatSessions: [newSession, ...state.chatSessions],
          currentSessionId: sessionId,
          messages: []
        }));
        
        // Save to Supabase
        get().saveChatToSupabase(newSession);
        
        return sessionId;
      },
      
      loadSession: (sessionId) => {
        const session = get().chatSessions.find(s => s.id === sessionId);
        if (session) {
          console.log('Loading session:', sessionId, 'with', session.messages.length, 'messages');

          // Reset model selection to default (Smart & Fast) when switching to any chat
          sessionStorage.setItem('arc_session_model', 'google/gemini-2.5-flash');

          set({
            currentSessionId: sessionId,
            messages: JSON.parse(JSON.stringify(session.messages)) // Deep clone to prevent reference issues
          });
        } else {
          console.warn('Session not found:', sessionId);
        }
      },
      
      deleteSession: async (sessionId) => {
        const state = get();
        const sessionToDelete = state.chatSessions.find(s => s.id === sessionId);
        const updatedSessions = state.chatSessions.filter(s => s.id !== sessionId);
        
        set((state) => ({
          chatSessions: updatedSessions,
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          messages: state.currentSessionId === sessionId ? [] : state.messages
        }));

        // Delete from Supabase
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('chat_sessions')
              .delete()
              .eq('id', sessionId)
              .eq('user_id', user.id);

            // Clean up generated images from storage
            if (sessionToDelete) {
              const generatedImageUrls = sessionToDelete.messages
                .filter(m => m.type === 'image' && m.role === 'assistant' && m.imageUrl)
                .map(m => m.imageUrl!)
                .filter(url => url.includes(user.id) && url.includes('generated-'));

              for (const url of generatedImageUrls) {
                try {
                  const urlParts = url.split('/');
                  const fileName = urlParts[urlParts.length - 1];
                  const fullPath = `${user.id}/${fileName}`;
                  
                  await supabase.storage
                    .from('avatars')
                    .remove([fullPath]);
                } catch (imageError) {
                  console.error('Error deleting generated image:', imageError);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error deleting session from Supabase:', error);
        }
      },
      
      clearAllSessions: async () => {
        set({ 
          chatSessions: [], 
          currentSessionId: null, 
          messages: [] 
        });

        // Show success notification
        try {
          const { toast } = await import("@/hooks/use-toast");
          toast({
            title: "All Conversations Deleted",
            description: "Your chat history has been cleared",
            variant: "default"
          });
        } catch (error) {
          console.log('Toast notification failed:', error);
        }

        // Clear from Supabase
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('chat_sessions')
              .delete()
              .eq('user_id', user.id);
          }
        } catch (error) {
          console.error('Error clearing sessions from Supabase:', error);
        }
      },
      
      // Current Chat
      messages: [],
      
      addMessage: async (message) => {
        const newMessage = {
          ...message,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date()
        };
        
        
        // Normal message handling if not a memory command
        set((state) => {
          const updatedMessages = [...state.messages, newMessage];
          
          // Update current session
          let updatedSessions = state.chatSessions;
          let currentSessionId = state.currentSessionId;
          let sessionToSave: ChatSession;
          
          if (!currentSessionId) {
            // Create new session if none exists
            currentSessionId = crypto.randomUUID();
            sessionToSave = {
              id: currentSessionId,
              title: message.role === 'user' ? 
                (message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content) : 
                "New Chat",
              createdAt: new Date(),
              lastMessageAt: new Date(),
              messages: updatedMessages
            };
            updatedSessions = [sessionToSave, ...state.chatSessions];
          } else {
            // Update existing session
            const existingSession = state.chatSessions.find(s => s.id === currentSessionId);
            sessionToSave = {
              id: currentSessionId,
              title: existingSession?.title === "New Chat" && message.role === 'user' ? 
                (message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content) : 
                (existingSession?.title || "New Chat"),
              createdAt: existingSession?.createdAt || new Date(),
              lastMessageAt: new Date(),
              messages: updatedMessages
            };
            
            updatedSessions = state.chatSessions.map(session => 
              session.id === currentSessionId ? sessionToSave : session
            );
          }
          
          // Save to Supabase asynchronously with error handling
          get().saveChatToSupabase(sessionToSave).catch(error => {
            console.error('❌ Failed to save message to Supabase:', error);
            // Message is still in local state, will retry on next sync
          });
          
          return {
            messages: updatedMessages,
            chatSessions: updatedSessions,
            currentSessionId
          };
        });
      },
      
      replaceLastMessage: async (message) => {
        const newMessage = {
          ...message,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date()
        };
        
        set((state) => {
          if (state.messages.length === 0) {
            // If no messages, just add it
            return {
              ...state,
              messages: [newMessage]
            };
          }
          
          // Replace the last message
          const updatedMessages = [...state.messages];
          updatedMessages[updatedMessages.length - 1] = newMessage;
          
          // Update current session
          let updatedSessions = state.chatSessions;
          let currentSessionId = state.currentSessionId;
          let sessionToSave: ChatSession;
          
          if (currentSessionId) {
            const existingSession = state.chatSessions.find(s => s.id === currentSessionId);
            if (existingSession) {
              sessionToSave = {
                ...existingSession,
                lastMessageAt: new Date(),
                messages: updatedMessages
              };
              
              updatedSessions = state.chatSessions.map(session => 
                session.id === currentSessionId ? sessionToSave : session
              );
              
              // Save to Supabase async
              get().saveChatToSupabase(sessionToSave);
            }
          }
          
          return {
            ...state,
            messages: updatedMessages,
            chatSessions: updatedSessions,
            currentSessionId
          };
        });
      },
      
      clearCurrentMessages: () => set({ messages: [] }),
      
      editMessage: (messageId, newContent) => {
        set((state) => {
          const messageIndex = state.messages.findIndex(m => m.id === messageId);
          if (messageIndex === -1) return state;
          
          // Update the message content and remove all messages after it
          const updatedMessages = state.messages.slice(0, messageIndex + 1);
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: newContent,
            timestamp: new Date()
          };
          
          // Update current session
          let updatedSessions = state.chatSessions;
          let sessionToSave: ChatSession | null = null;
          
          if (state.currentSessionId) {
            const existingSession = state.chatSessions.find(s => s.id === state.currentSessionId);
            if (existingSession) {
              sessionToSave = {
                ...existingSession,
                lastMessageAt: new Date(),
                messages: updatedMessages
              };
              
              updatedSessions = state.chatSessions.map(session => 
                session.id === state.currentSessionId ? sessionToSave! : session
              );
            }
          }
          
          // Save to Supabase if we have a session
          if (sessionToSave) {
            get().saveChatToSupabase(sessionToSave);
          }
          
          return {
            messages: updatedMessages,
            chatSessions: updatedSessions
          };
        });
      },
      
      // UI
      currentTab: 'chat',
      setCurrentTab: (tab) => set({ currentTab: tab }),
      rightPanelOpen: false,
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      rightPanelTab: 'history',
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      isLoading: false,
      isGeneratingImage: false,
      isSearchingChats: false,
      isAccessingMemory: false,
      setLoading: (loading) => set({ isLoading: loading }),
      setGeneratingImage: (generating) => set({ isGeneratingImage: generating }),
      setSearchingChats: (searching) => set({ isSearchingChats: searching }),
      setAccessingMemory: (accessing) => set({ isAccessingMemory: accessing }),
      
      // Quick Start - modified to trigger proper image detection
      startChatWithMessage: async (message) => {
        const state = get();
        
        // Check if this is an image generation request
        const isImageRequest = (() => {
          const lowerMessage = message.toLowerCase();

          // Must contain explicit image-related words
          const hasImageWord = /\b(image|picture|photo|illustration|artwork|graphic|visual|drawing|painting)\b/i.test(lowerMessage);

          // Explicit image generation patterns with "image" or visual nouns
          if (/^(generate|create|make|draw|paint|design|render|produce)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic|drawing|painting)/i.test(lowerMessage)) {
            return true;
          }

          if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(lowerMessage)) {
            return true;
          }

          // Drawing-specific triggers (draw implies visual content)
          if (/^draw\s+(a|an|me|something)/i.test(lowerMessage)) {
            return true;
          }

          // Paint-specific triggers (paint implies visual content)
          if (/^paint\s+(a|an|me|something)/i.test(lowerMessage)) {
            return true;
          }

          // Only proceed with visual subjects if we have an image word
          if (!hasImageWord) {
            return false;
          }

          // Visual creation verbs combined with visual subjects (only if "image" word present)
          const visualVerbs = ['generate', 'create', 'make', 'design', 'render', 'produce'];
          const visualSubjects = [
            'landscape', 'portrait', 'character', 'scene', 'artwork', 'art piece', 'illustration',
            'painting', 'drawing', 'digital art', 'concept art', 'fantasy', 'abstract', 'logo',
            'design', 'cityscape', 'nature scene', 'background', 'wallpaper', 'cover art',
            'album art', 'poster', 'banner', 'icon', 'avatar', 'mascot', 'creature', 'monster',
            'building', 'architecture', 'vehicle', 'spaceship', 'robot', 'mech', 'weapon',
            'magical', 'mystical', 'ethereal', 'futuristic', 'sci-fi', 'fantasy world',
            'comic book', 'anime', 'cartoon', 'realistic photo', 'photorealistic'
          ];

          const hasVisualVerb = visualVerbs.some(verb =>
            new RegExp(`^${verb}\\s+a\\s+`, 'i').test(lowerMessage) ||
            new RegExp(`^${verb}\\s+an\\s+`, 'i').test(lowerMessage)
          );

          const hasVisualSubject = visualSubjects.some(subject =>
            lowerMessage.includes(subject)
          );

          return hasVisualVerb && hasVisualSubject;
        })();
        
        if (isImageRequest) {
          // For image requests, trigger the input field submission to ensure proper handling
          window.dispatchEvent(new CustomEvent('arcai:triggerPrompt', { 
            detail: { prompt: message, type: 'image' } 
          }));
        } else {
          // For text prompts, trigger through the event system so it goes through normal flow
          window.dispatchEvent(new CustomEvent('arcai:triggerPrompt', { 
            detail: { prompt: message, type: 'text' } 
          }));
        }
      },

    }),
    {
      name: 'arc-ai-storage',
      partialize: (state) => ({
        currentSessionId: state.currentSessionId, // Persist current session for reload
        // Cloud-only: no local storage backup for messages
      })
    }
  )
);