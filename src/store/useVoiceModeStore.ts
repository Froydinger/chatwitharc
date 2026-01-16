import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

// Reduced to 4 voices: Marina, Cedric, Alex, Oliver
export type VoiceName = 'marin' | 'cedar' | 'alloy' | 'onyx';

interface VoiceTurn {
  role: 'user' | 'assistant';
  transcript: string;
  timestamp: Date;
  imageUrl?: string; // If this turn included an image generation
}

interface VoiceModeState {
  // Core state
  isActive: boolean;
  status: VoiceStatus;
  isMuted: boolean;
  
  // Audio levels for orb animation
  inputAmplitude: number;
  outputAmplitude: number;
  isAudioPlaying: boolean;
  
  // Transcripts
  currentTranscript: string;
  conversationTurns: VoiceTurn[];
  
  // Voice preference
  selectedVoice: VoiceName;
  
  // Image generation state
  generatedImage: string | null;
  isGeneratingImage: boolean;
  lastGeneratedImageUrl: string | null; // Track the last generated image to attach to next assistant turn
  
  // Web search state
  isSearching: boolean;
  
  // Actions
  activateVoiceMode: () => void;
  deactivateVoiceMode: () => void;
  setStatus: (status: VoiceStatus) => void;
  setInputAmplitude: (amplitude: number) => void;
  setOutputAmplitude: (amplitude: number) => void;
  setIsAudioPlaying: (playing: boolean) => void;
  setCurrentTranscript: (transcript: string) => void;
  addConversationTurn: (turn: VoiceTurn) => void;
  clearConversation: () => void;
  setSelectedVoice: (voice: VoiceName) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setGeneratedImage: (url: string | null) => void;
  setIsGeneratingImage: (generating: boolean) => void;
  setLastGeneratedImageUrl: (url: string | null) => void;
  attachImageToLastAssistantTurn: () => void;
  setIsSearching: (searching: boolean) => void;
  interruptAI: () => void;
}

export const useVoiceModeStore = create<VoiceModeState>((set, get) => ({
  // Initial state
  isActive: false,
  status: 'idle',
  isMuted: false,
  inputAmplitude: 0,
  outputAmplitude: 0,
  isAudioPlaying: false,
  currentTranscript: '',
  conversationTurns: [],
  selectedVoice: 'cedar',
  generatedImage: null,
  isGeneratingImage: false,
  lastGeneratedImageUrl: null,
  isSearching: false,
  
  // Actions
  activateVoiceMode: () => {
    set({ 
      isActive: true, 
      status: 'connecting',
      currentTranscript: '',
      conversationTurns: [],
      isMuted: false,
      generatedImage: null,
      isGeneratingImage: false,
      lastGeneratedImageUrl: null,
      isSearching: false
    });
  },
  
  deactivateVoiceMode: () => {
    set({ 
      isActive: false, 
      status: 'idle',
      inputAmplitude: 0,
      outputAmplitude: 0,
      isAudioPlaying: false,
      currentTranscript: '',
      isMuted: false,
      generatedImage: null,
      isGeneratingImage: false,
      lastGeneratedImageUrl: null,
      isSearching: false
    });
  },
  
  setStatus: (status) => set({ status }),
  
  setInputAmplitude: (amplitude) => set({ inputAmplitude: amplitude }),
  
  setOutputAmplitude: (amplitude) => set({ outputAmplitude: amplitude }),
  
  setIsAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
  
  setCurrentTranscript: (transcript) => set({ currentTranscript: transcript }),
  
  addConversationTurn: (turn) => set((state) => ({
    conversationTurns: [...state.conversationTurns, turn]
  })),
  
  clearConversation: () => set({ 
    conversationTurns: [],
    currentTranscript: ''
  }),
  
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),
  
  setMuted: (muted) => set({ isMuted: muted }),
  
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  
  setGeneratedImage: (url) => set({ generatedImage: url }),
  
  setIsGeneratingImage: (generating) => set({ isGeneratingImage: generating }),
  
  setLastGeneratedImageUrl: (url) => set({ lastGeneratedImageUrl: url }),
  
  // Attach the last generated image to the most recent assistant turn
  attachImageToLastAssistantTurn: () => set((state) => {
    const { lastGeneratedImageUrl, conversationTurns } = state;
    if (!lastGeneratedImageUrl || conversationTurns.length === 0) return state;
    
    // Find the last assistant turn and attach the image
    const updatedTurns = [...conversationTurns];
    for (let i = updatedTurns.length - 1; i >= 0; i--) {
      if (updatedTurns[i].role === 'assistant' && !updatedTurns[i].imageUrl) {
        updatedTurns[i] = { ...updatedTurns[i], imageUrl: lastGeneratedImageUrl };
        break;
      }
    }
    
    return { 
      conversationTurns: updatedTurns,
      lastGeneratedImageUrl: null // Clear after attaching
    };
  }),
  
  setIsSearching: (searching) => set({ isSearching: searching }),
  
  // Interrupt action - will be connected to actual interrupt logic externally
  interruptAI: () => set({ status: 'listening' })
}));
