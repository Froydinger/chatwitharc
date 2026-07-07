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

## Notes

- Model tiers in the chat picker: Auto, Faster (GPT-5.4 Nano), Fast (GPT-5.4
  Mini), Smart (GPT-5.4), Smartest (GPT-5.5) — defined in
  `src/store/useModelStore.ts`, picker in `src/components/ChatModelPicker.tsx`.
- Accent color: 7 options (`red`, `blue`, `green`, `yellow`, `purple`,
  `orange`, `noir`) defined in `src/hooks/useAccentColor.tsx`, selected in
  `src/components/SettingsPanel.tsx` (Appearance) and quick-switched from the
  sidebar overflow menu in `src/components/RightPanel.tsx`. The default for new
  users is set in `src/store/useAccentStore.ts` (currently `blue`); existing
  users keep whatever is saved in `localStorage` / their Supabase profile.
- Team chats support real-time updates via Supabase channels.
