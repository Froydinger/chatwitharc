import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceModeStore, type VoiceName, REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';
import { RealtimeBrowserTransport } from '@/lib/realtimeBrowserTransport';
import { readEdgeErrorBody } from '@/lib/invokeEdgeFunction';

interface ReadAloudState {
  playingMessageId: string | null;
  loadingMessageId: string | null;
  playMessage: (messageId: string, text: string, voice?: VoiceName) => Promise<void>;
  stop: () => void;
}

let activeReadTransport: RealtimeBrowserTransport | null = null;
let activeDisconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentBrowserUtterance: SpeechSynthesisUtterance | null = null;

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

  // Realtime limit protection
  return text.slice(0, 4000);
}

function speakWithBrowser(text: string, rate: number, messageId: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    useReadAloudStore.setState({ playingMessageId: null, loadingMessageId: null });
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    currentBrowserUtterance = utterance;
    utterance.rate = Math.max(0.7, Math.min(1.8, rate));
    utterance.onend = () => {
      if (currentBrowserUtterance === utterance) currentBrowserUtterance = null;
      useReadAloudStore.setState((s) => s.playingMessageId === messageId ? { playingMessageId: null } : s);
    };
    utterance.onerror = () => {
      if (currentBrowserUtterance === utterance) currentBrowserUtterance = null;
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
  if (activeDisconnectTimeout) {
    clearTimeout(activeDisconnectTimeout);
    activeDisconnectTimeout = null;
  }
  if (activeReadTransport) {
    try {
      activeReadTransport.close(1000, 'read_aloud_stopped');
    } catch (_) {}
    activeReadTransport = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
    currentBrowserUtterance = null;
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

    const currentVoice = explicitVoice || useVoiceModeStore.getState().selectedVoice || 'marin';
    const safeVoice = REALTIME_SUPPORTED_VOICES.includes(currentVoice) ? currentVoice : 'marin';

    set({ loadingMessageId: messageId, playingMessageId: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Check if user clicked stop while loading session
      if (get().loadingMessageId !== messageId) return;

      // Create an output-only GPT-Live WebRTC transport. This deliberately
      // does not acquire a microphone or share the active Voice Mode socket.
      const transport = new RealtimeBrowserTransport({
        disableMicrophone: true,
        negotiateSdp: async (offerSdp) => {
          const { data, error } = await supabase.functions.invoke('openai-realtime-proxy', {
            body: {
              sdp: offerSdp,
              voice: safeVoice,
              instructions: 'Read the supplied text exactly as written. Do not add commentary, summarize, or answer it.',
              backendInstructions: 'No backend reasoning or tools are needed for this output-only read-aloud request.',
              tools: [],
            },
          });

          if (error) {
            const details = await readEdgeErrorBody(error);
            throw new Error(
              typeof details?.error === 'string'
                ? details.error
                : error.message || 'Failed to create read-aloud voice session',
            );
          }

          const answerSdp = typeof data?.transport?.sdp === 'string'
            ? data.transport.sdp
            : data?.sdp;
          if (typeof answerSdp !== 'string' || !/^v=0(?:\r?\n|$)/.test(answerSdp)) {
            throw new Error(data?.error || 'GPT-Live returned an invalid read-aloud SDP answer.');
          }
          return { answerSdp, sessionId: data?.session?.id };
        },
      });
      activeReadTransport = transport;

      const volume = useVoiceModeStore.getState().volume ?? 1.0;
      transport.setVolume(volume);

      let responseDoneReceived = false;

      // Handle server events
      transport.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'response.audio_transcript.delta' || data.type === 'output_audio_buffer.started') {
            if (get().loadingMessageId === messageId) {
              set({ playingMessageId: messageId, loadingMessageId: null });
            }
          }

          if (data.type === 'response.done') {
            responseDoneReceived = true;
          }

          if (data.type === 'output_audio_buffer.stopped' || (data.type === 'response.done' && responseDoneReceived)) {
            // Buffer stopped playing; allow slight delay for last samples to reach speakers
            if (activeDisconnectTimeout) clearTimeout(activeDisconnectTimeout);
            activeDisconnectTimeout = setTimeout(() => {
              if (activeReadTransport === transport) {
                stopReadAloud();
              }
            }, 600);
          }
        } catch (_) {}
      };

      transport.onerror = () => {
        if (activeReadTransport === transport) {
          stopReadAloud();
        }
      };

      transport.onclose = () => {
        if (activeReadTransport === transport) {
          activeReadTransport = null;
          set((s) => s.playingMessageId === messageId ? { playingMessageId: null } : s);
        }
      };

      transport.onopen = () => {
        // Send session.update with verbatim read-aloud instructions and exact text prompt
        transport.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `You are an accurate, verbatim text-to-speech engine. Read the provided text exactly as is without any commentary, conversational intro, summary, filler, or alterations.`,
            type: 'realtime',
            output_modalities: ['audio'],
            audio: {
              input: {
                turn_detection: null, // Output-only; no VAD
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: safeVoice,
              },
            },
            tool_choice: 'none',
          },
        }));

        // Send conversation item containing the text to read
        transport.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `READ THIS EXACTLY AS IS:\n\n${cleanText}`,
              },
            ],
          },
        }));

        // Request audio generation
        transport.send(JSON.stringify({
          type: 'response.create',
        }));
      };

      await transport.connect();
    } catch (err) {
      console.warn('[ReadAloud] Voice session failed, falling back to browser synthesis:', err);
      if (get().loadingMessageId === messageId) {
        const voiceSpeed = useVoiceModeStore.getState().voiceSpeed || 1.0;
        speakWithBrowser(cleanText, voiceSpeed, messageId);
      }
    }
  },

  stop: stopReadAloud,
}));
