

## Problem

Three issues to fix:

1. **Landing page Voice Demo** — the card grows/shrinks as transcript messages animate in. The outer card has no fixed height, so adding messages pushes the mic button down and shifts page layout.

2. **Landing page Research Demo** — uses `minHeight: 340` which allows the card to grow past 340px during the results phase (summary + sources + follow-up input), causing layout shifts.

3. **Star menu (Sparkles button popover) and Slash picker (`/` menu)** — both render as horizontal pill bars with `flex items-center` and no wrapping. On mobile (390px viewport), items overflow and get clipped off-screen.

## Plan

### 1. Voice Demo fixed card height (`LandingVoiceDemo.tsx`)

- Set the outer card container (line 148) to a fixed height: `h-[400px] flex flex-col`
- Waveform area and status: keep as-is (fixed content)
- Transcript area (line 177): change to `flex-1 overflow-hidden` so it fills remaining space without growing the card
- Mic button area: keep at bottom with `mt-auto`

### 2. Research Demo fixed card height (`LandingScreen.tsx`)

- Change the outer div (line 135) from `minHeight: 340` to a fixed `h-[340px] flex flex-col`
- Header bar and search input: keep as-is
- The `AnimatePresence` content area (lines 164-223): wrap in a `div` with `flex-1 overflow-hidden` so phase transitions are contained within the remaining space

### 3. Star menu wrapping on mobile (`ChatInput.tsx`)

- The star menu (line 1656): change from `flex items-center` to `flex flex-wrap items-center` and add `max-w-[calc(100vw-32px)]` so items wrap to a second row on narrow screens instead of clipping

### 4. Slash picker wrapping on mobile (`ChatInput.tsx`)

- The slash picker (line 1534): similarly change to `flex flex-wrap items-center` with `max-w-[calc(100vw-32px)]` so the 5 items + close button wrap gracefully on mobile

