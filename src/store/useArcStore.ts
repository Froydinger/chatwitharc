import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  type: 'text' | 'voice' | 'image';
  imageUrl?: string;
}

export interface ArcState {
  // API Key Management
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  
  // Chat State
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  
  // UI State
  currentTab: 'chat' | 'voice' | 'settings' | 'info';
  setCurrentTab: (tab: 'chat' | 'voice' | 'settings' | 'info') => void;
  isVoiceMode: boolean;
  setVoiceMode: (enabled: boolean) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  
  // Voice Settings
  selectedVoice: 'cedar' | 'marin';
  setSelectedVoice: (voice: 'cedar' | 'marin') => void;
  
  // Theme
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useArcStore = create<ArcState>()(
  persist(
    (set, get) => ({
      // API Key
      apiKey: null,
      setApiKey: (key) => set({ apiKey: key }),
      
      // Chat
      messages: [],
      addMessage: (message) => set((state) => ({
        messages: [...state.messages, {
          ...message,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date()
        }]
      })),
      clearMessages: () => set({ messages: [] }),
      
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
      
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'arc-ai-storage',
      partialize: (state) => ({
        apiKey: state.apiKey,
        selectedVoice: state.selectedVoice,
        theme: state.theme
      })
    }
  )
);