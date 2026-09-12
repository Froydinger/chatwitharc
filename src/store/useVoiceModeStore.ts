import { create } from 'zustand';
import { getVoiceAudioConstraints } from '@/utils/platform';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

// The four GPT-Live voices currently enabled and stable for ArcAI.
export type VoiceName = 'alloy' | 'ash' | 'ballad' | 'cedar' | 'coral' | 'echo' | 'fable' | 'marin' | 'nova' | 'onyx' | 'sage' | 'shimmer' | 'verse' | 'quartz' | 'ripple' | 'vesper' | 'willow' | 'stone' | 'gleam' | 'meridian' | 'bossa' | 'tempo' | 'beacon' | 'delta' | 'cinder';

export const REALTIME_SUPPORTED_VOICES: VoiceName[] = [
  'cedar', 'marin', 'ripple', 'quartz',
];

interface VoiceTurn {
  role: 'user' | 'assistant';
  transcript: string;
  timestamp: Date;
  /** Stable bridge to the live caption bubble rendered during the call. */
  liveCaptionId?: string;
  imageUrl?: string; // If this turn included an image generation
  webSearch?: {
    query: string;
    summary: string;
    sources: { url: string; title: string; snippet?: string }[];
    images?: string[];
    provider: 'tavily';
    locationUsed?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  };
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
  liveCaptionEntries: { id: string; role: 'user' | 'assistant'; text: string }[];
  appendLiveCaption: (role: 'user' | 'assistant', text: string) => string | null;
  conversationTurns: VoiceTurn[];
  
  // Voice preference
  selectedVoice: VoiceName;
  voiceSpeed: number;
  volume: number;
  
  // Image generation state
  generatedImage: string | null;
  isGeneratingImage: boolean;
  lastGeneratedImageUrl: string | null; // Track the last generated image to attach to next assistant turn
  
  // Web search state
  isSearching: boolean;
  isSearchingPastChats: boolean;
  searchSummary: {
    query: string;
    summary: string;
    sources: { url: string; title: string; snippet?: string }[];
    images?: string[];
    locationUsed?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  } | null;
  
  // Weather state
  isFetchingWeather: boolean;
  weatherData: {
    location: string;
    temperature: number;
    feelsLike: number;
    condition: string;
    code: number;
    high: number;
    low: number;
    humidity: number;
    wind: number;
    isDay: boolean;
  } | null;

  // Reminder/task state
  isSchedulingTask: boolean;
  
  // Track if user has spoken since unmuting (for mute-to-handoff)
  hasPendingSpeech: boolean;
  
  // Push-to-talk state
  isPushToTalkActive: boolean;
  setIsPushToTalkActive: (active: boolean) => void;
  
  // Voice swap lifecycle
  isVoiceSwapping: boolean;
  
  // Camera state (new)
  isCameraActive: boolean;
  cameraFacingMode: 'environment' | 'user'; // Back or front camera
  
  // Attachment state (new)
  attachedImage: string | null; // Base64 image data
  attachedImagePreview: string | null; // Preview URL for display
  attachedImageMime: string | null; // MIME type of attached image (e.g. 'image/png')
  
  // Actions
  activateVoiceMode: () => void;
  deactivateVoiceMode: () => void;
  setStatus: (status: VoiceStatus) => void;
  setInputAmplitude: (amplitude: number) => void;
  setOutputAmplitude: (amplitude: number) => void;
  setIsAudioPlaying: (playing: boolean) => void;
  setCurrentTranscript: (transcript: string) => void;
  addConversationTurn: (turn: VoiceTurn) => void;
  addUserTurnOrdered: (turn: VoiceTurn) => void;
  clearConversation: () => void;
  setSelectedVoice: (voice: VoiceName) => void;
  setVoiceSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setGeneratedImage: (url: string | null) => void;
  setIsGeneratingImage: (generating: boolean) => void;
  setLastGeneratedImageUrl: (url: string | null) => void;
  attachImageToLastAssistantTurn: () => void;
  setIsSearching: (searching: boolean) => void;
  setIsSearchingPastChats: (searching: boolean) => void;
  setSearchSummary: (summary: VoiceModeState['searchSummary']) => void;
  setIsFetchingWeather: (fetching: boolean) => void;
  setWeatherData: (data: VoiceModeState['weatherData']) => void;
  setIsSchedulingTask: (scheduling: boolean) => void;
  clearToolPanels: () => void;
  setHasPendingSpeech: (pending: boolean) => void;
  setIsVoiceSwapping: (swapping: boolean) => void;
  interruptAI: () => void;
  
  // Camera actions (new)
  activateCamera: () => void;
  deactivateCamera: () => void;
  toggleCameraFacing: () => void;
  
  // Attachment actions (new)
  setAttachedImage: (base64: string, previewUrl: string, mimeType?: string) => void;
  clearAttachment: () => void;
}

