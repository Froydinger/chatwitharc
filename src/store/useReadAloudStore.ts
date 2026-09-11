import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceModeStore, type VoiceName } from '@/store/useVoiceModeStore';
import { toast } from '@/hooks/use-toast';

interface ReadAloudState {
  playingMessageId: string | null;
  loadingMessageId: string | null;
  playMessage: (messageId: string, text: string, voice?: VoiceName) => Promise<void>;
  stop: () => void;
}

let generation = 0;
let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let request: AbortController | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;

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


export const stopReadAloud = () => {
  generation++;
  request?.abort();
  request = null;
  if (timeout) clearTimeout(timeout);
  timeout = null;
  const oldSource = source;
  source = null;
  if (oldSource) {
    oldSource.onended = null;
    try { oldSource.stop(); } catch { /* already stopped */ }
    oldSource.disconnect();
  }
  const oldContext = context;
  context = null;
  if (oldContext && oldContext.state !== 'closed') void oldContext.close().catch(() => {});
  useReadAloudStore.setState({ playingMessageId: null, loadingMessageId: null });
};

if (typeof window !== 'undefined') {
  useVoiceModeStore.subscribe((state, previous) => {
    if (state.isActive && !previous.isActive) stopReadAloud();
  });
}

export const useReadAloudStore = create<ReadAloudState>((set, get) => ({
  playingMessageId: null,
  loadingMessageId: null,
  playMessage: async (messageId, rawText, explicitVoice) => {
    const toggleOff = get().playingMessageId === messageId || get().loadingMessageId === messageId;
    stopReadAloud();
    if (toggleOff || useVoiceModeStore.getState().isActive) return;
    const text = cleanTextForSpeech(rawText);
    if (!text) return;
    const run = generation;
    set({ loadingMessageId: messageId, playingMessageId: null });
    try {
      // Resume inside the original tap, before awaiting the network: required
      // for reliable iOS playback. Read Aloud never acquires a microphone.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext: AudioContext = new AudioContextClass();
      context = audioContext;
      const controller = new AbortController();
      request = controller;
      timeout = setTimeout(() => {
        if (run !== generation) return;
        stopReadAloud();
        toast({ title: 'Read aloud timed out', description: 'Please tap Read aloud to try again.', variant: 'destructive' });
      }, 30000);
      await audioContext.resume();
      if (run !== generation) return;
      const voice = explicitVoice || useVoiceModeStore.getState().selectedVoice || 'marin';
      const { data, error } = await supabase.functions.invoke('test-voice', {
        body: { voice, text },
        signal: controller.signal,
      });
      if (run !== generation) return;
      if (error || !data?.audio) throw new Error('Speech generation failed');
      const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
      const buffer = await audioContext.decodeAudioData(bytes.buffer);
      if (run !== generation) return;
      if (audioContext.state !== 'running') throw new Error('Audio playback is blocked');
      const player = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = useVoiceModeStore.getState().volume ?? 1;
      player.buffer = buffer;
      player.playbackRate.value = useVoiceModeStore.getState().voiceSpeed || 1;
      player.connect(gain);
      gain.connect(audioContext.destination);
      source = player;
      player.onended = () => { if (run === generation) stopReadAloud(); };
      player.start();
      if (timeout) clearTimeout(timeout);
      timeout = null;
      request = null;
      set({ playingMessageId: messageId, loadingMessageId: null });
    } catch {
      if (run !== generation) return;
      stopReadAloud();
      toast({ title: 'Could not start Read aloud', description: 'Please tap Read aloud to try again.', variant: 'destructive' });
    }
  },
  stop: stopReadAloud,
}));
