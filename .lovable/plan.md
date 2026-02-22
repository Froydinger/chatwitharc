

## Fix: Remove debug console.log spamming "Canvas indicator"

A debug `console.log` was left in `src/components/ChatInput.tsx` at line 352 that logs canvas state on every render. Since `ChatInput` re-renders on every keystroke and state change, this spams the console constantly.

**Fix:** Remove the debug log line (line 351-352) from `src/components/ChatInput.tsx`. The comment even says "remove after confirming fix" -- so it's safe to delete.

### Technical Details

| File | Change |
|------|--------|
| `src/components/ChatInput.tsx` lines 351-352 | Delete the debug `console.log('Canvas indicator:', ...)` and its comment |

