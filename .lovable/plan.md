
## Goal
Make chat history load fast again (especially on mobile) by stopping the app from downloading every chat’s full `messages` JSON on initial sync, while keeping the same “history list + click to open chat” behavior.

## What’s happening (root cause)
Right now `syncFromSupabase()` does:

- `select('*')` from `chat_sessions`
- which includes `messages` (a JSONB array containing entire conversations)
- for every session, every time you open the app on a new device

As your history grows, this becomes a massive payload + slow JSON parsing on the client, so it “loads forever”. This is consistent with “all devices suddenly slow” because every device does the same full download.

The RLS migration you showed only touched `generated_files`, not `chat_sessions`. The slowness is much more likely the “download everything” pattern finally hitting a tipping point.

## Approach (mobile-first + resilient)
### Key idea: “metadata-first, messages-on-demand”
1) Initial sync loads only lightweight session metadata (id/title/updated_at/etc + message count).
2) The app fetches the full `messages` only for:
   - the currently-open session (route `/chat/:sessionId`)
   - or when the user taps a session in the history list

This makes first paint fast and keeps bandwidth low.

---

## Backend changes (Lovable Cloud database)
### A) Add an RPC to list sessions without messages
Create a database function, e.g. `list_chat_sessions_meta(searching_user_id uuid, max_sessions int default 500)` returning:

- `id`
- `title`
- `created_at`
- `updated_at`
- `canvas_content`
- `message_count` = `jsonb_array_length(messages)`
- optional: `last_message_preview` (first ~120 chars of last message content) for nicer tiles

Security:
- `SECURITY DEFINER`
- It must still enforce `WHERE user_id = searching_user_id`
- Grant execute to authenticated users

### B) (Optional) Add a dedicated RPC to fetch one session’s messages
Alternative is a normal select by `id`, but a tiny RPC can:
- return `messages` only
- be consistent and easy to log/optimize

---

## Frontend changes
### 1) Update store data model to support “unhydrated sessions”
In `useArcStore`:
- Extend `ChatSession` to include:
  - `messageCount: number`
  - `isHydrated?: boolean` (or `hasFullMessages?: boolean`)
- Allow `messages` to be empty for sessions not yet opened.

### 2) Rewrite `syncFromSupabase()` to be fast and never hang UI
Changes:
- Replace `.select('*')` with:
  - `supabase.rpc('list_chat_sessions_meta', ...)`
- Immediately populate `chatSessions` with metadata and empty `messages` arrays.
- If there is a `currentSessionId` (from route or state), fetch full messages just for that session next.
- Ensure `isSyncing` is cleared and `syncedUserId` is set in a `finally` block so skeletons can’t get stuck forever.

### 3) Add `hydrateSession(sessionId)` (lazy load messages when needed)
When user opens a chat session:
- If session is not hydrated:
  - fetch messages for that single session
  - update that session in `chatSessions`
  - update `messages` (current chat thread)

### 4) Fix ChatHistoryPanel so it doesn’t rely on `messages.length`
Right now history does:
```ts
.filter(session => session.messages.length > 0)
```
That will hide everything if we don’t prefetch messages.

Update it to use:
- `messageCount > 0` for filtering and badge
- `session.messages.length` only as a fallback

This keeps the history list accurate and instant.

### 5) UX polish for “loading forever”
- Show “Loading chats…” state only for the metadata fetch (which should be quick).
- Show a small inline spinner when opening a chat that’s still hydrating.
- If hydration fails, show a toast with “Retry loading messages” action.

---

## Safety / data integrity considerations
- Keep the existing “merge local-only messages into current session” logic, but only apply it after the current session is hydrated (so we merge into real remote messages, not an empty placeholder).
- Do not change RLS for `chat_sessions` as part of this fix.
- The earlier `generated_files` RLS change will be left as-is unless you explicitly want it reverted; it should not affect chat history.

---

## Implementation steps (what I will do after you approve)
1) Add a database migration that creates `list_chat_sessions_meta` (and optionally `get_chat_session_messages`) + grants execute permission.
2) Update `src/store/useArcStore.ts`:
   - new `hydrateSession()`
   - metadata-first `syncFromSupabase()`
   - robust `finally` cleanup
3) Update `src/components/ChatHistoryPanel.tsx` to use `messageCount` instead of `messages.length`.
4) Update session loading flow so `/chat/:sessionId` triggers hydration for that session if needed.
5) Quick pass on mobile UI states (skeleton -> list -> per-chat hydration spinner) to ensure it feels snappy.

---

## How we’ll verify (end-to-end)
- Fresh reload on mobile: history list appears quickly.
- Open a recent chat: messages load within a moment; UI shows spinner while fetching.
- Switch between chats: previously opened chats are instant (cached in store).
- Manual “Sync from cloud” doesn’t freeze; it refreshes metadata quickly.

## Out of scope (but good later if you want)
- Fully normalize messages into a `chat_messages` table (best long-term scalability, bigger migration).
- Infinite-scroll pagination for history list (nice if you have thousands of sessions).
