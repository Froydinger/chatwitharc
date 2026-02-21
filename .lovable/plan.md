

## Fix: "Loading messages..." Stuck on App Load

### Problem
When you open the app, instead of seeing the new chat welcome screen, you see a "Loading messages..." spinner indefinitely. You have to manually click "New chat" to get past it.

### Root Cause
The app persists the last active chat session ID in local storage. On reload:
1. The stored session ID is restored before any data is fetched
2. The app auto-navigates from `/` to `/chat/{lastSessionId}` 
3. It tries to fetch ("hydrate") that session's messages from the cloud
4. While fetching, it shows "Loading messages..." with an empty message list
5. If the fetch is slow or fails, you're stuck on that spinner

### Fix (2 changes)

**1. Don't auto-resume the last session on fresh load**
- In `MobileChatApp.tsx`, remove the effect that auto-navigates from `/` to `/chat/{currentSessionId}` when the user lands on the home page
- Instead, clear `currentSessionId` when the user is on `/` with no explicit session in the URL -- this shows the welcome screen immediately
- Sessions are still loaded when you click on them in chat history

**2. Add a hydration timeout fallback**
- In `MobileChatApp.tsx`, if hydration takes longer than 5 seconds, stop showing "Loading messages..." and fall back to the welcome screen
- This prevents the user from ever getting permanently stuck

### Files to Change

| File | What |
|------|------|
| `src/pages/Index.tsx` | Clear `currentSessionId` when landing on `/` with no session param, so the welcome screen shows |
| `src/components/MobileChatApp.tsx` | Remove the auto-navigate effect (line ~377-385) that pushes to `/chat/:id` on load; add hydration timeout fallback |

### How It Works After the Fix
- Opening the app at `/` always shows the welcome screen with quick prompts
- Clicking a chat in history navigates to `/chat/{id}` and loads it normally
- If you bookmark or reload `/chat/{id}`, that specific session loads (with a 5s timeout safety net)
- No more getting stuck on "Loading messages..."

