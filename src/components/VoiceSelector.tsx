import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, Check, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VoiceSelectorProps {
  onSave?: () => void;
}

const VOICES: { id: VoiceName; name: string; description: string; recommended?: boolean }[] = [
  { id: 'marin', name: 'Marin', description: 'Expressive & natural', recommended: true },
  { id: 'cedar', name: 'Cedar', description: 'Natural & smooth', recommended: true },
  { id: 'coral', name: 'Coral', description: 'Warm & friendly' },
  { id: 'sage', name: 'Sage', description: 'Calm & thoughtful' },
  { id: 'alloy', name: 'Alloy', description: 'Neutral & balanced' },
  { id: 'echo', name: 'Echo', description: 'Clear & direct' },
  { id: 'shimmer', name: 'Shimmer', description: 'Bright & energetic' },
  { id: 'ash', name: 'Ash', description: 'Soft & gentle' },
  { id: 'ballad', name: 'Ballad', description: 'Expressive & dramatic' },
  { id: 'verse', name: 'Verse', description: 'Articulate & refined' },
  { id: 'nova', name: 'Nova', description: 'Warm & expressive' },
  { id: 'onyx', name: 'Onyx', description: 'Deep & authoritative' },
  { id: 'fable', name: 'Fable', description: 'Narrative & engaging' },
];

export function VoiceSelector({ onSave }: VoiceSelectorProps) {
  const { toast } = useToast();
  const { selectedVoice, setSelectedVoice, isActive, deactivateVoiceMode, activateVoiceMode } = useVoiceModeStore();
  
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [previewVoice, setPreviewVoice] = useState<VoiceName>(selectedVoice);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const playVoiceSample = async (voice: VoiceName) => {
    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    setPlayingVoice(voice);
    setPreviewVoice(voice);

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

  const handleSave = () => {
    // Stop any playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    // Save the selected voice
    setSelectedVoice(previewVoice);
    
    // If voice mode is active, restart it with new voice
    if (isActive) {
      deactivateVoiceMode();
      setTimeout(() => {
        activateVoiceMode();
      }, 500);
      toast({
        title: 'Voice updated',
        description: `Now using ${VOICES.find(v => v.id === previewVoice)?.name} voice. Restarting...`,
      });
    } else {
      toast({
        title: 'Voice saved',
        description: `${VOICES.find(v => v.id === previewVoice)?.name} will be used for voice mode`,
      });
    }

    onSave?.();
  };

  const hasChanges = previewVoice !== selectedVoice;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Volume2 className="w-4 h-4" />
        <span>Click a voice to preview it</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {VOICES.map((voice) => {
          const isSelected = previewVoice === voice.id;
          const isPlaying = playingVoice === voice.id;
          const isCurrent = selectedVoice === voice.id;

          return (
            <motion.button
              key={voice.id}
              onClick={() => playVoiceSample(voice.id)}
              disabled={isPlaying}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "relative p-3 rounded-lg border text-left transition-all",
                "hover:border-primary/50 hover:bg-primary/5",
                isSelected 
                  ? "border-primary bg-primary/10" 
                  : "border-border bg-card",
                isPlaying && "animate-pulse"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{voice.name}</span>
                    {voice.recommended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                        Best
                      </span>
                    )}
                    {isCurrent && !hasChanges && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {voice.description}
                  </p>
                </div>
                
                <div className="flex-shrink-0">
                  {isPlaying ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : isSelected ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Play className="w-4 h-4 text-muted-foreground" />
                  )}
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

      {/* Save button */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Button 
              onClick={handleSave} 
              className="w-full"
              size="sm"
            >
              Save & {isActive ? 'Restart Voice Mode' : 'Apply'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}