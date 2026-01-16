import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export type VoiceName = 'marin' | 'cedar' | 'coral' | 'sage' | 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'verse' | 'nova' | 'onyx' | 'fable';

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
  selectedVoice: 'coral',
  
  // Actions
  activateVoiceMode: () => {
    set({ 
      isActive: true, 
      status: 'connecting',
      currentTranscript: '',
      conversationTurns: [],
      isMuted: false
    });
  },
  
  deactivateVoiceMode: () => {
    set({ 
      isActive: false, 
      status: 'idle',
      inputAmplitude: 0,
      outputAmplitude: 0,
      currentTranscript: '',
      isMuted: false
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
  
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted }))
}));
