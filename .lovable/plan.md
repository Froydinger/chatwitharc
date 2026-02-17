

## Fix Voice Mode Crashing -- Root Cause + Real Fix

### Root Cause (from logs)

The crash happens because:

1. The user's profile has `preferred_voice: 'fable'` saved in the database
2. On load, `VoiceModeController` syncs this into the store -- it validates against ALL 13 voices (including TTS-only ones like fable), so it accepts it
3. When voice mode connects, the `safeVoice` fallback works correctly at session init, BUT the OpenAI server still returns an `invalid_value` error for the initial session config
4. The error handler checks for `code === 'session_update_error'` but OpenAI actually sends `code: 'invalid_value'` -- so the check misses it
5. The error falls through to `onError()` which calls `deactivateVoiceMode()` -- session dies instantly

### Fix (3 changes, 2 files)

**File 1: `src/components/VoiceModeController.tsx`**

- Line 269: Change the profile sync validation list to use `REALTIME_SUPPORTED_VOICES` instead of all 13 voices
- This prevents `'fable'` from ever being set in the store, which is the real source of the bug
- Import `REALTIME_SUPPORTED_VOICES` from the store

**File 2: `src/hooks/useOpenAIRealtime.tsx`**

- Lines 398-404: Add `event.error?.code === 'invalid_value'` to the transient error check -- this is the actual error code OpenAI sends for bad voice values, so it won't crash voice mode even if a bad voice somehow slips through
- Lines 620-625: Add the same `REALTIME_SUPPORTED_VOICES` safe-guard to the `updateVoice` function so mid-session voice swaps also can't send unsupported voices

### Technical Details

**VoiceModeController.tsx -- profile sync fix:**
```typescript
import { useVoiceModeStore, REALTIME_SUPPORTED_VOICES } from '@/store/useVoiceModeStore';

// Line 269: filter to realtime voices only
if (REALTIME_SUPPORTED_VOICES.includes(profile.preferred_voice as any)) {
  setSelectedVoice(profile.preferred_voice as any);
}
```

**useOpenAIRealtime.tsx -- error handler fix:**
```typescript
const isTransientError = 
  event.error?.message?.includes('Connection to AI service failed') ||
  event.error?.message?.includes('timeout') ||
  event.error?.message?.includes('rate limit') ||
  event.error?.code === 'function_call_error' ||
  event.error?.code === 'session_update_error' ||
  event.error?.code === 'invalid_value' ||          // <-- NEW
  event.error?.message?.includes('session.update');
```

**useOpenAIRealtime.tsx -- updateVoice safe-guard:**
```typescript
const updateVoice = useCallback((voice: VoiceName) => {
  if (globalWs?.readyState !== WebSocket.OPEN) return;
  const safeVoice = REALTIME_SUPPORTED_VOICES.includes(voice) ? voice : 'cedar';
  globalWs.send(JSON.stringify({
    type: 'session.update',
    session: { voice: safeVoice }
  }));
}, []);
```

### Files to Modify
- `src/components/VoiceModeController.tsx` -- Import REALTIME_SUPPORTED_VOICES, filter profile sync
- `src/hooks/useOpenAIRealtime.tsx` -- Add `invalid_value` to transient errors, safe-guard updateVoice

