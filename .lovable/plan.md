

## Fix Voice Hot-Swap Crash (For Real This Time)

### Root Cause

The `updateVoice` function deliberately sets `reconnectAttempts = MAX_RECONNECT_ATTEMPTS` to prevent the normal auto-reconnect from interfering. But the `onclose` handler treats that exact condition as a fatal error and calls `onError('Voice connection lost')`, which triggers `deactivateVoiceMode()` in VoiceModeController -- closing the UI.

The reconnect setTimeout fires 300ms later, but by then `isActive` is already `false` because `deactivateVoiceMode()` was called, so it never reconnects.

### Fix (1 file, 2 changes)

**File: `src/hooks/useOpenAIRealtime.tsx`**

**Change 1 -- onclose handler (lines 598-627):** Add a check for `voiceSwapInProgress || isVoiceSwapReconnect` at the top of the onclose handler. If a voice swap is in progress, skip ALL reconnect/error logic and just clean up the connection state silently. The voice swap's own setTimeout will handle the reconnect.

```typescript
ws.onclose = () => {
  console.log('Disconnected from OpenAI Realtime');
  globalConnecting = false;
  globalWs = null;
  globalSessionId = null;
  toolCallsInFlight.clear();
  setIsConnected(false);
  
  // If this close was triggered by a voice swap, do nothing --
  // the voice swap setTimeout will handle reconnecting
  if (voiceSwapInProgress || isVoiceSwapReconnect) {
    console.log('WebSocket closed for voice swap, reconnect handled externally');
    return;
  }
  
  // Normal auto-reconnect logic (unchanged)
  const { isActive } = useVoiceModeStore.getState();
  if (isActive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    // ... existing reconnect logic
  } else if (isActive && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // ... existing error logic
  } else {
    setStatus('idle');
  }
};
```

**Change 2 -- updateVoice (lines 696-742):** Remove the `reconnectAttempts = MAX_RECONNECT_ATTEMPTS` line since we no longer need it -- the onclose handler now checks the voice swap flags directly instead of relying on reconnect count hacking.

### Why This Works

- The onclose handler sees the voice swap flags and returns early -- no error, no deactivation
- The voice swap's own 300ms setTimeout fires, resets reconnectAttempts to 0, and calls `connect()` with `isVoiceSwapReconnect = true`
- The new session opens, sends the "Okay, my new voice is ready!" message
- UI stays open the entire time (isActive never becomes false)

### Files to Modify
- `src/hooks/useOpenAIRealtime.tsx` -- Fix onclose to respect voice swap state, remove reconnect count hack from updateVoice

