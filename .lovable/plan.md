

## Two Fixes

### 1. Research Mode: Add searching spinner in input bar

Currently, when `isSearching` is true, the send button hides and the input is disabled, but there's no visual feedback in the input bar itself. We'll replace the static search icon with an animated spinner when searching.

**File:** `src/components/SearchCanvas.tsx`
- Import `Loader2` from lucide-react (add to existing import)
- At line 706-708, swap the `Search` icon for a spinning `Loader2` when `isSearching` is true:
  ```
  {isSearching ? (
    <Loader2 className="h-5 w-5 animate-spin" />
  ) : (
    <Search className="h-5 w-5" />
  )}
  ```

---

### 2. "Loading messages..." spinner still appearing

**Root cause:** The previous fix at `Index.tsx` line 37-39 clears `currentSessionId` whenever `!sessionId && currentSessionId`. But this runs reactively -- when the user clicks a chat from history while on `/`, `loadSession()` sets `currentSessionId`, which re-triggers this effect and immediately clears it again (since the URL hasn't updated to `/chat/:id` yet). This creates a race condition that can leave the UI stuck.

**Fix:** Only clear the stale session on initial mount, not reactively. Use a `useRef` flag to ensure the clearing only runs once per mount when the user first lands on `/`.

**File:** `src/pages/Index.tsx`
- Add a `hasHandledInitialClear` ref
- In the `else if` branch (line 37-39), only clear if the ref hasn't been set yet, then set it
- This prevents re-clearing when the user clicks a session from history

### Technical Details

| File | Change |
|------|--------|
| `src/components/SearchCanvas.tsx` line 3-25 | Add `Loader2` to lucide-react imports |
| `src/components/SearchCanvas.tsx` line 706-708 | Swap Search icon for Loader2 spinner when `isSearching` |
| `src/pages/Index.tsx` lines 1, 37-39 | Add `useRef` import, add `hasHandledInitialClear` ref, gate the clearing logic to only run once |

