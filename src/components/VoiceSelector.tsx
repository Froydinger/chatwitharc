import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, Check, Volume2, MessageCircle, Gauge } from 'lucide-react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';
import { VOICES, REALTIME_VOICES, VOICE_AVATARS } from '@/constants/voices';
import { Slider } from '@/components/ui/slider';

interface VoiceSelectorProps {
  onSave?: () => void;
}

export function VoiceSelector({ onSave }: VoiceSelectorProps) {
  const { toast } = useToast();
  const { selectedVoice, setSelectedVoice, voiceSpeed, setVoiceSpeed, isActive } = useVoiceModeStore();
  const { updateProfile } = useProfile();
  
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const playVoiceSample = async (voice: VoiceName) => {
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

      const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
      const audio = new Audio(audioUrl);
      setAudioElement(audio);
      
      audio.onended = () => setPlayingVoice(null);
      audio.onerror = () => {
        setPlayingVoice(null);
        toast({ title: 'Playback error', description: 'Could not play voice sample', variant: 'destructive' });
      };

      await audio.play();
    } catch (error) {
      console.error('Failed to play voice sample:', error);
      setPlayingVoice(null);
      toast({ title: 'Error', description: 'Failed to load voice sample', variant: 'destructive' });
    }
  };

  const handleSelectVoice = async (voice: { id: VoiceName; noPreview?: boolean }) => {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    setSelectedVoice(voice.id);
    
    // Persist to profile for cross-device sync
    try {
      await updateProfile({ preferred_voice: voice.id });
    } catch (err) {
      console.error('Failed to persist voice preference:', err);
    }
    
    toast({ 
      title: 'Voice selected', 
      description: `${VOICES.find(v => v.id === voice.id)?.name} will be used for voice mode` 
    });

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

      <div className="flex flex-col gap-1.5">
        {REALTIME_VOICES.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isPlaying = playingVoice === voice.id;

          return (
            <motion.button
              key={voice.id}
              onClick={() => handleSelectVoice(voice)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                "relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full",
                "hover:border-primary/30 hover:bg-primary/5",
                isSelected 
                  ? "border-primary/30 bg-primary/5" 
                  : "border-border bg-background",
                isPlaying && "animate-pulse"
              )}
            >
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-muted transition-shadow",
                isSelected && "shadow-[0_0_12px_4px_hsl(var(--primary)/0.5)]"
              )}>
                <img 
                  src={VOICE_AVATARS[voice.id]} 
                  alt={voice.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
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
              </div>

              <div className="flex-shrink-0">
                {voice.noPreview ? (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                  </span>
                ) : (
                  <button
                    onClick={(e) => handlePreviewClick(e, voice)}
                    disabled={isPlaying}
                    className={cn(
                      "text-[10px] flex items-center gap-1 px-2 py-1 rounded",
                      "bg-muted hover:bg-muted/80 transition-colors",
                      isPlaying && "opacity-50"
                    )}
                  >
                    {isPlaying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>

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

      {/* Speaking Speed Slider */}
      <div className="pt-3 border-t border-border/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Gauge className="w-4 h-4 text-primary" />
            <span>Speaking Speed</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {voiceSpeed.toFixed(2)}x {voiceSpeed === 1 ? '(Default)' : voiceSpeed < 1 ? '(Relaxed)' : '(Brisk)'}
          </span>
        </div>
        <div className="px-1 pt-1 pb-1">
          <Slider
            value={[Math.round(voiceSpeed * 100)]}
            min={75}
            max={150}
            step={5}
            onValueChange={(vals) => setVoiceSpeed(vals[0] / 100)}
            className="w-full"
            aria-label="Speaking Speed Slider"
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>0.75x Relaxed</span>
          <span>1.0x Normal</span>
          <span>1.25x Brisk</span>
          <span>1.5x Fast</span>
        </div>
      </div>
    </div>
  );
}
