

## Fix: "Loading messages..." Still Showing on Fresh Login

### Root Cause

The previous fix in `Index.tsx` clears `currentSessionId` when landing on `/`, but it runs **too late**. Here's the race condition:

1. User logs in -- `currentSessionId` is restored from localStorage (it's persisted via zustand `partialize`)
2. `syncFromSupabase()` runs and sees a `currentSessionId` in state
3. It calls `hydrateSession(currentSessionId)` which sets `isHydratingSession` -- this triggers the "Loading messages..." spinner
4. Sync finishes, `isLoaded` becomes true
5. **Now** Index.tsx runs and clears `currentSessionId` -- but the hydration spinner is already showing

### Fix

**Stop persisting `currentSessionId` to localStorage.** Since the design intent is to always show the welcome screen on fresh load (not auto-resume), there's no reason to persist it. Sessions are resumed explicitly via URL navigation or clicking in chat history.

### Changes

| File | Change |
|------|--------|
| `src/store/useArcStore.ts` | Remove `currentSessionId` from the `partialize` config (line 1160). This means on fresh load, `currentSessionId` is always `null`, the welcome screen shows immediately, and `syncFromSupabase` won't trigger hydration. |
| `src/pages/Index.tsx` | Remove the `else if (currentSessionId)` cleanup block (lines 37-39) since it's no longer needed -- `currentSessionId` won't be stale on load anymore. |

This is a one-line fix at the store level that eliminates the race condition entirely.

