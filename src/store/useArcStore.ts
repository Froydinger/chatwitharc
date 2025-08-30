import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  type: 'text' | 'voice' | 'image';
  imageUrl?: string;
  imageUrls?: string[]; // Support for multiple images
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
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  editMessage: (messageId: string, newContent: string) => void;
  clearCurrentMessages: () => void;
  
  // UI State
  currentTab: 'chat' | 'history' | 'settings';
  setCurrentTab: (tab: 'chat' | 'history' | 'settings') => void;
  isVoiceMode: boolean;
  setVoiceMode: (enabled: boolean) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  
  // Voice Settings
  selectedVoice: 'cedar' | 'marin';
  setSelectedVoice: (voice: 'cedar' | 'marin') => void;
  
  
}

export const useArcStore = create<ArcState>()(
  persist(
    (set, get) => ({
      // Theme and UI State
      
      // Chat Sessions
      currentSessionId: null,
      chatSessions: [],
      
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
        
        return sessionId;
      },
      
      loadSession: (sessionId) => {
        const session = get().chatSessions.find(s => s.id === sessionId);
        if (session) {
          set({
            currentSessionId: sessionId,
            messages: session.messages
          });
        }
      },
      
      deleteSession: (sessionId) => {
        const state = get();
        const updatedSessions = state.chatSessions.filter(s => s.id !== sessionId);
        
        set((state) => ({
          chatSessions: updatedSessions,
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          messages: state.currentSessionId === sessionId ? [] : state.messages
        }));
      },
      
      clearAllSessions: () => set({ 
        chatSessions: [], 
        currentSessionId: null, 
        messages: [] 
      }),
      
      // Current Chat
      messages: [],
      
      addMessage: (message) => {
        const newMessage = {
          ...message,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date()
        };
        
        set((state) => {
          const updatedMessages = [...state.messages, newMessage];
          
          // Update current session
          let updatedSessions = state.chatSessions;
          let currentSessionId = state.currentSessionId;
          
          if (!currentSessionId) {
            // Create new session if none exists
            currentSessionId = crypto.randomUUID();
            const newSession: ChatSession = {
              id: currentSessionId,
              title: message.role === 'user' ? 
                (message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content) : 
                "New Chat",
              createdAt: new Date(),
              lastMessageAt: new Date(),
              messages: updatedMessages
            };
            updatedSessions = [newSession, ...state.chatSessions];
          } else {
            // Update existing session
            updatedSessions = state.chatSessions.map(session => 
              session.id === currentSessionId ? {
                ...session,
                lastMessageAt: new Date(),
                messages: updatedMessages,
                title: session.title === "New Chat" && message.role === 'user' ? 
                  (message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content) : 
                  session.title
              } : session
            );
          }
          
          return {
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
          if (state.currentSessionId) {
            updatedSessions = state.chatSessions.map(session => 
              session.id === state.currentSessionId ? {
                ...session,
                lastMessageAt: new Date(),
                messages: updatedMessages
              } : session
            );
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
      isVoiceMode: false,
      setVoiceMode: (enabled) => set({ isVoiceMode: enabled }),
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),
      
      // Voice
      selectedVoice: 'cedar',
      setSelectedVoice: (voice) => set({ selectedVoice: voice }),
      
    }),
    {
      name: 'arc-ai-storage',
      partialize: (state) => ({
        selectedVoice: state.selectedVoice,
        chatSessions: state.chatSessions,
        currentSessionId: state.currentSessionId
      })
    }
  )
);