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
**Pushing to `main` deploys**, including edge functions **and SQL migrations in
`supabase/migrations/`**, so treat a push as a release: make sure changes build
cleanly before pushing.

Migrations apply automatically. This runs through Supabase's own GitHub
integration, which is configured in the Supabase dashboard rather than in this
repo — so there is no workflow file to find, and the absence of `.github/` does
NOT mean migrations need applying by hand. Netlify only builds the frontend; it
is not the thing deploying edge functions or migrations.

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

## App Builder (hidden — do not surface it)

The App Builder / IDE is **fully hidden**, not "coming soon". It is being
rebuilt, and advertising it was actively unwanted. Nothing user-facing may
mention, link, or promise it — no nav entry, no tool tile, no docs article, no
FAQ, no SEO copy, and nothing in any model prompt (`supabase/functions/chat`,
`src/services/ai.ts`, the voice prompts). `/build` redirects to `/` and is not
a chat command.

The underlying code still exists for the rebuild: `AppsPanel.tsx` and
`AppsPage.tsx` (both now unreferenced), `IDEArtifactCard.tsx` for legacy saved
artifacts, and the `cloud-ide` route in `src/utils/routeRequest.ts`. Leave them
alone; just do not link anything to them.

## Video generation (disabled)

- No video provider is enabled. `getVideoProvider()` returns null, and new
  requests stop before job creation, quota reservation, or provider calls.
- Video controls are hidden for all accounts. Do not market video generation.
- Keep the provider-neutral contract in `_shared/videoProvider.ts` for a future
  integration. No replacement provider is configured yet.
- Preserve the existing server allowlist, 60 seconds/day quota (including
  admins), 4-second cap, and failed-render refunds for any future integration.
- Old unfinished jobs return a terminal failure and release reservations.
- Saved videos remain device-local in IndexedDB. Do not delete them or add
  server-side video storage. Existing attachment playback must keep working.

## Blog SEO / AEO prerender

`npm run build` runs `vite build` then `scripts/prerender.mjs`. The app is a
client-rendered SPA, so without this step every `/blog/*` URL returned the same
shell — Googlebot executes JS and recovered the page, but GPTBot, OAI-SearchBot,
ClaudeBot and PerplexityBot did not, making all the posts invisible to answer
engines.

The script bundles `src/content/blog/posts.ts` through Vite's own build API (no
extra deps) and writes a flat static page per post to `dist/_prerender/`, with
the real title, description, canonical, OG tags and the Article + FAQPage +
BreadcrumbList JSON-LD. Crawler copy goes in the offscreen `#aeo-static` block
that `index.html` already uses, so nothing changes visually.

Two things that will bite you:

- **Flat files, never `<route>/index.html`.** Netlify answers a directory
  request with a 301 to the trailing-slash form, and that runs *before* custom
  rules — which would make every extensionless URL in `sitemap.xml` redirect.
- **The generated `netlify.toml` block must be committed.** Netlify reads that
  file before the build runs, so the rewrites cannot be produced by the build
  that needs them. Add or rename a post and the build fails on purpose: rerun
  `npm run build`, commit the regenerated `netlify.toml`, then push.

Add a post to `src/content/blog/posts.ts` and also add it to
`public/sitemap.xml` — the sitemap is not generated.

## Structured data

Do not add `aggregateRating` (or any review markup) unless it is backed by
real collected reviews. A previous hardcoded 4.8/150 was removed: self-serving
review markup risks a manual action against the rich results the site earns.

## Notes

- **Luna is the only text/reasoning model for now.** The picker exposes Auto,
  Quick, Balanced, and Deep. Quick, Balanced, and Deep map to `low`, `medium`,
  and `high` `reasoning_effort`; Auto starts at Quick and steps up for clearly
  harder requests. All use `gpt-5.6-luna`. Old Terra, Sol, GPT-5.4, and GPT-5.5
  selections normalize to Luna on both client and server so stale sessions keep
  working. Specialized image, realtime voice, video, and search provider models
  remain separate. Luna calls use `reasoning_effort`, never `temperature`.
- **Accent color: Noir only.** Arc went black-and-white a long time ago and
  accent selection is retired — there is no picker to add colors back to.
  `useAccentStore.ts` force-writes `noir` to `localStorage` on every start, so
  legacy saved colors normalize themselves. The other palettes still sit in
  `accentColorConfigs` in `src/hooks/useAccentColor.tsx` and the `AccentColor`
  union still lists them; that is dead config, NOT a live feature. Do not
  reintroduce a color picker, and do not treat those entries as evidence one
  exists. (This section previously claimed 7 selectable colors defaulting to
  `blue`, which sent an agent chasing a non-existent regression.)
- Team chats support real-time updates via Supabase channels.
