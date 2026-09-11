import type { VoiceName } from '@/store/useVoiceModeStore';
import { REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';

import alloyAvatar from '@/assets/voices/alloy.png';
import ashAvatar from '@/assets/voices/ash.png';
import balladAvatar from '@/assets/voices/ballad.png';
import cedarAvatar from '@/assets/voices/cedar-line.svg';
import coralAvatar from '@/assets/voices/coral.png';
import echoAvatar from '@/assets/voices/echo.png';
import fableAvatar from '@/assets/voices/fable.png';
import marinAvatar from '@/assets/voices/marin-line.svg';
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
  quartz: marinAvatar,
  ripple: cedarAvatar,
  vesper: onyxAvatar,
  willow: coralAvatar,
  stone: echoAvatar,
  gleam: shimmerAvatar,
  meridian: ashAvatar,
  bossa: balladAvatar,
  tempo: verseAvatar,
  beacon: alloyAvatar,
  delta: novaAvatar,
  cinder: fableAvatar,
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
  { id: 'beacon', name: 'Beacon', description: 'Filipino English, masculine', noPreview: true },
  { id: 'bossa', name: 'Bossa', description: 'Brazilian Portuguese, feminine', noPreview: true },
  { id: 'cedar', name: 'Cedric', description: 'Natural & smooth', noPreview: true },
  { id: 'cinder', name: 'Cinder', description: 'Southern U.S. English, masculine', noPreview: true },
  { id: 'coral', name: 'Cora', description: 'Friendly & bright', noPreview: true },
  { id: 'delta', name: 'Delta', description: 'Southern U.S. English, feminine', noPreview: true },
  { id: 'echo', name: 'Ethan', description: 'Clear & resonant', noPreview: true },
  { id: 'fable', name: 'Fiona', description: 'Storytelling warmth', noPreview: true },
  { id: 'gleam', name: 'Gleam', description: 'North American English, feminine', noPreview: true },
  { id: 'marin', name: 'Marina', description: 'Expressive & natural', recommended: true, noPreview: true },
  { id: 'meridian', name: 'Meridian', description: 'North American English, masculine', noPreview: true },
  { id: 'nova', name: 'Nadia', description: 'Energetic & vivid', noPreview: true },
  { id: 'onyx', name: 'Oliver', description: 'Deep & authoritative', noPreview: true },
  { id: 'quartz', name: 'Quartz', description: 'Australian English, feminine', noPreview: true },
  { id: 'ripple', name: 'Ripple', description: 'Australian English, masculine', noPreview: true },
  { id: 'sage', name: 'Sofia', description: 'Calm & wise', noPreview: true },
  { id: 'shimmer', name: 'Stella', description: 'Light & airy', noPreview: true },
  { id: 'stone', name: 'Stone', description: 'Irish English, masculine', noPreview: true },
  { id: 'tempo', name: 'Tempo', description: 'Brazilian Portuguese, masculine', noPreview: true },
  { id: 'verse', name: 'Victor', description: 'Poetic & refined', noPreview: true },
  { id: 'vesper', name: 'Vesper', description: 'British English, masculine', noPreview: true },
  { id: 'willow', name: 'Willow', description: 'Irish English, feminine', noPreview: true },
];

// Full list for internal use (fallbacks, etc.)
export const ALL_VOICES: VoiceOption[] = VOICES;

// Only voices supported by OpenAI Realtime API (for voice mode picker)
export const REALTIME_VOICES = VOICES.filter(v => REALTIME_SUPPORTED_VOICES.includes(v.id));
