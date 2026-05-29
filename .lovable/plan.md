Add publicly shareable read-only chat links. Owner toggles a share flag on a session, gets a copyable `/share/:sessionId` URL. The page renders the conversation read-only with different chrome based on who's viewing.

## Database

Migration on `chat_sessions`:
- Add `is_public boolean NOT NULL DEFAULT false`
- Add `shared_at timestamptz` (set when first made public, useful for analytics/UI)
- Add a new SELECT RLS policy: `USING (is_public = true)` granted to both `anon` and `authenticated` — lets anyone read a session row when the owner opted in. Existing owner-scoped policies (SELECT/INSERT/UPDATE/DELETE on `auth.uid() = user_id`) stay untouched, so only the owner can toggle the flag, edit messages, or delete.
- Add `GRANT SELECT ON public.chat_sessions TO anon` so the new policy can actually be evaluated for logged-out visitors. Authenticated grants already exist.

Security model: anon can only ever read rows where `is_public = true`. They cannot UPDATE / INSERT / DELETE. The owner is the only one who can flip `is_public` back to false to unshare.

## Routing

Add to `src/App.tsx`:
- `<Route path="/share/:sessionId" element={<SharedChatPage />} />`

## New page: `src/pages/SharedChatPage.tsx`

Flow:
1. Read `sessionId` from URL.
2. Fetch the row directly: `supabase.from('chat_sessions').select('id, title, messages, canvas_content, user_id, is_public').eq('id', sessionId).maybeSingle()`.
3. If row is missing or `is_public` is false → render a friendly "This shared chat isn't available" state with a Home button.
4. If logged in AND `user.id === row.user_id` (owner) → `navigate('/chat/:sessionId', { replace: true })` so they get their full editable experience.
5. Otherwise render the read-only `SharedChatView` (see below).

## New component: `src/components/SharedChatView.tsx`

Reuses the existing message rendering (we already render `Message[]` in `MobileChatApp`/`ChatMessages`; extract the render list or import the existing component in read-only mode — pass `readOnly` so edit/regenerate/copy-style UI that mutates state is suppressed).

Two chrome variants based on `useAuth().user`:

- **Logged-out viewer**: Bare layout. No sidebar, no top bar, no input. Just:
  - Floating top-left Home button → `/` (uses existing Lovable logo style).
  - Title of the chat centered at top.
  - Scrollable read-only message list.
  - Bottom CTA card replacing the input: "Have your own conversation with Arc →" linking to `/`.

- **Logged-in non-owner viewer**: Render the normal chat shell (sidebar, top bar, account hub all available — they're a real user) but:
  - Pass the shared messages into the rendered list instead of the current session.
  - Hide the `ChatInput` dock entirely.
  - In its place, render the same "Have your own conversation with Arc →" CTA button that, on click, navigates to `/` and clears `currentSessionId` so they land on the welcome screen.

## Share toggle UI

In the existing chat sidebar item context menu (where Rename/Delete already live — `MobileChatApp.tsx` sidebar) add a `Share` option:

- Opens a small popover/modal with:
  - Toggle: "Public link" (writes `is_public` + `shared_at = now()` on enable; `is_public = false` on disable).
  - Read-only input showing `${window.location.origin}/share/${sessionId}` + Copy button (with toast).
  - One-liner: "Anyone with the link can read this chat. They can't edit, continue, or see your other chats."
  - Destructive note when toggling off: "Disabling will break any existing share links."

Wire it through `useArcStore` with a new action `setSessionPublic(sessionId, isPublic)` that updates Supabase and the local session row.

## Files to touch / create

- `supabase/migrations/<timestamp>_chat_sessions_public_share.sql` (new)
- `src/App.tsx` — add route
- `src/pages/SharedChatPage.tsx` (new)
- `src/components/SharedChatView.tsx` (new)
- `src/components/ShareChatDialog.tsx` (new) — the toggle + copy-link popover
- `src/components/MobileChatApp.tsx` — add Share entry to the session item menu
- `src/store/useArcStore.ts` — add `setSessionPublic` action; include `is_public` in the session type
- `src/integrations/supabase/types.ts` — regenerated automatically after migration

## Edge cases handled

- Owner visiting their own share URL → silently redirected to their normal `/chat/:id`.
- Unshared / deleted chat → friendly empty state, never a 500.
- Logged-in non-owner clicking the CTA → starts fresh chat from `/`, original shared link still works (nothing mutated).
- RLS prevents any non-owner from updating, deleting, or seeing private chats; the only thing that changes is read access on opted-in rows.