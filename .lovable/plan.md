## Goal

Anonymous visitors land directly on the chat screen (no more `LandingScreen`). They can send plain-text chat messages immediately. Any premium action (menus, music, tool use, personas, voice, image gen, file upload, research, code, canvas, etc.) opens the sign-in modal — which also pitches Boost ($7/mo). A dismissible Boost CTA banner sits above the chat input.

## Backend changes

1. **Enable anonymous sign-ins** in Supabase auth (`external_anonymous_users_enabled: true`).
2. **`useAuth` hook**: on app boot, if no session, call `supabase.auth.signInAnonymously()` so anon users have a JWT for the chat edge function. Expose `isAnonymous = !!user?.is_anonymous`.
3. **`chat` edge function**: read `data.claims.is_anonymous`. If true, hard-strip premium request flags before processing:
   - Force model to default Gemini Flash
   - Reject `forceCode`, `forceCanvas`, `personaId`, `tools`, `research`, `images`, `attachments`, `voice`
   - Cap message length / count even tighter (e.g. 10 msgs/session)
   - Return 200 with a friendly inline "sign in to unlock" assistant message if any premium flag was sent
4. **No DB writes for anonymous chats**: `useChatSync` skips inserts/upserts when `isAnonymous`. Sessions live in `localStorage` only (existing store already persists locally).
5. **On real sign-in**: discard the anon session (don't migrate messages — fresh slate, matches GPT behavior).

## Frontend changes

### `src/pages/Index.tsx`
- Delete the `if (!user) return <LandingScreen />` branch.
- All users (anon + real) go through `MobileChatApp`.
- Keep `pending-prompt` migration logic for the rare race.

### New hook `src/hooks/useRequireAuth.ts`
```ts
const requireAuth = useRequireAuth();
requireAuth("music", () => openMusic());   // calls callback if real user, else opens AuthModal with feature label
```
Sets a global `auth-gate-feature` event picked up by `AuthModal`.

### `src/components/AuthModal.tsx`
- Accept optional `gatedFeature` prop ("music", "personas", "tools", "voice", "image-gen", "menu", "research", "code", "files").
- Show a contextual headline: *"Sign in to use {feature}"*.
- Add a **Boost CTA card** beneath the sign-in buttons:
  > **Unlock everything with Boost — $7/mo**
  > Personas · Voice mode · Image gen · Research · Code & Canvas · Music · File uploads
  > [Start free trial]
- Listen for the `auth-gate-feature` event so any gated click anywhere opens the modal pre-themed.

### `src/components/MobileChatApp.tsx` & `src/components/RightPanel.tsx`
- Wrap sidebar tabs (history, canvases, ideas, quote, dashboard, account, settings, etc.) with `requireAuth("menu", …)` for anon users.
- The accent/theme overflow stays open (low-risk UX).

### `src/components/ChatInput.tsx`
- Tool/slash menu, persona picker, mic button, image, file upload, research, code, canvas — each gated with `requireAuth(featureKey, …)` when anon.
- `handleSend`: allow plain text only when anon; if any attachment/tool/persona state is set, route to `requireAuth` instead.
- Add a small inline pill above the input for anon users:
  > *"Free chat · Sign in to unlock everything →"* (dismissible per-session)

### `src/components/MusicPopup.tsx` (and GlobalMusicPlayer trigger)
- Opening the popup as anon → `requireAuth("music", …)`.

### New `src/components/BoostCtaBanner.tsx`
- Pinned above the chat input area for anon users only.
- Dismissible (`sessionStorage` key `arcai-anon-boost-dismissed`).
- Text: *"You're chatting as a guest. Sign in free — or go Boost ($7/mo) to unlock personas, image gen, voice, research & more."*
- Two buttons: `Sign in` (opens AuthModal) · `Get Boost` (opens AuthModal with gatedFeature="boost", post-signup auto-fires `open-upgrade-modal`).

### Cleanup
- `LandingScreen.tsx`, `LandingChatInput.tsx`, `LandingVoiceDemo.tsx`, `LandingCanvasDemo.tsx` stay in repo (in case we want them back) but no longer imported. Index.tsx no longer references them.

## Files touched

- `supabase/functions/chat/index.ts` — anon flag gating
- Auth config (`external_anonymous_users_enabled: true`)
- `src/pages/Index.tsx`
- `src/hooks/useAuth.tsx` — auto anon sign-in, `isAnonymous`
- `src/hooks/useRequireAuth.ts` *(new)*
- `src/components/AuthModal.tsx` — gated-feature mode + Boost CTA card
- `src/components/BoostCtaBanner.tsx` *(new)*
- `src/components/MobileChatApp.tsx` — banner + sidebar gates
- `src/components/RightPanel.tsx` — tab gates
- `src/components/ChatInput.tsx` — per-feature gates, anon send path
- `src/components/MusicPopup.tsx` / music trigger — gate
- `src/hooks/useChatSync.ts` — skip DB writes for anon

## Memory updates after build

- New memory: `mem://features/anonymous-guest-mode` documenting anon flow & gating matrix.
- Update `mem://features/guest-mode-removal` (currently says guest disabled) — replace with the new guest model.
- Update core: landing-page constraint memory is now obsolete; remove landing-only logic note.

## Out of scope

- Migrating anon chat history to a real account after sign-in (intentionally not done — matches the user's GPT-like behavior request).
- Changes to onboarding flow for real users.
