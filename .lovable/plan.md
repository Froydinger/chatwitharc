

## Fix: Voice Mode Search Results + Elevator Music During Tasks

### Issue 1: Search results not being relayed to user

**Root cause**: The phantom response guard (`response.created` handler) is too aggressive. When a tool like `web_search` or `generate_image` completes, `sendFunctionResult` sends `response.create` to make the AI speak about the results. But `response.created` fires and sees `userSpokeAfterLastResponse === false` (it was reset when the AI's *first* response finished), so it **cancels the response that would have told the user the search results**.

The user then has to ask a follow-up, which sets `userSpokeAfterLastResponse = true`, and *that* response finally relays the info.

**Fix**: Track when we explicitly request a response via `sendFunctionResult` so the phantom guard allows it through.

- Add a flag `awaitingToolResponse` (module-level, like `userSpokeAfterLastResponse`)
- Set it to `true` in `sendFunctionResult` right before sending `response.create`
- In the `response.created` handler, allow the response if `awaitingToolResponse` is true (reset it after)
- This way, tool-triggered responses always go through, but ambient-noise phantom responses are still blocked

### Issue 2: Play elevator music during search and image generation in voice mode

**What**: When `isSearching` or `isGeneratingImage` becomes true in the voice mode overlay, auto-play the elevator music track. Stop it when those states go back to false.

**Implementation in `src/components/VoiceModeOverlay.tsx`**:
- Import `useMusicStore` and `musicTracks`
- Add a `useEffect` watching `isSearching` and `isGeneratingImage`
- When either becomes true: save the current music state, switch to the elevator track, start playing
- When both become false: stop playing, restore previous track if needed
- Use a ref to track whether we started the music (so we only stop what we started)

### Technical Details

**`src/hooks/useOpenAIRealtime.tsx`**:

```text
// New module-level flag
let awaitingToolResponse = false;

// In sendFunctionResult, before response.create:
awaitingToolResponse = true;

// In response.created handler:
if (awaitingToolResponse) {
  awaitingToolResponse = false;
  // Allow this response through - it's from a tool result
  break;
}
if (!userSpokeAfterLastResponse) {
  // Cancel phantom response
  ...
}
```

**`src/components/VoiceModeOverlay.tsx`**:

```text
// Add useEffect for elevator music
useEffect(() => {
  if (!isSearching && !isGeneratingImage) {
    // Stop elevator music if we started it
    return;
  }
  // Start elevator music
  const musicStore = useMusicStore.getState();
  // Save previous state, switch to elevator, play
}, [isSearching, isGeneratingImage]);
```

### Files to modify
1. `src/hooks/useOpenAIRealtime.tsx` -- add `awaitingToolResponse` flag and update `sendFunctionResult` + `response.created` handler
2. `src/components/VoiceModeOverlay.tsx` -- add elevator music auto-play effect during search/image generation

