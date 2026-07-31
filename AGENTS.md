# Project Guide — ArcAI (chatwitharc)

> **⚠️ KEEP IN SYNC:** This guide lives in THREE identical files at the repo
> root — `CLAUDE.md`, `AGENTS.md`, and `CODEX.md` — one per agent tool. If you
> change ANY of them, copy the same change to the other two so they never
> drift. Yes, it's a circle. That's the point.

## Project

`chatwitharc` (ArcAI) is a modern AI-powered app with a glass UI: AI chat,
Canvas (code/prose editor), Deep Search, team chats, memory, scheduled
reminders, music player, and on-device Local AI (Boost feature).

## Tech stack

- **Frontend**: React + TypeScript + Vite (`src/`)
- **Styling**: Tailwind CSS with custom glassmorphism components
- **UI components**: shadcn/ui, Lucide React icons
- **Animations**: Framer Motion
- **State**: Zustand (`useArcStore` for global chat/memory state; `useState`
  for temporary local UI state)
- **Backend**: Supabase (auth, database, storage, edge functions)

## Where changes are made

This repo is **fully self-managed** — Lovable is no longer connected and does
not host or own any part of the stack. Everything is developed and deployed
from here:

- **Frontend** (`src/`) — components, hooks, stores, styles, client-side logic.
- **Supabase Edge Functions** (`supabase/functions/**`) — edit them directly in
  this repo.
- **Database / SQL** — schema changes and migrations are managed from this repo
  as well.

## Branching & deploys

Commit work directly to **`main`** — no feature branches or PRs needed.
**Pushing to `main` deploys**, including edge functions, so treat a push as a
release: make sure changes build cleanly before pushing.

## Common commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run lint` — ESLint

## File organization

- `src/pages/` — full page components
- `src/components/` — reusable UI components
- `src/store/` — Zustand stores
- `src/integrations/` — external service integrations (Supabase client, etc.)
- `src/hooks/` — custom React hooks
- `supabase/functions/` — Supabase edge functions (Deno)

## Stripe payments

- **Checkout mode**: Always use the **Stripe Hosted Checkout redirect flow**
  (`window.location.href = data.url`), never embedded checkout components like
  `@stripe/react-stripe-js`. Hosted checkout is robust, natively handles promo
  codes, and avoids mobile iframe render issues.
- **Type-safe checkout triggers**: Never let React event objects reach
  `openCheckout` as the `priceId` — wrap triggers in a parameterless arrow
  (`onClick={() => openCheckout()}`) or pass a strict string literal.
  `openCheckout` must also sanitize its parameter (filter non-strings) before
  building the Supabase JSON payload, to avoid
  `JSON.stringify cannot serialize cyclic structures` errors.

## Styling guidelines

- Primary/accent color comes from the CSS variable `--primary`; use opacity
  variants like `bg-primary/10`, `text-primary/70`
- Glass UI: use the `glass-card`, `glass-dock`, `glass-shimmer` classes
- Rounded corners: `rounded-2xl` for cards, `rounded-full` for buttons
- Use `motion` / `AnimatePresence` from Framer Motion for animations

## Component patterns

- **ThemedLogo** — Arc's avatar in messages and UI (auto-tints to primary)
- **MessageBubble** — message rendering (text, images, markdown, typewriter)
- **MemoryIndicator** / **ToolsUsedModal** — tool-usage badge and details
- Modals: shadcn `Dialog` with `className="glass-card max-w-md"` on
  `DialogContent`
- Image uploads: Supabase `storage.from("avatars")`, unique paths like
  `${userId}/team-chat-${chatId}-${timestamp}-${random}.ext`, public URLs via
  `getPublicUrl()`, stored as `{ type: "image", url }` attachments
- @mentions: match `/@([\w-]+)/g` and check against profile `display_name`

## Key files

- `src/store/useArcStore.ts` — main chat state management
- `src/components/MessageBubble.tsx` — message rendering
- `src/pages/SharedChatRoomPage.tsx` — team chat implementation
- `src/components/LandingCanvasDemo.tsx` — landing page demos (real UI
  simulation with Framer Motion)
- `supabase/functions/chat/index.ts` — main chat edge function (tools,
  scheduling, notifications)

## App Builder & Sandbox Preview (`/build`)

