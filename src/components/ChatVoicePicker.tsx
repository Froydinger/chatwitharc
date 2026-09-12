import { ArcControlPicker } from '@/components/ArcControlPicker';
import type { VoiceName } from '@/store/useVoiceModeStore';

export function ChatVoicePicker({ name, selectedVoice, onSelect }: {
  name: string; selectedVoice: VoiceName; onSelect: (voice: VoiceName) => void;
}) {
  return <ArcControlPicker name={name} selectedVoice={selectedVoice} onSelectVoice={onSelect} />;
}