// Volume change listener ref for active transport
let globalVolumeChangeHandler: ((vol: number) => void) | null = null;
export function setGlobalVolumeChangeHandler(handler: ((vol: number) => void) | null) {
  globalVolumeChangeHandler = handler;
}

// User-gesture microphone pre-warming
let pendingMicPromise: Promise<MediaStream> | null = null;

export function prewarmMicrophone(): Promise<MediaStream> | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  if (pendingMicPromise) return pendingMicPromise;

  try {
    const promise = navigator.mediaDevices.getUserMedia({
      audio: getVoiceAudioConstraints(),
    });
    promise.catch(() => {
      // Handled downstream during connection
    });
    pendingMicPromise = promise;
    return promise;
  } catch (_) {
    return null;
  }
}

export function consumePendingMicStream(): Promise<MediaStream> | null {
  const p = pendingMicPromise;
  pendingMicPromise = null;
  return p;
}

export function releasePendingMicStream(): void {
  if (pendingMicPromise) {
    const p = pendingMicPromise;
    pendingMicPromise = null;
    p.then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
    }).catch(() => {});
  }
}

export function getStoredVoiceVolume(): number {
  try {
    const v = localStorage.getItem('arc_voice_volume');
    if (v !== null) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
  } catch (_) {
    // localStorage unavailable
  }
  return 1.0;
}

