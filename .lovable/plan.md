

## Restore All 13 Voices + Hot Swap in Voice Mode UI + Cross-Device Sync

### Overview

1. Restore all 13 OpenAI voices with unique names, avatars, and descriptions
2. Add a voice picker toggle directly on the voice mode overlay for hot-swapping mid-conversation
3. Sync the selected voice to the user's profile so it persists across devices/browsers

### Voice Roster (alphabetical by display name)

| Voice ID | Display Name | Description |
|----------|-------------|-------------|
| alloy | Alex | Neutral and balanced |
| ash | Ashton | Warm and confident |
| ballad | Belle | Melodic and soothing |
| cedar | Cedric | Natural and smooth |
| coral | Cora | Friendly and bright |
| echo | Ethan | Clear and resonant |
| fable | Fiona | Storytelling warmth |
| marin | Marina | Expressive and natural |
| nova | Nadia | Energetic and vivid |
| onyx | Oliver | Deep and authoritative |
| sage | Sofia | Calm and wise |
| shimmer | Stella | Light and airy |
| verse | Victor | Poetic and refined |

Marina and Cedric keep the "Best" badge.

### Hot Swap UI in Voice Mode

A small circular avatar button in the bottom-left of the voice mode overlay showing the current voice's avatar. Tapping it opens a compact popover/drawer with all 13 voices as small avatar circles with names. Selecting one instantly swaps the voice mid-conversation (the existing `updateVoice` mechanism in VoiceModeController already handles this -- it watches `selectedVoice` changes and calls `updateVoice()` on the WebSocket).

### Cross-Device Sync

- On voice selection (both in settings and the hot-swap picker), persist to the profile via `updateProfile({ preferred_voice: voiceId })`
- On app load in VoiceModeController, read `profile.preferred_voice` and set it in the Zustand store if it differs from the current value

### Technical Changes

**1. `src/store/useVoiceModeStore.ts`**
- Expand `VoiceName` type from 4 to all 13 voice IDs

**2. `src/components/VoiceSelector.tsx`** (settings panel voice picker)
- Import all 13 avatar images
- Update `VOICES` array with all 13 entries sorted alphabetically by display name
- Update `VOICE_AVATARS` record
- Import `useProfile` and call `updateProfile({ preferred_voice: voice.id })` on selection to persist to cloud

**3. `src/components/VoiceModeOverlay.tsx`**
- Add a new voice picker button (bottom-left area, opposite side from mute) showing the current voice avatar
- On tap, show a small popover/sheet with a horizontal scrollable row or compact grid of voice avatars
- Selecting a voice calls `setSelectedVoice()` from the store (VoiceModeController already watches this and hot-swaps)
- Also persist to profile via `useProfile().updateProfile`
- Import voice avatars and the VOICES constant (share from a new `src/constants/voices.ts` file)

**4. `src/constants/voices.ts`** (new shared file)
- Export `VOICES` array and `VOICE_AVATARS` record so both VoiceSelector and VoiceModeOverlay can use them without duplication

**5. `src/components/VoiceModeController.tsx`**
- Add a `useEffect` that reads `profile?.preferred_voice` on mount/change and syncs it to the Zustand store if different, ensuring the saved voice loads on any device

### Files to Create
- `src/constants/voices.ts`

### Files to Modify
- `src/store/useVoiceModeStore.ts`
- `src/components/VoiceSelector.tsx`
- `src/components/VoiceModeOverlay.tsx`
- `src/components/VoiceModeController.tsx`

