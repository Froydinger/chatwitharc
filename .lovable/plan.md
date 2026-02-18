

## Voice Mode Stability Fix

### Problem Diagnosis

After tracing the code, I found **three bugs** working together to cause the "cutting in and out" behavior:

---

### Bug 1: Phantom Response Guard Kills Voice Swap Intros

In `useOpenAIRealtime.tsx` (lines 371-384), when a `response.created` event fires, the code checks if the user has actually spoken (`userSpokeAfterLastResponse`). If not, it cancels the response as a "phantom" triggered by ambient noise.

**The problem:** After a voice swap reconnect, the system sends a programmatic text message ("say my new voice is ready") and triggers `response.create`. But since no actual speech was detected by VAD, `userSpokeAfterLastResponse` is `false`, so the phantom guard **immediately cancels the intro response**. This causes audio to cut off mid-word or never play at all.

**Fix:** Add `waitingForVoiceIntro` to the allow-list in the phantom guard, just like `awaitingToolResponse` is already handled.

---

### Bug 2: Unnecessary Disconnect-Reconnect on Every Activation

In `VoiceModeController.tsx` (lines 655-665), a `useEffect` watches `selectedVoice` changes while connected. Here's the sequence:

1. Voice mode activates with default voice `cedar`
2. WebSocket connects successfully
3. Profile sync effect (lines 282-289) fires, changing `selectedVoice` to user's saved preference (e.g., `ash`)
4. The voice change effect detects the difference and calls `updateVoice(selectedVoice)` -- **with announce defaulting to `true`**
5. This triggers a full disconnect, reconnect, and "my new voice is ready" announcement

So every time voice mode starts, you get an unnecessary reconnect cycle. Combined with Bug 1 (phantom guard cancelling the intro), this creates a ~2 second gap where the connection drops and the intro gets killed.

**Fix:** Track whether it's the first voice change after connecting. First change = profile sync = use `announce: false` (silent reconnect). Subsequent changes = user action = use `announce: true`.

---

### Bug 3: Audio Chunk Playback Gaps

In `useAudioPlayback.tsx`, audio chunks are played one at a time using `AudioBufferSourceNode` with an `onended` callback to start the next chunk. This sequential approach introduces tiny gaps between chunks because:
- There's processing time between one chunk ending and the next starting
- JavaScript event loop delays can add milliseconds of silence
- On mobile (especially iOS), these gaps are more noticeable

**Fix:** Use scheduled playback with `audioContext.currentTime`. Instead of waiting for `onended`, pre-schedule the next chunk to start at exactly the time the current one ends. This eliminates gaps entirely.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useOpenAIRealtime.tsx` | Allow `waitingForVoiceIntro` responses through the phantom guard (lines 371-384) |
| `src/components/VoiceModeController.tsx` | Track first voice change after connect; pass `announce=false` for profile-sync changes (lines 655-665) |
| `src/hooks/useAudioPlayback.tsx` | Switch from sequential `onended` callbacks to scheduled `audioContext.currentTime` playback to eliminate gaps |

---

### Technical Details

**Phantom guard fix** (`useOpenAIRealtime.tsx`, `response.created` handler):

```text
Before checking userSpokeAfterLastResponse, also check:
- if waitingForVoiceIntro is true --> allow through (same as awaitingToolResponse)
```

**Profile sync fix** (`VoiceModeController.tsx`):

```text
Add: const isFirstVoiceChangeRef = useRef(true);

In voice change useEffect:
  if (isFirstVoiceChangeRef.current) {
    isFirstVoiceChangeRef.current = false;
    updateVoice(selectedVoice, false);  // silent -- just profile sync
  } else {
    updateVoice(selectedVoice, true);   // user-initiated -- announce
  }

Reset isFirstVoiceChangeRef when voice mode deactivates.
```

**Audio scheduling fix** (`useAudioPlayback.tsx`):

```text
Track nextStartTime via ref (initialized to audioContext.currentTime).
When playing a chunk:
  - If nextStartTime < audioContext.currentTime, snap to currentTime
  - Schedule source.start(nextStartTime)
  - Set nextStartTime += chunk duration (buffer.length / sampleRate)
  - No onended chain needed for queue processing; drain queue in a loop

This pre-schedules chunks back-to-back with zero gap.
```