export function getStoredVoiceSpeed(): number {
  try {
    const s = localStorage.getItem('arc_voice_speed');
    if (s !== null) {
      const parsed = parseFloat(s);
      if (!isNaN(parsed) && parsed >= 0.75 && parsed <= 1.5) return parsed;
    }
  } catch (_) {
    // localStorage unavailable
  }
  return 1.0;
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
  liveCaptionEntries: [],
  conversationTurns: [],
  selectedVoice: 'marin',
  voiceSpeed: getStoredVoiceSpeed(),
  volume: getStoredVoiceVolume(),
  generatedImage: null,
  isGeneratingImage: false,
  lastGeneratedImageUrl: null,
  isSearching: false,
  isSearchingPastChats: false,
  searchSummary: null,
  isFetchingWeather: false,
  weatherData: null,
  isSchedulingTask: false,
  // Push-to-talk state
  isPushToTalkActive: false,
  setIsPushToTalkActive: (active) => set({ isPushToTalkActive: active }),
  
  // Camera initial state
  isCameraActive: false,
  cameraFacingMode: 'environment',
  
  // Attachment initial state
  attachedImage: null,
  attachedImagePreview: null,
  attachedImageMime: null,
  
  // Actions
  activateVoiceMode: () => {
    prewarmMicrophone();
    set({ 
      isActive: true, 
      liveCaptionEntries: [],
      // The microphone may be prewarmed before GPT-Live is ready. Keep the
      // UI in Connecting until the live session confirms it can listen.
      status: 'connecting',
      currentTranscript: '',
      conversationTurns: [],
      isMuted: false,
      generatedImage: null,
      isGeneratingImage: false,
      lastGeneratedImageUrl: null,
      isSearching: false,
      isSearchingPastChats: false,
      searchSummary: null,
      isFetchingWeather: false,
      weatherData: null,
      isSchedulingTask: false,
      hasPendingSpeech: false,
      isVoiceSwapping: false,
      // Reset camera/attachment on new session
      isCameraActive: false,
      attachedImage: null,
      attachedImagePreview: null,
      attachedImageMime: null
    });
  },
  
  deactivateVoiceMode: () => {
    releasePendingMicStream();
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
      isSearching: false,
      isSearchingPastChats: false,
      searchSummary: null,
      isFetchingWeather: false,
      weatherData: null,
      isSchedulingTask: false,
      hasPendingSpeech: false,
      isVoiceSwapping: false,
      // Clean up camera/attachment
      isCameraActive: false,
      attachedImage: null,
      attachedImagePreview: null,
      attachedImageMime: null
    });
  },
  
  setStatus: (status) => set({ status }),
  
  setInputAmplitude: (amplitude) => set({ inputAmplitude: amplitude }),
  
  setOutputAmplitude: (amplitude) => set({ outputAmplitude: amplitude }),
  
  setIsAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
  
  setCurrentTranscript: (transcript) => set({ currentTranscript: transcript }),
  appendLiveCaption: (role, text) => {
    if (!text) return null;
    let captionId: string | null = null;
    set((state) => {
      const entries = [...state.liveCaptionEntries];
      const last = entries[entries.length - 1];
      captionId = last?.role === role ? last.id : crypto.randomUUID();
      if (last?.role === role) entries[entries.length - 1] = { ...last, text: last.text + text };
      else entries.push({ id: captionId, role, text });
      return { liveCaptionEntries: entries };
    });
    return captionId;
  },
  
  addConversationTurn: (turn) => set((state) => {
    // Keep enough transcript history to survive a legitimate long-session
    // Realtime reconnect without forgetting the topic from earlier in the call.
    const MAX_TURNS = 120;
    const newTurns = [...state.conversationTurns, turn];
    const trimmedTurns = newTurns.length > MAX_TURNS
      ? newTurns.slice(-MAX_TURNS)
      : newTurns;
    return { conversationTurns: trimmedTurns };
  }),
  
  // Insert a late-arriving user turn in conversational order.
  // If the latest turn is assistant, place user right before that latest assistant only.
  addUserTurnOrdered: (turn) => set((state) => {
    const MAX_TURNS = 120;
    const turns = [...state.conversationTurns];

    if (turns.length > 0 && turns[turns.length - 1].role === 'assistant') {
      // Insert before only the most recent assistant turn
      turns.splice(turns.length - 1, 0, turn);
    } else {
      turns.push(turn);
    }

    const trimmedTurns = turns.length > MAX_TURNS ? turns.slice(-MAX_TURNS) : turns;
    return { conversationTurns: trimmedTurns };
  }),
  
  clearConversation: () => set({ 
    conversationTurns: [],
    currentTranscript: ''
  }),
  
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),

  setVoiceSpeed: (speed) => {
    const clamped = Math.max(0.75, Math.min(1.5, Math.round(speed * 100) / 100));
    try {
      localStorage.setItem('arc_voice_speed', clamped.toString());
    } catch (_) {
      // localStorage unavailable
    }
    set({ voiceSpeed: clamped });
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
    try {
      localStorage.setItem('arc_voice_volume', clamped.toString());
    } catch (_) {
      // localStorage unavailable
    }
    set({ volume: clamped });
    if (globalVolumeChangeHandler) {
      globalVolumeChangeHandler(clamped);
    }
  },
  
  setMuted: (muted) => set({ isMuted: muted }),
  
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  
  setGeneratedImage: (url) => set((state) => ({
    generatedImage: url,
    // Mutual exclusion when a new image arrives
    searchSummary: url ? null : state.searchSummary,
    weatherData: url ? null : state.weatherData,
  })),
  
  setIsGeneratingImage: (generating) => set((state) => ({
    isGeneratingImage: generating,
    // When starting to generate, clear competing panels
    searchSummary: generating ? null : state.searchSummary,
    weatherData: generating ? null : state.weatherData,
  })),
  
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
  
  setIsSearching: (searching) => set((state) => ({
    isSearching: searching,
    // When starting a search, clear competing panels
    generatedImage: searching ? null : state.generatedImage,
    weatherData: searching ? null : state.weatherData,
  })),

  setIsSearchingPastChats: (searching) => set({ isSearchingPastChats: searching }),
  
  setSearchSummary: (summary) => set({
    searchSummary: summary,
    // Mutual exclusion: clear other tool panels
    generatedImage: summary ? null : (get() as any).generatedImage,
    weatherData: summary ? null : (get() as any).weatherData,
  }),
  
  setIsFetchingWeather: (fetching) => set({ isFetchingWeather: fetching }),
  
  setWeatherData: (data) => set({
    weatherData: data,
    // Mutual exclusion
    generatedImage: data ? null : (get() as any).generatedImage,
    searchSummary: data ? null : (get() as any).searchSummary,
  }),

  setIsSchedulingTask: (scheduling) => set({ isSchedulingTask: scheduling }),
  
  clearToolPanels: () => set({
    generatedImage: null,
    isGeneratingImage: false,
    isSearching: false,
    isSearchingPastChats: false,
    searchSummary: null,
    isFetchingWeather: false,
    weatherData: null,
    isSchedulingTask: false,
  }),
  
  setHasPendingSpeech: (pending) => set({ hasPendingSpeech: pending }),
  
  setIsVoiceSwapping: (swapping) => set({ isVoiceSwapping: swapping }),

  // Interrupt action - will be connected to actual interrupt logic externally
  interruptAI: () => set({ status: 'listening' }),
  
  // Camera actions
  activateCamera: () => set({ isCameraActive: true }),
  
  deactivateCamera: () => set({ isCameraActive: false }),
  
  toggleCameraFacing: () => set((state) => ({ 
    cameraFacingMode: state.cameraFacingMode === 'environment' ? 'user' : 'environment' 
  })),
  
  // Attachment actions
  setAttachedImage: (base64, previewUrl, mimeType) => set({ 
    attachedImage: base64, 
    attachedImagePreview: previewUrl,
    attachedImageMime: mimeType ?? 'image/jpeg'
  }),
  
  clearAttachment: () => set({ 
    attachedImage: null, 
    attachedImagePreview: null,
    attachedImageMime: null
  })
}));
