

## Fix: Voice Mode Repeating Responses During Silence

### Problem
After the AI finishes responding, OpenAI's server-side Voice Activity Detection (VAD) is falsely detecting ambient noise as speech and auto-triggering new responses -- even when the user is completely silent. The 1.5s cooldown only delays the issue; it doesn't prevent it.

### Root Cause
The session is configured with `turn_detection.create_response: true`, which means OpenAI's server automatically generates a new response whenever its VAD thinks it heard speech followed by silence. Low-level ambient noise (or even digital silence with minor artifacts) can trigger this, causing an infinite loop of responses.

### Solution: Track User Speech and Cancel Phantom Responses

The fix uses a simple flag to track whether the user has **actually spoken** since the last AI response. If OpenAI tries to start a new response without real user speech, we immediately cancel it.

### Changes

**File: `src/hooks/useOpenAIRealtime.tsx`**

1. **Add a module-level flag** `userSpokeAfterLastResponse` (default `false`)

2. **On `input_audio_buffer.speech_started`**: Set flag to `true` -- the user genuinely spoke

3. **On `response.done`**: Reset flag to `false` -- AI just finished, user hasn't spoken yet since

4. **On `response.created`** (new case): Check the flag. If the user has NOT spoken since the last response, immediately send `response.cancel` to kill the phantom response before it generates any audio. Log it for debugging.

5. **Remove the 1.5s cooldown setTimeout**: It's no longer needed and adds unnecessary latency. Transition to `listening` immediately after `response.done`.

6. **Raise VAD threshold slightly** from `0.75` to `0.8` as an additional safety measure against ambient noise triggering false positives.

### Technical Details

```text
Flow (normal):
  AI finishes speaking (response.done)
    -> userSpokeAfterLastResponse = false
    -> status = 'listening'
  User speaks
    -> speech_started fires
    -> userSpokeAfterLastResponse = true
  VAD commits turn, OpenAI creates response
    -> response.created fires
    -> flag is true, so we allow it

Flow (phantom, now fixed):
  AI finishes speaking (response.done)
    -> userSpokeAfterLastResponse = false
    -> status = 'listening'
  Ambient noise triggers VAD
    -> speech_started does NOT fire (it's noise, not speech)
    -> OR speech_started fires but we can still guard
  OpenAI creates response
    -> response.created fires
    -> flag is false, so we send response.cancel
    -> Phantom response killed immediately
```

This is a clean, server-protocol-level fix that doesn't rely on timing hacks. It directly prevents the AI from responding unless the user has genuinely spoken.

