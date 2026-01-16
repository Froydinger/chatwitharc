import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, Check, Volume2, MessageCircle } from 'lucide-react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Import only the 4 voice avatars we need
import marinAvatar from '@/assets/voices/marin.png';
import cedarAvatar from '@/assets/voices/cedar.png';
import alloyAvatar from '@/assets/voices/alloy.png';
import onyxAvatar from '@/assets/voices/onyx.png';

interface VoiceSelectorProps {
  onSave?: () => void;
}

const VOICE_AVATARS: Record<VoiceName, string> = {
  marin: marinAvatar,
  cedar: cedarAvatar,
  alloy: alloyAvatar,
  onyx: onyxAvatar,
};

// 4 voices only: Marina, Cedric, Alex, Oliver (all noPreview - chat to hear)
const VOICES: { id: VoiceName; name: string; description: string; recommended?: boolean; noPreview?: boolean }[] = [
  { id: 'marin', name: 'Marina', description: 'Expressive & natural', recommended: true, noPreview: true },
  { id: 'cedar', name: 'Cedric', description: 'Natural & smooth', recommended: true, noPreview: true },
  { id: 'alloy', name: 'Alex', description: 'Neutral & balanced', noPreview: true },
  { id: 'onyx', name: 'Oliver', description: 'Deep & authoritative', noPreview: true },
];

export function VoiceSelector({ onSave }: VoiceSelectorProps) {
  const { toast } = useToast();
  const { selectedVoice, setSelectedVoice, isActive, deactivateVoiceMode, activateVoiceMode } = useVoiceModeStore();
  
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const playVoiceSample = async (voice: VoiceName) => {
    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    setPlayingVoice(voice);

    try {
      const { data, error } = await supabase.functions.invoke('test-voice', {
        body: { voice }
      });

      if (error) throw error;
      if (!data?.audio) throw new Error('No audio received');

      // Play the audio using data URI
      const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
      const audio = new Audio(audioUrl);
      setAudioElement(audio);
      
      audio.onended = () => {
        setPlayingVoice(null);
      };
      
      audio.onerror = () => {
        setPlayingVoice(null);
        toast({
          title: 'Playback error',
          description: 'Could not play voice sample',
          variant: 'destructive',
        });
      };

      await audio.play();
    } catch (error) {
      console.error('Failed to play voice sample:', error);
      setPlayingVoice(null);
      toast({
        title: 'Error',
        description: 'Failed to load voice sample',
        variant: 'destructive',
      });
    }
  };

  const handleSelectVoice = (voice: { id: VoiceName; noPreview?: boolean }) => {
    // Stop any playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    // Set the voice immediately (auto-save)
    setSelectedVoice(voice.id);
    
    // If voice mode is active, restart it with new voice
    if (isActive) {
      deactivateVoiceMode();
      setTimeout(() => {
        activateVoiceMode();
      }, 500);
      toast({
        title: 'Voice updated',
        description: `Now using ${VOICES.find(v => v.id === voice.id)?.name} voice. Restarting...`,
      });
    } else {
      toast({
        title: 'Voice selected',
        description: `${VOICES.find(v => v.id === voice.id)?.name} will be used for voice mode`,
      });
    }

    onSave?.();
  };

  const handlePreviewClick = (e: React.MouseEvent, voice: { id: VoiceName; noPreview?: boolean }) => {
    e.stopPropagation();
    if (!voice.noPreview) {
      playVoiceSample(voice.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Volume2 className="w-4 h-4" />
        <span>Select a voice for voice mode</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {VOICES.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isPlaying = playingVoice === voice.id;

          return (
            <motion.button
              key={voice.id}
              onClick={() => handleSelectVoice(voice)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "relative p-3 rounded-lg border text-left transition-all",
                "hover:border-primary/50 hover:bg-primary/10",
                isSelected 
                  ? "border-primary bg-primary/15 ring-1 ring-primary/30" 
                  : "border-border bg-background",
                isPlaying && "animate-pulse"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-muted">
                  <img 
                    src={VOICE_AVATARS[voice.id]} 
                    alt={voice.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{voice.name}</span>
                    {voice.recommended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                        Best
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {voice.description}
                  </p>
                  
                  {/* Preview button or "chat to hear" text */}
                  <div className="mt-1.5">
                    {voice.noPreview ? (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        Chat to hear
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handlePreviewClick(e, voice)}
                        disabled={isPlaying}
                        className={cn(
                          "text-[10px] flex items-center gap-1 px-2 py-0.5 rounded",
                          "bg-muted hover:bg-muted/80 transition-colors",
                          isPlaying && "opacity-50"
                        )}
                      >
                        {isPlaying ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {isPlaying ? 'Playing...' : 'Preview'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Playing indicator */}
              <AnimatePresence>
                {isPlaying && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    exit={{ scaleX: 0 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary origin-left"
                    transition={{ duration: 3 }}
                  />
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
