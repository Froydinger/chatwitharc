

## Fix Voice Switching Crashing Voice Mode + UI Polish

### Root Cause

Two likely causes for voice mode closing when switching voices:

1. **WebSocket `session.update` error**: When `updateVoice()` sends a `session.update` message, the server may respond with an `error` event. The error handler in `useOpenAIRealtime.tsx` calls `onError()`, which triggers `deactivateVoiceMode()` in VoiceModeController -- killing the entire session.

2. **Popover Portal click bleed**: The Popover uses a Portal (renders outside the overlay DOM tree). When the popover closes via `setVoicePickerOpen(false)`, focus/click events may propagate to the backdrop div, where the `e.target === e.currentTarget` check triggers `deactivateVoiceMode()`.

### Fixes

**1. Make `updateVoice` error-resilient (`src/hooks/useOpenAIRealtime.tsx`)**
- Add `session.update` error codes to the "transient/recoverable" error list so voice mode does not crash on voice switch errors
- This prevents the `onError` -> `deactivateVoiceMode` chain

**2. Prevent popover click bleed (`src/components/VoiceModeOverlay.tsx`)**
- Add `e.stopPropagation()` on the Popover trigger button and inside PopoverContent to prevent click events from bubbling up to the backdrop's `onClick` handler

**3. Keep picker open + add confirmation (`src/components/VoiceModeOverlay.tsx`)**
- Remove `setVoicePickerOpen(false)` from the voice selection handler so the picker stays open
- After selecting a voice, add a conversation turn: `{ role: 'assistant', transcript: 'Okay, my new voice is ready!', timestamp: new Date() }` so the bot speaks in the new voice as confirmation

**4. Fix UI styling (`src/components/VoiceModeOverlay.tsx`)**
- Change avatar circle backgrounds from default (white) to `bg-black` 
- Increase popover width to `w-[320px]` and max-height to `max-h-[300px]`
- Clean up border styling so nothing looks clipped or "nightlight cut off"
- Improve glass-panel styling with proper padding and rounded corners

### Technical Details

**Error resilience change in `useOpenAIRealtime.tsx`:**
```typescript
// Add session_update errors to transient errors
const isTransientError = 
  event.error?.message?.includes('Connection to AI service failed') ||
  event.error?.message?.includes('timeout') ||
  event.error?.message?.includes('rate limit') ||
  event.error?.code === 'function_call_error' ||
  event.error?.code === 'session_update_error' ||
  event.error?.message?.includes('session.update');
```

**Click bleed prevention:**
```typescript
<PopoverContent onClick={(e) => e.stopPropagation()} ...>
```

**Voice selection handler:**
```typescript
onClick={async () => {
  setSelectedVoice(voice.id);
  // Don't close picker
  addConversationTurn({
    role: 'assistant',
    transcript: 'Okay, my new voice is ready!',
    timestamp: new Date()
  });
  try {
    await updateProfile({ preferred_voice: voice.id });
  } catch (err) {
    console.error('Failed to persist voice:', err);
  }
}}
```

**Avatar styling:**
```typescript
<div className="w-10 h-10 rounded-full overflow-hidden bg-black border-2 ...">
```

### Files to Modify
- `src/hooks/useOpenAIRealtime.tsx` -- Make session.update errors non-fatal
- `src/components/VoiceModeOverlay.tsx` -- Stop click propagation, keep picker open, add confirmation message, fix avatar/popover styling
