import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

// Reduced to 4 voices: Marina, Cedric, Alex, Oliver
export type VoiceName = 'marin' | 'cedar' | 'alloy' | 'onyx';

interface VoiceTurn {
  role: 'user' | 'assistant';
  transcript: string;
  timestamp: Date;
}

interface VoiceModeState {
  // Core state
  isActive: boolean;
  status: VoiceStatus;
  isMuted: boolean;
  
  // Audio levels for orb animation
  inputAmplitude: number;
  outputAmplitude: number;
  
  // Transcripts
  currentTranscript: string;
  conversationTurns: VoiceTurn[];
  
  // Voice preference
  selectedVoice: VoiceName;
  
  // Image generation state
  generatedImage: string | null;
  isGeneratingImage: boolean;
  
  // Actions
  activateVoiceMode: () => void;
  deactivateVoiceMode: () => void;
  setStatus: (status: VoiceStatus) => void;
  setInputAmplitude: (amplitude: number) => void;
  setOutputAmplitude: (amplitude: number) => void;
  setCurrentTranscript: (transcript: string) => void;
  addConversationTurn: (turn: VoiceTurn) => void;
  clearConversation: () => void;
  setSelectedVoice: (voice: VoiceName) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setGeneratedImage: (url: string | null) => void;
  setIsGeneratingImage: (generating: boolean) => void;
}

export const useVoiceModeStore = create<VoiceModeState>((set, get) => ({
  // Initial state
  isActive: false,
  status: 'idle',
  isMuted: false,
  inputAmplitude: 0,
  outputAmplitude: 0,
  currentTranscript: '',
  conversationTurns: [],
  selectedVoice: 'cedar',
  generatedImage: null,
  isGeneratingImage: false,
  
  // Actions
  activateVoiceMode: () => {
    set({ 
      isActive: true, 
      status: 'connecting',
      currentTranscript: '',
      conversationTurns: [],
      isMuted: false,
      generatedImage: null,
      isGeneratingImage: false
    });
  },
  
  deactivateVoiceMode: () => {
    set({ 
      isActive: false, 
      status: 'idle',
      inputAmplitude: 0,
      outputAmplitude: 0,
      currentTranscript: '',
      isMuted: false,
      generatedImage: null,
      isGeneratingImage: false
    });
  },
  
  setStatus: (status) => set({ status }),
  
  setInputAmplitude: (amplitude) => set({ inputAmplitude: amplitude }),
  
  setOutputAmplitude: (amplitude) => set({ outputAmplitude: amplitude }),
  
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
  
  setIsGeneratingImage: (generating) => set({ isGeneratingImage: generating })
}));
