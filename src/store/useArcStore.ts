import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { ChatEncryption } from '@/utils/encryption';
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
  type: 'text' | 'voice' | 'image' | 'image-generating';
  imageUrl?: string;
  imageUrls?: string[]; // Support for multiple images
  imagePrompt?: string; // For image generation placeholders
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
  rightPanelTab: 'history' | 'music' | 'settings';
  setRightPanelTab: (tab: 'history' | 'music' | 'settings') => void;

  isVoiceMode: boolean;
  setVoiceMode: (enabled: boolean) => void;
  toggleVoiceMode: () => void;
  isLoading: boolean;
  isGeneratingImage: boolean;
  setLoading: (loading: boolean) => void;
  setGeneratingImage: (generating: boolean) => void;
  
  // Quick Start
  startChatWithMessage: (message: string) => void;
  
  // Voice Settings
  selectedVoice: 'cedar' | 'marin';
  setSelectedVoice: (voice: 'cedar' | 'marin') => void;
  isContinuousVoiceMode: boolean;
  setContinuousVoiceMode: (enabled: boolean) => void;
  
  // Supabase Sync
  syncFromSupabase: () => Promise<void>;
  saveChatToSupabase: (session: ChatSession) => Promise<void>;
  isOnline: boolean;
  lastSyncAt: Date | null;
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
          if (!user) return;

          const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

          if (error) {
            console.error('Error fetching sessions:', error);
            return;
          }

          if (sessions) {
            const decryptedSessions: ChatSession[] = [];
            
            for (const session of sessions) {
              try {
                const decryptedData = await ChatEncryption.decrypt(session.encrypted_data, user.id);
                decryptedSessions.push({
                  id: session.id,
                  title: session.title,
                  createdAt: new Date(session.created_at),
                  lastMessageAt: new Date(session.updated_at),
                  messages: decryptedData.messages || []
                });
              } catch (error) {
                console.error('Error decrypting session:', session.id, error);
              }
            }

            set({
              chatSessions: decryptedSessions,
              lastSyncAt: new Date()
            });
          }
        } catch (error) {
          console.error('Error syncing from Supabase:', error);
        }
      },

      saveChatToSupabase: async (session: ChatSession) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const encryptedData = await ChatEncryption.encrypt({
            messages: session.messages
          }, user.id);

          const { error } = await supabase
            .from('chat_sessions')
            .upsert({
              id: session.id,
              user_id: user.id,
              title: session.title,
              encrypted_data: encryptedData,
              updated_at: new Date().toISOString()
            });

          if (error) {
            console.error('Error saving session to Supabase:', error);
          } else {
            set({ lastSyncAt: new Date() });
          }
        } catch (error) {
          console.error('Error saving to Supabase:', error);
        }
      },
      
      createNewSession: () => {
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
          set({
            currentSessionId: sessionId,
            messages: [...session.messages] // Create a new array to ensure reactivity
          });
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
        // Skip saving voice messages to chat history
        if (message.type === 'voice') {
          set((state) => ({
            messages: [...state.messages, {
              ...message,
              id: Math.random().toString(36).substring(7),
              timestamp: new Date()
            }]
          }));
          return;
        }

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
          
          // Save to Supabase asynchronously
          get().saveChatToSupabase(sessionToSave);
          
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
      
      // Voice Mode
      isVoiceMode: false,
      setVoiceMode: (enabled) => set({ isVoiceMode: enabled }),
      toggleVoiceMode: () => set((state) => ({ 
        isVoiceMode: !state.isVoiceMode,
        rightPanelOpen: false // Close panel when switching to voice mode
      })),

      isLoading: false,
      isGeneratingImage: false,
      setLoading: (loading) => set({ isLoading: loading }),
      setGeneratingImage: (generating) => set({ isGeneratingImage: generating }),
      
      // Quick Start - modified to trigger proper image detection
      startChatWithMessage: async (message) => {
        const state = get();
        
        // Check if this is an image generation request
        const isImageRequest = /^generate\s+an?\s+image\s+of/i.test(message.toLowerCase()) ||
                             message.toLowerCase().includes('create an image') ||
                             message.toLowerCase().includes('generate image');
        
        if (isImageRequest) {
          // For image requests, trigger the input field submission to ensure proper handling
          window.dispatchEvent(new CustomEvent('arcai:triggerPrompt', { 
            detail: { prompt: message, type: 'image' } 
          }));
        } else {
          // For text prompts, add the user message directly without dispatching events
          await state.addMessage({
            content: message,
            role: 'user',
            type: 'text'
          });
          
          // No need to dispatch event - the chat will auto-respond via useEffect in ChatInput
        }
      },
      
      // Voice
      selectedVoice: 'cedar',
      setSelectedVoice: (voice) => set({ selectedVoice: voice }),
      isContinuousVoiceMode: true,
      setContinuousVoiceMode: (enabled) => set({ isContinuousVoiceMode: enabled }),
      
    }),
    {
      name: 'arc-ai-storage',
      partialize: (state) => ({
        selectedVoice: state.selectedVoice,
        isContinuousVoiceMode: state.isContinuousVoiceMode,
        // Don't persist chat sessions - they'll be loaded from Supabase
        currentSessionId: state.currentSessionId
      })
    }
  )
);