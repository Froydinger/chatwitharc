
# Unlimited Dynamic Past Chat Search

## Confirmation: This is Dynamic

The search system is **tool-based** - the AI decides when to call `search_past_chats`:
- Regular messages: ~2-3k tokens (just current conversation)
- History search: Only when AI determines it's needed

**No change to when searches happen - only how deep they go.**

## Changes

### File 1: `src/components/VoiceModeController.tsx`

**Remove session limit (line 80)**
```typescript
// REMOVE: if (relevantSessions.length >= 20) break;
// Now processes ALL relevant sessions
```

**Remove message slice limit (line 62)**
```typescript
// CHANGE FROM: .slice(-15)
// CHANGE TO: no slice - include all messages
```

**Remove content truncation (lines 66-67)**
```typescript
// CHANGE FROM: content.substring(0, 300) + '...'
// CHANGE TO: full content, no truncation
```

**Add smart budget (prevent context overflow)**
```typescript
// Add ~500k character budget
// Stop adding sessions when budget reached
// Prioritizes most relevant/recent content
```

### File 2: `supabase/functions/chat/index.ts`

**Increase session limit (line 179)**
```typescript
// CHANGE FROM: limit(1000)
// CHANGE TO: limit(10000)
```

**Remove content truncation for searches**
```typescript
// When searching past chats, provide full message content
// Keep truncation only for canvas/code modes (they don't need history)
```

## Cost Impact

| Scenario | Before | After |
|----------|--------|-------|
| Regular message | ~2-3k tokens | ~2-3k tokens (unchanged) |
| History search (triggered) | Limited recall | Full recall |
| Search frequency | Same | Same (AI decides) |

## Technical Safety

- 500k character budget prevents exceeding model context windows
- Gemini/GPT-5 support 128k-1M tokens, so budget is safe
- Slightly longer search time when searching extensive history

## Files Modified

1. `src/components/VoiceModeController.tsx` - Voice mode search limits
2. `supabase/functions/chat/index.ts` - Backend search limits