- **Agentic Sandbox Compiler**: Compiles React (TSX/JSX) and styles with Tailwind CSS, Lucide React, Framer Motion, and React Icons.
- **Routing**: Shims standard `react-router-dom` imports to the official UMD build of React Router DOM v6 under the hood. All browser routing (like `BrowserRouter`) is automatically mapped to `HashRouter` inside the iframe.
- **Sandbox Previews**: Rendered using a `srcDoc` iframe. An `onLoad` handler catches full-page navigations (preventing the parent app from loading inside the preview panel) and forces the iframe to reload via a state `key` trigger.
- **App Builder Limitations**:
  - Frontend-only: There is no server-side Node.js/Python database logic.
  - Storage: Previews share the host origin's localStorage space. Prototyped database state must be client-side and should prefix localStorage keys to prevent cross-app contamination.

## Video generation (Sora 2)

- **Private, not a plan feature.** Access is a hard **email allowlist**, not
  Boost — the provider shuts down 2026-09-24, so this isn't sold to anyone.
  The list lives in THREE places that must match: `public.user_can_generate_video`
  (the latest forward migration), `supabase/functions/generate-video/index.ts`,
  and `src/hooks/useVideoAccess.tsx`. The server copies are the real gate; the
  client copy only decides whether UI is offered. For accounts without access the feature
  is *invisible* — the Animate button doesn't render and video phrasing falls
  through to normal chat rather than surfacing an upsell.
- Metered in **seconds** (not clips) because the provider bills per second —
  $0.10/s at 720p. Currently **60s/day**, which is a runaway-spend guard
  (~$6.00/day ceiling), not a fairness rule. Unlike the image quota, **admins
  are metered too** — an unmetered path to a per-second billed API is exactly
  what's worth capping. Failed renders refund the reservation.
- **Durations**: the API only accepts `4`, `8` or `12` — 3 and 5 return a 400.
  Product cap is 4s ($0.40), set by `MAX_SECONDS` in BOTH
  `supabase/functions/generate-video/index.ts` and
  `src/store/useVideoGenStore.ts`. Change them together.
- **Sizes**: only `1280x720` and `720x1280`. Image-to-video requires the first
  frame to match that size exactly, so `generate-video` cover-crops the source
  still before upload.
- **Videos are never stored server-side.** No Postgres bytes, no Supabase
  Storage, no R2 — the job row is text only. The MP4 streams from the provider
  through `video-content` straight into the browser's IndexedDB
  (`src/lib/videoStorage.ts`). On another device, or after a cache clear,
  `VideoAttachment` renders a "no longer available" placeholder. The UI must
  keep saying clips are device-local.
- **Provider is swappable on purpose**: everything vendor-specific lives in
  `supabase/functions/_shared/videoProvider.ts`. OpenAI deprecated the Videos
  API on 2026-03-24 and removes `sora-2*` on **2026-09-24** with no announced
  successor — when that lands, write a new provider object and repoint
  `getVideoProvider()`.
- Polling is client-driven: `video-job-status` forwards each client poll to the
  provider, so no long-running background task can be killed by an edge
  timeout. Provider content is only fetchable for ~1 hour after a render, so
  `pollVideoJob` downloads immediately on completion.

## Notes

- Chat models in the picker use their real GPT-5.6 names (no in-house tier
  names): Auto, Luna (`gpt-5.6-luna`, moon icon), Terra (`gpt-5.6-terra`,
  earth icon), Sol (`gpt-5.6-sol`, sun icon, Boost-gated) — defined in
  `src/store/useModelStore.ts`, picker in `src/components/ChatModelPicker.tsx`.
  Retired GPT-5.4/5.5 ids are alias-mapped in `LEGACY_MODEL_MAP` (client) and
  `legacyModelMap` in `supabase/functions/chat/index.ts` (server).
- **Luna is the base model everywhere** — the entire GPT-5.4 line (including
  Nano, formerly branded "Astro") is retired and must not be reintroduced.
  Luna is the server default, the Auto floor for simple + moderate chat, and
  the dedicated model for memory/recall, chat naming, prompt enhancement, and
  the `generate-*-prompts` edge functions. Note Luna is a `gpt-5.6` reasoning
  model, so calls must send `reasoning_effort` instead of `temperature`.
- Accent color: 7 options (`red`, `blue`, `green`, `yellow`, `purple`,
  `orange`, `noir`) defined in `src/hooks/useAccentColor.tsx`, selected in
  `src/components/SettingsPanel.tsx` (Appearance) and quick-switched from the
  sidebar overflow menu in `src/components/RightPanel.tsx`. The default for new
  users is set in `src/store/useAccentStore.ts` (currently `blue`); existing
  users keep whatever is saved in `localStorage` / their Supabase profile.
- Team chats support real-time updates via Supabase channels.
