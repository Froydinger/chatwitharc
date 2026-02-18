

## Voice Mode: Fix Silence Responses and Stuck Voice Picker

### Problem Diagnosis

There are **three distinct bugs** causing the current broken behavior:

---

### Bug 1: Phantom Guard is Ineffective Against VAD False Positives (Responding to Silence)

The phantom response guard at line 384 checks `userSpokeAfterLastResponse` to cancel AI responses triggered by ambient noise. But the guard is fundamentally bypassed because:

1. VAD fires `input_audio_buffer.speech_started` on ambient noise (even with 0.85 threshold)
2. This sets `userSpokeAfterLastResponse = true` (line 139)
3. When OpenAI then creates a response, the guard sees `userSpokeAfterLastResponse === true` and lets it through
4. The AI responds to nothing

The guard only blocks responses where NO `speech_started` event preceded them, which is an extremely narrow case. For real ambient noise, the VAD triggers first, defeating the guard.

**Fix:** Instead of relying on the VAD `speech_started` event, validate using actual transcription. Add a `hasRealTranscription` flag that only becomes `true` when a non-garbled, non-empty transcription arrives (line 148-169). Use this flag in the phantom guard instead of `userSpokeAfterLastResponse`. This means:
- VAD fires on noise -> `userSpokeAfterLastResponse = true` (still useful for other logic)
- But `hasRealTranscription` stays `false` until Whisper actually transcribes real words
- Phantom guard checks `hasRealTranscription` instead -> cancels the noise-triggered response

---

### Bug 2: Voice Picker Uses Non-Reactive State Read (Can't Change Voice)

In `VoiceModeOverlay.tsx` line 510, the voice picker reads `isVoiceSwapping` via `useVoiceModeStore.getState()` inside a `.map()` render callback. This is a **non-reactive snapshot** -- it reads the value once during render and never updates. If `isVoiceSwapping` gets stuck as `true` (see Bug 3 below), the buttons stay permanently disabled with `opacity-50 pointer-events-none`, and the component never re-renders to check the updated value.

**Fix:** Read `isVoiceSwapping` reactively from the store hook at the component level (using `useVoiceModeStore()`) instead of `getState()` inside the map loop.

---

### Bug 3: `isVoiceSwapping` Can Get Stuck Forever

`isVoiceSwapping` is set to `true` when a voice swap starts (line 760) and should be set back to `false` when the intro response finishes (lines 400-417). But if anything interrupts this flow -- network hiccup, WebSocket close during swap, or the response being cancelled -- the unlock code in `response.done` never runs, and `isVoiceSwapping` stays `true` forever, permanently locking the picker.

**Fix:** Add a safety timeout (e.g., 8 seconds) that automatically resets `isVoiceSwapping` to `false` if the swap hasn't completed. This ensures the picker is never permanently locked.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useOpenAIRealtime.tsx` | Replace `userSpokeAfterLastResponse` with `hasRealTranscription` in phantom guard; add safety timeout for voice swap unlock |
| `src/components/VoiceModeOverlay.tsx` | Read `isVoiceSwapping` reactively from store hook instead of `getState()` |

---

### Technical Details

**Transcription-based phantom guard** (`useOpenAIRealtime.tsx`):

```text
Add module-level flag:
  let hasRealTranscription = false;

In 'input_audio_buffer.speech_started' handler:
  Keep setting userSpokeAfterLastResponse = true (used for mute-handoff)

In 'conversation.item.input_audio_transcription.completed' handler:
  After garbled check passes and transcript is non-empty:
    hasRealTranscription = true;

In 'response.created' handler:
  Change guard check from:
    if (!userSpokeAfterLastResponse)  -->  if (!hasRealTranscription)

In 'response.done' handler:
  Reset both:
    userSpokeAfterLastResponse = false;
    hasRealTranscription = false;
```

**Reactive voice picker** (`VoiceModeOverlay.tsx`):

```text
Move isVoiceSwapping read outside the .map():
  const { isVoiceSwapping } = useVoiceModeStore();
  // or destructure from existing store usage at top of component

Remove the getState() call on line 510.
```

**Safety timeout for voice swap** (`useOpenAIRealtime.tsx`):

```text
Add module-level:
  let voiceSwapSafetyTimer: ReturnType<typeof setTimeout> | null = null;

When setting isVoiceSwapping(true):
  Start safety timer:
    voiceSwapSafetyTimer = setTimeout(() => {
      useVoiceModeStore.getState().setIsVoiceSwapping(false);
      waitingForVoiceIntro = false;
      voiceSwapInProgress = false;
    }, 8000);

When setting isVoiceSwapping(false) (in response.done and disconnect):
  Clear the safety timer:
    if (voiceSwapSafetyTimer) { clearTimeout(voiceSwapSafetyTimer); voiceSwapSafetyTimer = null; }
```

