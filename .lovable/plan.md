

## Two Fixes

### 1. Research Mode: Add left spacing to search icon
The search input bar's icon is too close to the left edge. The `glass-dock` container has `px-4` but the icon itself has no left margin. Adding `ml-2` to the icon wrapper will give it breathing room.

**File:** `src/components/SearchCanvas.tsx` (line 706)
- Add `ml-2` to the search icon wrapper `<div>` so the icon has proper spacing from the left edge of the input bar.

---

### 2. "Loading messages..." spinner on root path without new chat

**Root cause:** When you navigate to `/` (no `sessionId` in URL), `currentSessionId` is still set from the previous chat session. The earlier fix removed the code that cleared it. Since the session may not be hydrated, `messages` is empty and `isHydratingSession` matches `currentSessionId`, showing the spinner.

**Fix:** In `Index.tsx`, re-add logic to clear `currentSessionId` when the user is on `/` with no `sessionId` param. This ensures the welcome screen shows immediately.

**File:** `src/pages/Index.tsx` (inside the existing useEffect at lines 23-39)
- When `!sessionId` (user is on `/`), set `currentSessionId` to `null` and `messages` to `[]` via `useArcStore.setState(...)`. This stops hydration from triggering and shows the welcome screen immediately.

### Technical Details

| File | Change |
|------|--------|
| `src/components/SearchCanvas.tsx` ~line 706 | Add `ml-2` class to the search icon wrapper div |
| `src/pages/Index.tsx` ~line 37 | Add an `else` branch: when no `sessionId` and `currentSessionId` is set, clear it with `useArcStore.setState({ currentSessionId: null, messages: [] })` |

