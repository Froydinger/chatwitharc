import { VoiceName } from '@/store/useVoiceModeStore';

import alloyAvatar from '@/assets/voices/alloy.png';
import ashAvatar from '@/assets/voices/ash.png';
import balladAvatar from '@/assets/voices/ballad.png';
import cedarAvatar from '@/assets/voices/cedar.png';
import coralAvatar from '@/assets/voices/coral.png';
import echoAvatar from '@/assets/voices/echo.png';
import fableAvatar from '@/assets/voices/fable.png';
import marinAvatar from '@/assets/voices/marin.png';
import novaAvatar from '@/assets/voices/nova.png';
import onyxAvatar from '@/assets/voices/onyx.png';
import sageAvatar from '@/assets/voices/sage.png';
import shimmerAvatar from '@/assets/voices/shimmer.png';
import verseAvatar from '@/assets/voices/verse.png';

export const VOICE_AVATARS: Record<VoiceName, string> = {
  alloy: alloyAvatar,
  ash: ashAvatar,
  ballad: balladAvatar,
  cedar: cedarAvatar,
  coral: coralAvatar,
  echo: echoAvatar,
  fable: fableAvatar,
  marin: marinAvatar,
  nova: novaAvatar,
  onyx: onyxAvatar,
  sage: sageAvatar,
  shimmer: shimmerAvatar,
  verse: verseAvatar,
};

export interface VoiceOption {
  id: VoiceName;
  name: string;
  description: string;
  recommended?: boolean;
  noPreview?: boolean;
}

// Sorted alphabetically by display name
export const VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'Alex', description: 'Neutral & balanced', noPreview: true },
  { id: 'ash', name: 'Ashton', description: 'Warm & confident', noPreview: true },
  { id: 'ballad', name: 'Belle', description: 'Melodic & soothing', noPreview: true },
  { id: 'cedar', name: 'Cedric', description: 'Natural & smooth', recommended: true, noPreview: true },
  { id: 'coral', name: 'Cora', description: 'Friendly & bright', noPreview: true },
  { id: 'echo', name: 'Ethan', description: 'Clear & resonant', noPreview: true },
  { id: 'fable', name: 'Fiona', description: 'Storytelling warmth', noPreview: true },
  { id: 'marin', name: 'Marina', description: 'Expressive & natural', recommended: true, noPreview: true },
  { id: 'nova', name: 'Nadia', description: 'Energetic & vivid', noPreview: true },
  { id: 'onyx', name: 'Oliver', description: 'Deep & authoritative', noPreview: true },
  { id: 'sage', name: 'Sofia', description: 'Calm & wise', noPreview: true },
  { id: 'shimmer', name: 'Stella', description: 'Light & airy', noPreview: true },
  { id: 'verse', name: 'Victor', description: 'Poetic & refined', noPreview: true },
];
