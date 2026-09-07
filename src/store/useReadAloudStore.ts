import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceModeStore, type VoiceName } from '@/store/useVoiceModeStore';

interface ReadAloudState {
  playingMessageId: string | null;
  loadingMessageId: string | null;
  playMessage: (messageId: string, text: string, voice?: VoiceName) => Promise<void>;
  stop: () => void;
}

let currentAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, string>();

/**
 * Strip code blocks, markdown symbols, links, images, and excessive formatting
 * so the text reads aloud smoothly and naturally.
 */
export function cleanTextForSpeech(markdown: string): string {
  if (!markdown) return '';

  let text = markdown;

  // Remove fenced code blocks (```...```)
  text = text.replace(/```[\s\S]*?```/g, ' [code block omitted] ');

  // Remove inline code (`...`)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove images (![alt](url))
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  // Remove markdown links ([text](url) -> text)
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove HTML tags (<tag>...</tag> or <tag />)
  text = text.replace(/<[^>]+>/g, '');

  // Remove markdown headers (#, ##, etc.)
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic/strikethrough markers
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // Remove blockquotes (>)
  text = text.replace(/^>\s+/gm, '');

  // Remove bullet and numbered list markers
  text = text.replace(/^[-*+]\s+/gm, '');
  text = text.replace(/^\d+\.\s+/gm, '');

  // Collapse whitespace
  text = text.replace(/\n\s*\n+/g, ' ').replace(/\s+/g, ' ').trim();

  // OpenAI TTS endpoint max length is 4096 characters
  return text.slice(0, 4000);
}

function speakWithBrowser(text: string, rate: number, messageId: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.max(0.7, Math.min(1.8, rate));
    utterance.onend = () => {
      useReadAloudStore.setState((s) => s.playingMessageId === messageId ? { playingMessageId: null } : s);
    };
    utterance.onerror = () => {
      useReadAloudStore.setState((s) => s.playingMessageId === messageId ? { playingMessageId: null } : s);
    };
    useReadAloudStore.setState({ playingMessageId: messageId, loadingMessageId: null });
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[ReadAloud] Browser speech synthesis failed:', err);
    useReadAloudStore.setState({ playingMessageId: null, loadingMessageId: null });
  }
}

export const stopReadAloud = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = '';
    } catch (_) {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
  useReadAloudStore.setState({ playingMessageId: null, loadingMessageId: null });
};

// If full Voice Mode opens, stop any active Read Aloud immediately
if (typeof window !== 'undefined') {
  useVoiceModeStore.subscribe((state, prevState) => {
    if (state.isActive && !prevState.isActive) {
      stopReadAloud();
    }
  });
}

export const useReadAloudStore = create<ReadAloudState>((set, get) => ({
  playingMessageId: null,
  loadingMessageId: null,

  playMessage: async (messageId: string, rawText: string, explicitVoice?: VoiceName) => {
    const current = get();

    // Toggle off if already playing or loading this message
    if (current.playingMessageId === messageId || current.loadingMessageId === messageId) {
      stopReadAloud();
      return;
    }

    // Stop any previously playing audio
    stopReadAloud();

    const cleanText = cleanTextForSpeech(rawText);
    if (!cleanText) return;

    const voice = explicitVoice || useVoiceModeStore.getState().selectedVoice || 'marin';
    const cacheKey = `${messageId}:${voice}`;

    set({ loadingMessageId: messageId, playingMessageId: null });

    try {
      let audioUrl = audioCache.get(cacheKey);

      if (!audioUrl) {
        const { data, error } = await supabase.functions.invoke('test-voice', {
          body: { voice, text: cleanText }
        });

        if (error || !data?.audio) {
          throw new Error(error?.message || 'No audio returned');
        }

        audioUrl = `data:audio/mpeg;base64,${data.audio}`;
        audioCache.set(cacheKey, audioUrl);
      }

      // Check if user clicked stop or clicked another message while loading
      if (get().loadingMessageId !== messageId) return;

      const audio = new Audio(audioUrl);
      currentAudio = audio;

      const voiceSpeed = useVoiceModeStore.getState().voiceSpeed || 1.0;
      const volume = useVoiceModeStore.getState().volume ?? 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, voiceSpeed));
      audio.volume = Math.max(0, Math.min(1.0, volume));

      audio.onended = () => {
        if (currentAudio === audio) {
          currentAudio = null;
          set({ playingMessageId: null });
        }
      };

      audio.onerror = () => {
        if (currentAudio === audio) {
          currentAudio = null;
          set({ playingMessageId: null });
        }
        // Fall back to Web Speech API
        speakWithBrowser(cleanText, voiceSpeed, messageId);
      };

      await audio.play();
      set({ playingMessageId: messageId, loadingMessageId: null });
    } catch (err) {
      console.warn('[ReadAloud] Cloud TTS failed, falling back to browser synthesis:', err);
      if (get().loadingMessageId === messageId) {
        const voiceSpeed = useVoiceModeStore.getState().voiceSpeed || 1.0;
        speakWithBrowser(cleanText, voiceSpeed, messageId);
      }
    }
  },

  stop: stopReadAloud,
}));
