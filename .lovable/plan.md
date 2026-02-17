

## Voice Picker UX Overhaul: Full Plan

### 1. Unified Duolingo-Style Avatars (13 PNG files)

Regenerate all 13 avatars in `src/assets/voices/` with a consistent style:
- **Full-circle face** -- the face fills the entire circle edge-to-edge, no head/hair outline visible beyond the circle
- **Duolingo-inspired**: flat bold colors, big expressive eyes, minimal features, friendly and fun
- Each character is distinct (skin tone, eye shape, accessories like glasses/freckles) but identical in scale and proportion
- Fixes the current problem of mismatched head sizes and clipping at edges (visible in screenshot)

**Files**: `src/assets/voices/alloy.png`, `ash.png`, `ballad.png`, `cedar.png`, `coral.png`, `echo.png`, `fable.png`, `marin.png`, `nova.png`, `onyx.png`, `sage.png`, `shimmer.png`, `verse.png`

---

### 2. Voice Mode Overlay Picker: Single-Column List Layout

Currently the picker in `VoiceModeOverlay.tsx` uses a `grid-cols-4` layout in a 320px popover, causing cramped tiles and clipped edges (see screenshot).

**Changes to `src/components/VoiceModeOverlay.tsx`** (lines 503-547):
- Change from `grid grid-cols-4` to a **single-column list** layout
- Each row: avatar (left) + name and description (right), like a contact list
- Wider popover width (360px) to give breathing room
- Selected voice gets a **glow effect** (box-shadow) on the avatar instead of ring/border
- Remove `bg-primary/20 ring-1 ring-primary/40` selection style, replace with `shadow-[0_0_12px_4px_rgba(var(--accent-rgb,139,92,246),0.4)]` on the avatar circle
- Show a small loading spinner on the swapping voice when `isVoiceSwapping` is true
- Disable all voice buttons (`opacity-50 pointer-events-none`) when `isVoiceSwapping` is true

---

### 3. Sidebar Voice Selector: Single-Column List

The settings panel `VoiceSelector.tsx` currently uses `grid-cols-2` which is also cramped.

**Changes to `src/components/VoiceSelector.tsx`** (lines 97-170):
- Switch from `grid grid-cols-2` to a **single-column list** with horizontal rows (avatar + name + description inline)
- Apply the same glow selection style for consistency
- Keep the preview button inline on the right side of each row

---

### 4. Voice Swap State Management

**Changes to `src/store/useVoiceModeStore.ts`**:
- Add `isVoiceSwapping: boolean` (default `false`) to state interface
- Add `setIsVoiceSwapping(swapping: boolean)` action
- Reset `isVoiceSwapping` to `false` in `deactivateVoiceMode`

---

### 5. Mic Muting and Swap Locking Logic

**Changes to `src/hooks/useOpenAIRealtime.tsx`**:
- When `updateVoice` starts: call `setIsVoiceSwapping(true)`
- Add a `waitingForVoiceIntro` module-level flag
- After voice swap reconnect, when the session sends the "say my new voice is ready" prompt, set `waitingForVoiceIntro = true`
- When `response.done` fires while `waitingForVoiceIntro` is true: call `setIsVoiceSwapping(false)`, reset `waitingForVoiceIntro = false`
- While `isVoiceSwapping` is true: suppress sending audio input data to the WebSocket (skip the `ws.send()` for audio frames), keeping the mic technically open but not transmitting -- this avoids the user interrupting the intro
- This is cleaner than toggling `isMuted` in the store which would flash a mute icon in the UI

---

### 6. Flow Summary

```text
User taps voice --> setSelectedVoice() --> updateVoice() fires
  |
  +--> setIsVoiceSwapping(true)
  +--> All picker buttons disabled + dimmed
  +--> Audio input suppressed (not sent to WS)
  |
  +--> WebSocket closes (onclose sees flags, skips error)
  +--> Reconnects with new voice
  +--> Session init --> sends "say my new voice is ready"
  +--> AI speaks intro (mic suppressed, user can't interrupt)
  |
  +--> response.done fires for intro
  +--> setIsVoiceSwapping(false)
  +--> Picker buttons re-enabled
  +--> Audio input resumes normally
```

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/assets/voices/*.png` (13 files) | Regenerate in unified Duolingo full-circle-face style |
| `src/store/useVoiceModeStore.ts` | Add `isVoiceSwapping` state + setter |
| `src/hooks/useOpenAIRealtime.tsx` | Set swap flag, suppress mic during swap, unlock on response.done |
| `src/components/VoiceModeOverlay.tsx` | Single-column list layout, glow selection, disable during swap |
| `src/components/VoiceSelector.tsx` | Single-column list layout, glow selection for consistency |

