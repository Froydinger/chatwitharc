import { Gauge, Volume2 } from 'lucide-react';
import { useVoiceModeStore, VoiceName } from '@/store/useVoiceModeStore';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { VOICES } from '@/constants/voices';
import { Slider } from '@/components/ui/slider';
import { VoiceMagneticPicker } from '@/components/VoiceMagneticPicker';

interface VoiceSelectorProps {
  onSave?: () => void;
}

export function VoiceSelector({ onSave }: VoiceSelectorProps) {
  const { toast } = useToast();
  const { selectedVoice, setSelectedVoice, voiceSpeed, setVoiceSpeed } = useVoiceModeStore();
  const { updateProfile } = useProfile();

  const handleSelectVoice = async (voice: VoiceName) => {
    setSelectedVoice(voice);

    try {
      await updateProfile({ preferred_voice: voice });
    } catch (error) {
      console.error('Failed to persist voice preference:', error);
    }

    toast({
      title: 'Voice selected',
      description: `${VOICES.find((item) => item.id === voice)?.name} will be used for voice mode`,
    });
    onSave?.();
  };

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Volume2 className="h-4 w-4" />
        <span>Select a voice for voice mode</span>
      </div>

      <VoiceMagneticPicker
        selectedVoice={selectedVoice}
        onSelect={(voice) => void handleSelectVoice(voice)}
      />

      <div className="space-y-2.5 border-t border-border/40 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Gauge className="h-4 w-4 text-primary" />
            <span>Speaking Speed</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {voiceSpeed.toFixed(2)}x {voiceSpeed === 1 ? '(Default)' : voiceSpeed < 1 ? '(Relaxed)' : '(Brisk)'}
          </span>
        </div>
        <div className="px-1 pb-1 pt-1">
          <Slider
            value={[Math.round(voiceSpeed * 100)]}
            min={75}
            max={150}
            step={5}
            onValueChange={(values) => setVoiceSpeed(values[0] / 100)}
            className="w-full"
            aria-label="Speaking Speed Slider"
          />
        </div>
        <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
          <span>0.75x Relaxed</span>
          <span>1.0x Normal</span>
          <span>1.25x Brisk</span>
          <span>1.5x Fast</span>
        </div>
      </div>
    </div>
  );
}
