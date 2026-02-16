

## Fix: Waveform Flatlines While AI Audio Is Still Playing

### Root Cause

The problem is a **timing mismatch between status and audio playback**:

1. OpenAI sends audio chunks and transcript deltas as the response is generated
2. `status` is set to `'speaking'` when transcript deltas arrive (`response.audio_transcript.delta`)
3. When OpenAI finishes generating, it sends `response.done` -- this immediately sets `status = 'listening'`
4. **But the audio queue still has buffered chunks playing back** -- `isAudioPlaying` remains `true` for several more seconds
5. The waveform uses `status === 'speaking'` to decide which animation to show
6. Since status is now `'listening'`, it falls to the listening branch which uses `inputAmplitude` (user's mic = 0) -- bars flatline

In short: OpenAI finishes *generating* before the audio finishes *playing*. The status jumps to `listening` while the user is still hearing the AI talk.

### Fix

**Don't transition to `listening` on `response.done` if audio is still playing.** Instead:

1. In `useOpenAIRealtime.tsx` at the `response.done` handler: check `isAudioPlaying` before setting status. If audio is still playing, skip the status change.
2. In `useAudioPlayback.tsx`: when the audio queue fully drains (last chunk finishes playing), transition status to `listening` at that point.

This ensures the `speaking` status (and its energetic waveform animation) persists for the entire duration the user hears audio.

### Changes

**`src/hooks/useOpenAIRealtime.tsx`** (response.done handler, ~line 375-387):
- Before setting `status = 'listening'`, check if `isAudioPlaying` is still true
- If audio is still playing, leave status as `speaking` -- the audio playback hook will handle the transition

**`src/hooks/useAudioPlayback.tsx`** (source.onended callback, ~line 133-136):
- When the queue is empty and the last chunk finishes, set `status = 'listening'` (only if current status is `speaking` and voice mode is still active)
- This ensures the transition happens exactly when audio stops

### Files to Modify
1. `src/hooks/useOpenAIRealtime.tsx` -- Guard the `response.done` status transition against ongoing audio playback
2. `src/hooks/useAudioPlayback.tsx` -- Trigger `listening` status when audio queue fully drains

