

## Fix Voice Mode: Silence Responses and Voice Switching

### Overview

Two changes:
1. **Smarter phantom guard** to stop responding to ambient noise without breaking real speech detection
2. **Replace voice hot-swap with "new chat" approach** -- selecting a new voice saves the current conversation, ends the session, and starts a fresh one with the new voice (with a confirmation step)

---

### Part 1: Fix Silence/Noise Responses

**Root cause:** The phantom guard at `response.created` uses `userSpokeAfterLastResponse || hasRealTranscription` to decide whether to allow a response. Since VAD fires on ambient noise and sets `userSpokeAfterLastResponse = true`, the guard always lets noise-triggered responses through.

**Fix:** Add a **delayed verification** instead of an immediate allow/cancel decision:
- At `response.created`, if VAD flagged speech but no transcription has arrived yet, start a 2-second timer
- If `hasRealTranscription` becomes true within that window (Whisper confirmed real words), do nothing -- response proceeds
- If the timer fires and `hasRealTranscription` is still false, cancel the response
- Responses from tools or voice intro bypass this check entirely (unchanged)

This gives Whisper enough time to process real speech while still catching noise.

### Part 2: Voice Switching as "New Chat"

**Current approach (broken):** Disconnect WebSocket, reconnect with new voice, inject "my new voice is ready" system message, wait for audio playback. Multiple failure points cause the intro to never play or the voice to not actually change.

**New approach:** Treat voice changes as starting a new conversation:
1. User taps a voice in the picker
2. A confirmation step appears: "Switch to [Voice Name]? This will start a new conversation." with Cancel/Switch buttons
3. On confirm:
   - Save current conversation turns to chat history (reuses existing `saveNewTurns`)
   - Deactivate voice mode (triggers full cleanup)
   - Set the new voice in the store and persist to profile
   - After a brief delay, re-activate voice mode (starts fresh session with new voice)
4. Toast notification confirms: "Switched to [Voice Name]"

This eliminates the entire hot-swap lifecycle (disconnect-reconnect-intro-audio-drain-unlock), the `isVoiceSwapping` lock, and the safety timer. Much simpler and more reliable.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useOpenAIRealtime.tsx` | Add delayed phantom cancel timer; remove voice swap locking logic (no longer needed) |
| `src/components/VoiceModeOverlay.tsx` | Replace voice picker direct-select with confirmation UI; handle deactivate-switch-reactivate flow |
| `src/components/VoiceModeController.tsx` | Remove `updateVoice` effect and hot-swap wiring; simplify voice change to just work on next activation |

---

### Technical Details

**Delayed phantom guard** (`useOpenAIRealtime.tsx`):
- Add module-level `let phantomCheckTimer: ReturnType<typeof setTimeout> | null = null;`
- In `response.created` handler:
  - If `waitingForVoiceIntro` or `awaitingToolResponse` -- allow immediately (unchanged)
  - If `hasRealTranscription` -- allow immediately
  - If `!userSpokeAfterLastResponse && !hasRealTranscription` -- cancel immediately (no speech at all)
  - If `userSpokeAfterLastResponse && !hasRealTranscription` -- start 2s timer; on expiry if still no transcription, cancel response
- In `conversation.item.input_audio_transcription.completed`: when `hasRealTranscription` is set to true, clear the phantom timer (speech confirmed)
- In `response.done`: clear the phantom timer

**Voice picker confirmation** (`VoiceModeOverlay.tsx`):
- Add `pendingVoiceSwitch` state to hold the voice the user tapped
- When a voice is tapped, set `pendingVoiceSwitch` instead of immediately switching
- Show inline confirmation UI (two buttons: Cancel / Switch) replacing the voice list momentarily
- On "Switch": call a handler that saves turns, deactivates, sets new voice, waits 500ms, re-activates
- On "Cancel": clear `pendingVoiceSwitch`, return to voice list

**Simplify controller** (`VoiceModeController.tsx`):
- Remove the `useEffect` that watches `selectedVoice` changes and calls `updateVoice`
- Remove `isFirstVoiceChangeRef` and `previousVoiceRef` tracking
- The voice is simply read from the store at connection time (already works this way in `connect()`)
- Remove `updateVoice` from the destructured hook return (or keep it but never call it)

**Cleanup in `useOpenAIRealtime.tsx`:**
- Remove `voiceSwapInProgress`, `voiceSwapTimer`, `pendingVoiceSwap`, `isVoiceSwapReconnect`, `waitingForVoiceIntro`, `voiceSwapSafetyTimer` module-level variables
- Remove `updateVoice` callback entirely (or simplify to a no-op)
- Remove voice swap handling from `ws.onopen` (the `isVoiceSwapReconnect` block)
- Remove voice swap check from `ws.onclose`
- Remove `isVoiceSwapping` suppression from `sendAudio`
- Remove `waitingForVoiceIntro` checks from phantom guard and `response.done`
- This removes ~80 lines of complex state management

